
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn } from 'node:child_process';

export const APP_NAME = 'PiratesShip';
export const VERSION = '0.1.1';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function appDataDir() {
  const base =
    process.env.PIRATES_DATA_DIR ||
    (process.platform === 'win32' && process.env.APPDATA
      ? path.join(process.env.APPDATA, APP_NAME)
      : path.join(os.homedir(), '.piratesship'));
  ensureDir(base);
  return base;
}

export function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
  return p;
}

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJson(file, obj) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
  return file;
}

export function writeText(file, text) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, text, 'utf8');
  return file;
}

export function slugify(input, fallback = 'build') {
  const s = String(input || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return s || fallback;
}

export function truncate(text, max) {
  const s = String(text || '');
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n\n…[truncated ${s.length - max} chars]`;
}

export function decodeEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

export function stripTags(html) {
  return decodeEntities(String(html || '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function nowIso() {
  return new Date().toISOString();
}

export function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

export function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    let child;
    try {
      child = spawn(cmd, args, {
        ...opts,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      resolve({ code: -1, out: '', err: String(e.message), missing: true });
      return;
    }
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
    }, opts.timeoutMs || 20000);
    child.stdout?.on('data', (d) => (out += d.toString()));
    child.stderr?.on('data', (d) => (err += d.toString()));
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: -1, out, err: String(e.message), missing: true });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, out, err });
    });
  });
}

export function runStream(cmd, args, onLine, opts = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, {
        ...opts,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      onLine(String(e.message), 'err');
      resolve(-1);
      return;
    }
    let buf = '';
    const pump = (chunk, level) => {
      buf += chunk.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() || '';
      for (const line of lines) if (line.trim()) onLine(line, level);
    };
    child.stdout?.on('data', (d) => pump(d, 'out'));
    child.stderr?.on('data', (d) => pump(d, 'err'));
    child.on('error', (e) => {
      onLine(String(e.message), 'err');
      resolve(-1);
    });
    child.on('close', (code) => {
      if (buf.trim()) onLine(buf, 'out');
      resolve(code ?? -1);
    });
  });
}

export function lookPath(...candidates) {
  for (const c of candidates) {
    if (!c) continue;
    try {
      if (fs.existsSync(c)) return c;
    } catch {}
  }
  return null;
}

export function openExternal(target) {
  const t = String(target);
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', t], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [t], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [t], { detached: true, stdio: 'ignore' }).unref();
  }
}

export function resolvePath(input, base = os.homedir()) {
  let p = String(input || '').trim().replace(/^["']|["']$/g, '');
  if (!p) return base;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) p = path.join(os.homedir(), p.slice(2));
  return path.isAbsolute(p) ? path.normalize(p) : path.resolve(base, p);
}

export function safeJoin(root, relative) {
  const cleaned = String(relative)
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter((seg) => seg && seg !== '.' && seg !== '..')
    .join('/');
  const full = path.resolve(root, cleaned);
  const normRoot = path.resolve(root);
  if (!full.startsWith(normRoot + path.sep) && full !== normRoot) {
    throw new Error(`Refusing to write outside build folder: ${relative}`);
  }
  return full;
}

export function redact(text, secrets = []) {
  let out = String(text || '');
  for (const s of secrets) {
    if (!s || s.length < 8) continue;
    out = out.split(s).join('[redacted]');
  }
  return out;
}
