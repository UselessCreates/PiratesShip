

import fs from 'node:fs';
import path from 'node:path';
import { appDataDir, ensureDir } from '../host/util.mjs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node tools/import-art.mjs <ascii-art.html>');
  process.exit(2);
}

const html = fs.readFileSync(file, 'utf8');
const pre = /<pre[^>]*>([\s\S]*?)<\/pre>/i.exec(html);
const source = pre ? pre[1] : html;

const rows = [[]];
const tokenRe =
  /<span[^>]*color:\s*(?:rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)|#([0-9a-f]{6}))[^>]*>([\s\S]*?)<\/span>|<br\s*\/?>|(\r?\n)/gi;

let m;
while ((m = tokenRe.exec(source))) {
  if (m[1] !== undefined) {
    const hex = `#${[1, 2, 3].map((i) => Number(m[i]).toString(16).padStart(2, '0')).join('')}`;
    const filled = String(m[5] || '').replace(/<[^>]*>/g, '').trim().length > 0;
    rows[rows.length - 1].push(filled ? hex : '');
  } else if (m[4] !== undefined) {
    const filled = String(m[5] || '').replace(/<[^>]*>/g, '').trim().length > 0;
    rows[rows.length - 1].push(filled ? `#${m[4].toLowerCase()}` : '');
  } else {
    rows.push([]);
  }
}

while (rows.length && rows[0].length === 0) rows.shift();
while (rows.length && rows[rows.length - 1].length === 0) rows.pop();

const cols = rows.reduce((max, row) => Math.max(max, row.length), 0);
if (cols < 2 || rows.length < 2) {
  console.error(`That does not look like a pixel grid (${cols}×${rows.length}).`);
  process.exit(1);
}

const cells = new Array(cols * rows.length).fill('');
rows.forEach((row, r) => row.forEach((hex, c) => (cells[r * cols + c] = hex)));

const filledCount = cells.filter(Boolean).length;
let inverted = false;
const avg = cells.reduce((acc, hex) => {
  if (!hex) return acc;
  const n = parseInt(hex.slice(1), 16);
  return acc + ((n >> 16 & 255) * 0.299 + (n >> 8 & 255) * 0.587 + (n & 255) * 0.114);
}, 0) / (filledCount || 1);
if (avg < 26) {
  for (let i = 0; i < cells.length; i += 1) {
    if (!cells[i]) continue;
    const n = parseInt(cells[i].slice(1), 16);
    const inv = (v) => (255 - v).toString(16).padStart(2, '0');
    cells[i] = `#${inv(n >> 16 & 255)}${inv(n >> 8 & 255)}${inv(n & 255)}`;
  }
  inverted = true;
}

const out = path.join(appDataDir(), 'logo-art.json');
ensureDir(path.dirname(out));
fs.writeFileSync(out, JSON.stringify({ cols, rows: rows.length, cells, inverted, savedAt: new Date().toISOString() }));

console.log(`logo imported: ${cols} × ${rows.length} px, ${filledCount} filled cells`);
if (inverted) console.log('lifted for contrast: the grid was almost pure black');
console.log(`saved to ${out}`);
console.log('restart PiratesShip (or reload the window) to see it.');
