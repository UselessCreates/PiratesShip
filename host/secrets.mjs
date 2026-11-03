

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { appDataDir, ensureDir, readJson } from './util.mjs';

const dir = () => appDataDir();
const keyFile = () => path.join(dir(), 'machine.key');
const vaultFile = () => path.join(dir(), 'secrets.bin');

function machineKey() {
  ensureDir(dir());
  try {
    const buf = fs.readFileSync(keyFile());
    if (buf.length === 32) return buf;
  } catch {}
  const buf = crypto.randomBytes(32);
  fs.writeFileSync(keyFile(), buf, { mode: 0o600 });
  return buf;
}

function readVault() {
  const raw = readJson(vaultFile(), null);
  if (!raw || raw.v !== 1) return {};
  return raw.entries || {};
}

function writeVault(entries) {
  const key = machineKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(entries), 'utf8'), cipher.final()]);
  const payload = {
    v: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: body.toString('base64'),
  };
  ensureDir(dir());
  fs.writeFileSync(vaultFile(), JSON.stringify(payload), { mode: 0o600 });
}

export function getSecret(name) {
  try {
    const key = machineKey();
    const raw = readJson(vaultFile(), null);
    if (!raw || raw.v !== 1) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(raw.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(raw.tag, 'base64'));
    const text = Buffer.concat([
      decipher.update(Buffer.from(raw.data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(text)[name] || null;
  } catch {
    return null;
  }
}

export function setSecret(name, value) {
  const entries = readVault();
  if (value) entries[name] = String(value);
  else delete entries[name];
  writeVault(entries);
}

export function clearSecrets() {
  try {
    fs.rmSync(vaultFile(), { force: true });
  } catch {}
}

export function listSecretNames() {
  return Object.keys(readVault());
}

export function maskSecret(value) {
  if (!value) return '';
  const s = String(value);
  if (s.length <= 8) return '•'.repeat(s.length);
  return `${s.slice(0, 4)}${'•'.repeat(Math.min(12, s.length - 8))}${s.slice(-4)}`;
}
