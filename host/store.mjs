
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { appDataDir, readJson, writeJson, ensureDir, resolvePath } from './util.mjs';

const configFile = () => path.join(appDataDir(), 'config.json');
const sessionsFile = () => path.join(appDataDir(), 'sessions.json');

export function defaultConfig() {
  return {
    version: 1,
    setupComplete: false,
    theme: 'dark',
    target: 'site',
    provider: { id: 'none', model: '', baseUrl: '', extra: {} },
    outputDir: path.join(os.homedir(), 'PiratesShip'),
    recon: { shots: true, pages: 6, search: true },
    autoApprove: false,
    createdAt: new Date().toISOString(),
  };
}

let cache = null;

export function config() {
  if (cache) return cache;
  const saved = readJson(configFile(), null);
  cache = { ...defaultConfig(), ...(saved || {}) };
  cache.provider = { ...defaultConfig().provider, ...(cache.provider || {}) };
  cache.recon = { ...defaultConfig().recon, ...(cache.recon || {}) };
  return cache;
}

export function saveConfig(patch = {}) {
  const next = { ...config(), ...patch };
  if (patch.provider) next.provider = { ...config().provider, ...patch.provider };
  if (patch.recon) next.recon = { ...config().recon, ...patch.recon };
  cache = next;
  writeJson(configFile(), next);
  return next;
}

export function outputDir() {
  const dir = resolvePath(config().outputDir);
  ensureDir(dir);
  return dir;
}

export function sessions() {
  return readJson(sessionsFile(), []);
}

export function saveSession(entry) {
  const list = sessions().filter((s) => s.id !== entry.id);
  list.unshift(entry);
  writeJson(sessionsFile(), list.slice(0, 100));
  return entry;
}

export function clearSessions() {
  writeJson(sessionsFile(), []);
  return [];
}

export function newSessionId() {
  return `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

export function displayName(provider, model) {
  if (!provider || provider.id === 'none') return 'no model (offline builder)';
  return model ? `${provider.name} · ${model}` : provider.name;
}
