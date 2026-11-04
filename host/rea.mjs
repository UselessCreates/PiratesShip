

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function nodeSupportsRea(version = process.version) {
  const [maj, min, pat] = version
    .replace(/^v/, '')
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0);
  if (maj === 22) return min > 23 || (min === 23 && pat >= 4);
  if (maj === 24) return min > 22 || (min === 22 && pat >= 1);
  if (maj === 26) return min > 12 || (min === 12 && pat >= 1);
  return maj > 26;
}

export function findRea() {
  const win = process.platform === 'win32';
  const names = win ? ['rea.cmd', 'rea.exe', 'rea-agents.cmd', 'rea'] : ['rea', 'rea-agents'];
  const dirs = String(process.env.PATH || '').split(path.delimiter).filter(Boolean);
  if (win && process.env.APPDATA) dirs.unshift(path.join(process.env.APPDATA, 'npm'));
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      try {
        if (fs.existsSync(candidate)) return candidate;
      } catch {

      }
    }
  }
  return null;
}

function invocation(bin, args) {
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin)) {
    const comspec = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
    return { cmd: comspec, args: ['/d', '/s', '/c', bin, ...args] };
  }
  return { cmd: bin, args };
}

const CLIENT_INFO = { name: 'PiratesShip', version: '1.0.0' };

class McpStdio {
  constructor(child) {
    this.child = child;
    this.buf = '';
    this.nextId = 1;
    this.pending = new Map();
    this.raw = [];
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => this.onData(chunk));
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      const line = String(chunk).trim();
      if (line) this.raw.push(line.slice(0, 300));
      if (this.raw.length > 40) this.raw.shift();
    });
    child.on('exit', (code) => {
      for (const [, p] of this.pending) p.reject(new Error(`rea mcp exited (code ${code})`));
      this.pending.clear();
    });
  }

  onData(chunk) {
    this.buf += chunk;
    for (;;) {

      if (/^Content-Length:/i.test(this.buf)) {
        const split = this.buf.indexOf('\r\n\r\n');
        if (split === -1) return;
        const len = Number(/Content-Length:\s*(\d+)/i.exec(this.buf.slice(0, split))?.[1] || 0);
        const body = this.buf.slice(split + 4);
        if (body.length < len) return;
        this.buf = body.slice(len);
        this.onMessage(body.slice(0, len));
        continue;
      }
      const nl = this.buf.indexOf('\n');
      if (nl === -1) return;
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (!line) continue;
      this.onMessage(line);
    }
  }

  onMessage(text) {
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (msg.id === undefined || msg.id === null) return;
    const waiter = this.pending.get(msg.id);
    if (!waiter) return;
    this.pending.delete(msg.id);
    if (msg.error) waiter.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
    else waiter.resolve(msg.result);
  }

  send(payload) {
    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  notify(method, params) {
    this.send({ jsonrpc: '2.0', method, params });
  }

  request(method, params, timeoutMs) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.send({ jsonrpc: '2.0', id, method, params });
    });
  }

  close() {
    try {
      this.child.stdin.end();
    } catch {}

    try {
      if (process.platform === 'win32' && this.child.pid) {
        spawn('taskkill', ['/PID', String(this.child.pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        });
      } else {
        this.child.kill();
      }
    } catch {}
  }
}

function websiteScore(tool) {
  const hay = `${tool.name} ${tool.description || ''}`.toLowerCase();
  if (/android|apk|adb|firmware|ghidra|hopper|ida|jeb|sqlite|wasm|evm|pcap|packet|signal/.test(hay)) return -1;
  let score = 0;
  if (/website|web site|webpage|browser/.test(hay)) score += 6;
  if (/url|http|page/.test(hay)) score += 3;
  if (/analy[sz]e|inspect|observ|capture|snapshot/.test(hay)) score += 2;
  if (/tool/.test(hay)) score += 0;
  return score;
}

function buildArgs(schema, url) {
  const props = (schema && schema.properties) || {};
  const required = Array.isArray(schema && schema.required) ? schema.required : [];
  const args = {};
  const leftovers = [];
  for (const key of required) {
    const spec = props[key] || {};
    const enumVals = spec.enum || spec.items?.enum;
    if (/url|href|target|address|site|origin/i.test(key)) args[key] = url;
    else if (enumVals && enumVals.length) args[key] = enumVals[0];
    else if (spec.type === 'boolean') args[key] = false;
    else if (spec.type === 'number' || spec.type === 'integer') args[key] = spec.minimum ?? 0;
    else if (spec.type === 'array') args[key] = [];
    else if (/screenshot|shot|image/i.test(key)) args[key] = true;
    else leftovers.push(key);
  }

  if (props.screenshots && props.screenshots.type === 'boolean') args.screenshots = true;
  if (props.includeScreenshots && props.includeScreenshots.type === 'boolean') args.includeScreenshots = true;
  return { args, leftovers };
}

function flatten(result, limit = 9000) {
  const chunks = [];
  if (result && Array.isArray(result.content)) {
    for (const part of result.content) {
      if (part && part.type === 'text' && part.text) chunks.push(part.text);
      else if (part && part.type === 'image') chunks.push('[screenshot returned]');
    }
  }
  if (result && result.structuredContent) {
    try {
      chunks.push(JSON.stringify(result.structuredContent, null, 1));
    } catch {}
  }
  const text = chunks.join('\n').trim();
  return text.length > limit ? `${text.slice(0, limit)}\n[rea output truncated]` : text;
}

function probe(bin) {
  return new Promise((resolve) => {
    const { cmd, args } = invocation(bin, ['--version']);
    let out = '';
    let err = '';
    let child;
    try {
      child = spawn(cmd, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        env: { ...process.env, NO_COLOR: '1' },
      });
    } catch (e) {
      resolve({ ok: false, error: e.message });
      return;
    }
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      resolve({ ok: false, error: 'rea --version timed out' });
    }, 12000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => {
      out += d;
    });
    child.stderr.on('data', (d) => {
      err += d;
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, error: e.message });
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      const text = `${out}${err}`.trim();
      const first = text.split('\n')[0].trim().slice(0, 200);
      resolve(code === 0 ? { ok: true, version: first || 'rea' } : { ok: false, error: first || `exit ${code}` });
    });
  });
}

export async function reaStatus(explicitBin) {
  const bin = explicitBin || findRea();
  if (!bin) return { available: false, reason: 'rea is not installed (npm install --global rea-agents)' };
  const result = await probe(bin);
  if (result.ok) return { available: true, bin, version: result.version, reason: null };
  const note = nodeSupportsRea()
    ? ''
    : ` (engine runs Node ${process.version}; REA needs 22.23.4+ / 24.22.1+ / 26.12.1+)`;
  return { available: false, bin, reason: `rea is installed but will not start${note}: ${result.error}` };
}

export async function analyzeWebsite(url, { timeoutMs = 180000, signal, log = () => {}, bin: explicitBin } = {}) {
  const started = Date.now();

  const status = explicitBin ? { available: true, bin: explicitBin } : await reaStatus();
  if (!status.available) {
    log('dim', `REA skipped — ${status.reason}`);
    return { ok: false, available: false, reason: status.reason, ms: 0 };
  }
  if (!url) return { ok: false, available: true, reason: 'no URL to analyse', ms: 0 };

  const { cmd, args } = invocation(status.bin, ['mcp']);
  let child;
  try {
    child = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,

        REA_MCP_INPUT_SCHEMA_PROFILE: process.env.REA_MCP_INPUT_SCHEMA_PROFILE || 'full',
        REA_MCP_OUTPUT_SCHEMA_PROFILE: process.env.REA_MCP_OUTPUT_SCHEMA_PROFILE || 'off',
        NO_COLOR: '1',
      },
    });
  } catch (e) {
    return { ok: false, available: true, reason: `could not start rea mcp: ${e.message}`, ms: Date.now() - started };
  }

  const client = new McpStdio(child);
  const abort = () => client.close();
  if (signal) signal.addEventListener('abort', abort, { once: true });

  try {
    await client.request(
      'initialize',
      {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: CLIENT_INFO,
      },
      30000
    );
    client.notify('notifications/initialized', {});

    const list = await client.request('tools/list', {}, 30000);
    const tools = Array.isArray(list?.tools) ? list.tools : [];
    log('dim', `REA advertises ${tools.length} tool(s)`);

    const ranked = tools
      .map((t) => ({ tool: t, score: websiteScore(t) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    if (!ranked.length) {
      return {
        ok: false,
        available: true,
        reason: `no website tool among REA's ${tools.length} tools (this build inspects local targets only)`,
        ms: Date.now() - started,
      };
    }

    const chosen = ranked[0].tool;
    const { args: toolArgs, leftovers } = buildArgs(chosen.inputSchema, url);
    if (leftovers.length) {
      log('dim', `REA tool ${chosen.name} needs arguments we cannot infer: ${leftovers.join(', ')}`);
      return {
        ok: false,
        available: true,
        reason: `${chosen.name} requires ${leftovers.join(', ')}`,
        ms: Date.now() - started,
      };
    }

    log('info', `REA · ${chosen.name} on ${url}`);
    const result = await client.request('tools/call', { name: chosen.name, arguments: toolArgs }, timeoutMs);
    const summary = flatten(result);
    if (result && result.isError) {
      return { ok: false, available: true, tool: chosen.name, reason: summary.slice(0, 400) || 'tool error', ms: Date.now() - started };
    }
    if (!summary) {
      return { ok: false, available: true, tool: chosen.name, reason: 'REA returned no text', ms: Date.now() - started };
    }
    return {
      ok: true,
      available: true,
      tool: chosen.name,
      summary,
      tools: tools.length,
      ms: Date.now() - started,
    };
  } catch (e) {
    const tail = client.raw.slice(-3).join(' | ');
    return {
      ok: false,
      available: true,
      reason: tail ? `${e.message} — ${tail}` : e.message,
      stderr: tail,
      ms: Date.now() - started,
    };
  } finally {
    if (signal) signal.removeEventListener('abort', abort);
    client.close();
  }
}

export function reaLabel(result) {
  if (!result) return 'REA · not run';
  if (result.ok) return `REA · ${result.tool} · ${(result.summary.length / 1024).toFixed(1)} KB`;
  return `REA · ${result.reason}`;
}
