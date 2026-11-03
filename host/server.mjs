

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { appDataDir, ensureDir, openExternal, resolvePath, safeJoin, slugify } from './util.mjs';
import { config, saveConfig, outputDir, sessions, clearSessions, displayName } from './store.mjs';
import { getSecret, setSecret, listSecretNames, clearSecrets, maskSecret } from './secrets.mjs';
import { PROVIDERS, GROUPS, getProvider, publicProvider, testProvider, listModels } from './providers.mjs';
import { runChecks, installItem } from './setup.mjs';
import { localSnapshot, pullModel } from './localai.mjs';
import { createJob, getJob, listJobs, bus, emit, log, approveJob, cancelJob } from './jobs.mjs';
import { runPipeline } from './pipeline.mjs';
import { APP_NAME, VERSION } from './util.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_DIR = path.resolve(__dirname, '..', 'ui');
const ART_FILE = () => path.join(appDataDir(), 'logo-art.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const TARGETS = new Set(['site', 'app', 'game', 'other']);

function cookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req, limit = 3 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('Request body too large.'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch {
        resolve({ raw: text });
      }
    });
    req.on('error', reject);
  });
}

function serveFile(res, file, { download = false } = {}) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    json(res, 404, { error: 'Not found.' });
    return;
  }
  if (stat.isDirectory()) {
    json(res, 404, { error: 'Not a file.' });
    return;
  }
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, {
    'content-type': type,
    'content-length': stat.size,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  fs.createReadStream(file).pipe(res);
  void download;
}

function statePayload() {
  const c = config();
  const provider = getProvider(c.provider.id || 'none');
  return {
    version: VERSION,
    app: APP_NAME,
    setupComplete: c.setupComplete,
    theme: c.theme,
    target: c.target,
    outputDir: outputDir(),
    model: {
      id: c.provider.id,
      name: provider.name,
      model: c.provider.model,
      label: displayName(provider, c.provider.model),
      ready: Boolean(c.provider.id && c.provider.id !== 'none' && c.provider.model),
      hasKey: listSecretNames().includes(`provider:${c.provider.id}`),
    },

    keyed: listSecretNames()
      .filter((n) => n.startsWith('provider:'))
      .map((n) => n.slice('provider:'.length)),
    providers: [GROUPS.free, GROUPS.cloud, GROUPS.custom].map((g) => ({ ...g, items: [] })),
    sessions: sessions().slice(0, 12),
    autoApprove: c.autoApprove,
  };
}

async function handleApi(req, res, url, token) {
  const method = req.method || 'GET';
  const route = url.pathname;
  const q = url.searchParams;

  if (route === '/api/state' && method === 'GET') {
    const payload = statePayload();
    payload.catalog = PROVIDERS.map(publicProvider);
    payload.groups = GROUPS;
    json(res, 200, payload);
    return;
  }

  if (route === '/api/theme' && method === 'POST') {
    const body = await readBody(req);
    const theme = body.theme === 'light' ? 'light' : 'dark';
    saveConfig({ theme });
    json(res, 200, { ok: true, theme });
    return;
  }

  if (route === '/api/target' && method === 'POST') {
    const body = await readBody(req);
    if (!TARGETS.has(body.target)) return json(res, 400, { error: 'Unknown target kind.' });
    saveConfig({ target: body.target });
    json(res, 200, { ok: true, target: body.target });
    return;
  }

  if (route === '/api/config' && method === 'POST') {
    const body = await readBody(req);
    const patch = {};
    if (body.outputDir) patch.outputDir = resolvePath(body.outputDir);
    if (typeof body.autoApprove === 'boolean') patch.autoApprove = body.autoApprove;
    if (body.recon) patch.recon = body.recon;
    saveConfig(patch);
    json(res, 200, { ok: true, state: statePayload() });
    return;
  }

  if (route === '/api/provider/select' && method === 'POST') {
    const body = await readBody(req);
    const provider = getProvider(body.providerId);
    if (body.apiKey !== undefined && body.apiKey !== '') setSecret(`provider:${provider.id}`, body.apiKey);
    if (body.apiKey === null) setSecret(`provider:${provider.id}`, '');
    saveConfig({
      provider: {
        id: provider.id,
        model: body.model || provider.models[0] || '',
        baseUrl: body.baseUrl !== undefined ? body.baseUrl : provider.baseUrl,
        extra: body.extra || {},
      },
    });
    json(res, 200, { ok: true, state: statePayload() });
    return;
  }

  if (route === '/api/provider/test' && method === 'POST') {
    const body = await readBody(req);
    const provider = getProvider(body.providerId);
    const key = body.apiKey || getSecret(`provider:${provider.id}`) || null;
    try {
      const result = await testProvider({
        providerId: provider.id,
        apiKey: key,
        baseUrl: body.baseUrl || provider.baseUrl,
        extra: body.extra || {},
        model: body.model || provider.models[0],
      });
      json(res, 200, { ok: true, ...result, provider: provider.name });
    } catch (e) {
      json(res, 200, { ok: false, error: e.message });
    }
    return;
  }

  if (route === '/api/provider/models' && method === 'GET') {
    const provider = getProvider(q.get('providerId') || config().provider.id);
    const key = getSecret(`provider:${provider.id}`) || null;
    try {
      const models = await listModels({
        providerId: provider.id,
        apiKey: key,
        baseUrl: q.get('baseUrl') || provider.baseUrl,
        extra: config().provider.extra || {},
      });
      json(res, 200, { ok: true, models });
    } catch (e) {
      json(res, 200, { ok: false, error: e.message, models: provider.models });
    }
    return;
  }

  if (route === '/api/secrets' && method === 'GET') {
    json(res, 200, { names: listSecretNames().map((n) => n.replace('provider:', '')), masked: listSecretNames().map((n) => ({ id: n.replace('provider:', ''), value: maskSecret(getSecret(n)) })) });
    return;
  }

  if (route === '/api/secrets/clear' && method === 'POST') {
    clearSecrets();
    json(res, 200, { ok: true });
    return;
  }

  if (route === '/api/setup/check' && (method === 'GET' || method === 'POST')) {
    const items = await runChecks({ quick: q.get('quick') === '1' });
    json(res, 200, { items });
    return;
  }

  if (route === '/api/setup/install' && method === 'POST') {
    const body = await readBody(req);
    const job = createJob({ type: 'install', title: `install ${body.id}` });
    json(res, 200, { jobId: job.id });
    installItem(body.id, (level, text) => log(job, level, text))
      .then((r) => {
        job.status = r.ok ? 'done' : 'error';
        emit(
          job,
          r.ok ? 'done' : 'error',
          r.ok ? { message: `${body.id} installed.` } : { message: `${body.id} install failed${r.reason ? `: ${r.reason}` : ` (exit ${r.code})`}` }
        );
      })
      .catch((e) => {
        job.status = 'error';
        emit(job, 'error', { message: e.message });
      });
    return;
  }

  if (route === '/api/setup/complete' && method === 'POST') {
    const body = await readBody(req);
    const patch = { setupComplete: true };
    if (body.theme) patch.theme = body.theme === 'light' ? 'light' : 'dark';
    if (TARGETS.has(body.target)) patch.target = body.target;
    saveConfig(patch);
    json(res, 200, { ok: true, state: statePayload() });
    return;
  }

  if (route === '/api/local' && method === 'GET') {
    json(res, 200, await localSnapshot());
    return;
  }

  if (route === '/api/local/pull' && method === 'POST') {
    const body = await readBody(req);
    const job = createJob({ type: 'pull', title: `pull ${body.model}` });
    json(res, 200, { jobId: job.id });
    pullModel(body.model, (level, text) => log(job, level, text))
      .then(() => {
        job.status = 'done';
        emit(job, 'done', { message: `${body.model} is ready.` });
      })
      .catch((e) => {
        job.status = 'error';
        emit(job, 'error', { message: e.message });
      });
    return;
  }

  if (route === '/api/session' && method === 'POST') {
    const body = await readBody(req);
    const prompt = String(body.prompt || '').trim();
    if (prompt.length < 2) return json(res, 400, { error: 'Tell me what to recreate.' });
    const kind = TARGETS.has(body.kind) ? body.kind : config().target;
    const job = createJob({ type: 'session', prompt, kind });
    json(res, 200, { jobId: job.id, kind });
    runPipeline(job, { prompt, kind, url: body.url || null, autoApprove: Boolean(body.autoApprove) }).catch((e) => {
      emit(job, 'error', { message: e.message });
    });
    return;
  }

  if (route === '/api/approve' && method === 'POST') {
    const body = await readBody(req);
    const ok = approveJob(body.jobId, body.accepted !== false, body.note || '');
    json(res, ok ? 200 : 409, ok ? { ok: true } : { error: 'Nothing waiting for approval.' });
    return;
  }

  if (route === '/api/cancel' && method === 'POST') {
    const body = await readBody(req);
    const ok = cancelJob(body.jobId);
    json(res, 200, { ok });
    return;
  }

  if (route === '/api/jobs' && method === 'GET') {
    json(res, 200, { jobs: listJobs().slice(-20) });
    return;
  }

  if (route === '/api/job' && method === 'GET') {
    const job = getJob(q.get('id') || '');
    if (!job) return json(res, 404, { error: 'No such job.' });
    json(res, 200, { id: job.id, status: job.status, phase: job.phase, events: job.events.slice(-200) });
    return;
  }

  if (route === '/api/stream' && method === 'GET') {
    const jobId = q.get('job') || '';
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write('retry: 1500\n\n');
    const job = getJob(jobId);
    if (job) {
      for (const evt of job.events.slice(-300)) res.write(`data: ${JSON.stringify(evt)}\n\n`);
    }
    const onEvent = (evt) => {
      if (jobId && evt.jobId !== jobId) return;
      res.write(`data: ${JSON.stringify(evt)}\n\n`);
    };
    bus.on('event', onEvent);
    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => {
      clearInterval(ping);
      bus.off('event', onEvent);
    });
    return;
  }

  if (route === '/api/art' && method === 'POST') {
    const body = await readBody(req, 12 * 1024 * 1024);
    const html = String(body.html || body.raw || '');
    let art = body.art && Array.isArray(body.art.cells) && body.art.cells.length ? body.art : null;
    if (!art) {
      if (!html.trim()) return json(res, 400, { error: 'Paste or drop an ascii-art .html file.' });
      art = parseArtHtml(html);
    }
    if (!art.cells.length) return json(res, 400, { error: 'No coloured <span> grid found in that file.' });
    ensureDir(path.dirname(ART_FILE()));
    fs.writeFileSync(ART_FILE(), JSON.stringify(art));
    json(res, 200, { ok: true, cols: art.cols, rows: art.rows, cells: art.cells.length });
    return;
  }

  if (route === '/api/art' && method === 'GET') {
    try {
      const art = JSON.parse(fs.readFileSync(ART_FILE(), 'utf8'));
      return json(res, 200, art);
    } catch {
      return json(res, 200, { cols: 0, rows: 0, cells: [] });
    }
  }

  if (route === '/api/art' && method === 'DELETE') {
    try {
      fs.rmSync(ART_FILE(), { force: true });
    } catch {}
    json(res, 200, { ok: true });
    return;
  }

  if (route === '/api/sessions' && method === 'GET') {
    json(res, 200, { sessions: sessions() });
    return;
  }

  if (route === '/api/sessions' && method === 'DELETE') {
    clearSessions();
    json(res, 200, { ok: true, sessions: [] });
    return;
  }

  if (route === '/api/open' && method === 'POST') {
    const body = await readBody(req);
    const target = String(body.target || '').trim();
    if (!target) return json(res, 400, { error: 'Nothing to open.' });
    if (/^https?:\/\//i.test(target)) {
      openExternal(target);
      return json(res, 200, { ok: true });
    }
    const resolved = path.isAbsolute(target) ? target : path.resolve(outputDir(), target);
    if (!fs.existsSync(resolved)) return json(res, 404, { error: 'That path does not exist anymore.' });
    openExternal(resolved);
    json(res, 200, { ok: true });
    return;
  }

  if (route === '/api/quit' && method === 'POST') {
    json(res, 200, { ok: true });
    setTimeout(() => process.exit(0), 120);
    return;
  }

  json(res, 404, { error: `No route ${method} ${route}` });
  return;
}

export function parseArtHtml(html) {
  const pre = /<pre[^>]*>([\s\S]*?)<\/pre>/i.exec(html);
  const source = pre ? pre[1] : html;
  const rows = [[]];
  const tokenRe =
    /<span[^>]*color:\s*rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)[^>]*>([\s\S]*?)<\/span>|<br\s*\/?>|(\r?\n)/gi;
  let m;
  while ((m = tokenRe.exec(source))) {
    if (m[1] !== undefined) {
      const hex = `#${[1, 2, 3].map((i) => Number(m[i]).toString(16).padStart(2, '0')).join('')}`;
      const filled = String(m[4] || '').replace(/<[^>]*>/g, '').trim().length > 0;
      rows[rows.length - 1].push(filled ? hex : '');
    } else {
      rows.push([]);
    }
  }
  while (rows.length && rows[0].length === 0) rows.shift();
  while (rows.length && rows[rows.length - 1].length === 0) rows.pop();
  const cols = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const cells = new Array(cols * rows.length).fill('');
  rows.forEach((row, r) => row.forEach((hex, c) => (cells[r * cols + c] = hex)));
  return { cols, rows: rows.length, cells, savedAt: new Date().toISOString() };
}

export function createServer({ token }) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname);

    try {

      if (pathname.startsWith('/api/')) {
        const provided = req.headers['x-ps-token'] || cookie(req, 'ps_token') || url.searchParams.get('t');
        if (provided !== token) return json(res, 401, { error: 'Unauthorized.' });
        await handleApi(req, res, url, token);
        return;
      }

      if (pathname.startsWith('/out/')) {
        const rel = pathname.slice('/out/'.length);
        const root = outputDir();
        const file = safeJoin(root, rel);
        return serveFile(res, file);
      }

      const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const file = safeJoin(UI_DIR, rel);
      if (!fs.existsSync(file)) return json(res, 404, { error: 'Not found.' });
      if (pathname === '/' || pathname === '/index.html') {
        const html = fs.readFileSync(file, 'utf8');
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'set-cookie': `ps_token=${token}; Path=/; SameSite=Strict`,
        });
        res.end(html);
        return;
      }
      return serveFile(res, file);
    } catch (e) {
      if (!res.headersSent) json(res, 500, { error: e.message });
      else res.end();
    }
  });
  server.on('clientError', (err, socket) => {
    try {
      socket.destroy();
    } catch {}
  });
  return server;
}

export { slugify, crypto };
