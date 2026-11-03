

import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) {
  console.error('usage: node tools/smoke.mjs <engine-url-with-token> [target] [kind]');
  process.exit(2);
}
const prompt = process.argv[3] || 'example.com';
const kind = process.argv[4] || 'site';

const url = new URL(target);
const base = url.origin;
const token = url.searchParams.get('t') || '';
const headers = { 'x-ps-token': token, 'content-type': 'application/json' };

const started = Date.now();
const asked = { value: false };
let done = null;
let failed = null;

const res = await fetch(`${base}/api/session`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ prompt, kind }),
});
if (!res.ok) {
  console.error('session start failed', res.status, await res.text());
  process.exit(1);
}
const { jobId } = await res.json();
console.log(`job ${jobId} · ${prompt} (${kind})`);

const stream = await fetch(`${base}/api/stream?job=${jobId}`, { headers });
const reader = stream.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

const deadline = Date.now() + 240000;

while (Date.now() < deadline && !done && !failed) {
  const { value, done: end } = await reader.read();
  if (end) break;
  buffer += decoder.decode(value, { stream: true });
  let idx;
  while ((idx = buffer.indexOf('\n\n')) !== -1) {
    const frame = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 2);
    const line = frame.split('\n').find((l) => l.startsWith('data: '));
    if (!line) continue;
    let evt;
    try {
      evt = JSON.parse(line.slice(6));
    } catch {
      continue;
    }
    if (evt.type === 'log') {
      console.log(`  [${evt.level}] ${evt.text}`);
    } else if (evt.type === 'phase') {
      console.log(`\n== ${evt.label}`);
    } else if (evt.type === 'dossier') {
      console.log('   dossier:', JSON.stringify(evt.stats));
    } else if (evt.type === 'ask') {
      console.log('   plan ready — approving');
      asked.value = true;
      await fetch(`${base}/api/approve`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ jobId, accepted: true }),
      });
    } else if (evt.type === 'done') {
      done = evt;
    } else if (evt.type === 'error') {
      failed = evt.message;
    }
  }
}

if (failed) {
  console.error('\nFAILED:', failed);
  process.exit(1);
}
if (!done) {
  console.error('\nTIMED OUT after 240s');
  process.exit(1);
}

const index = done.index;
console.log('\n--- result ---');
console.log('dir        ', done.dir);
console.log('verify     ', done.verify.ok ? 'ok' : `warnings: ${done.verify.problems.join('; ')}`);
console.log('files      ', done.files.join(', '));
console.log('elapsed    ', `${((Date.now() - started) / 1000).toFixed(1)}s`);

const checks = [
  ['index.html exists', fs.existsSync(path.join(done.siteDir, 'index.html'))],
  ['plan.md exists', fs.existsSync(path.join(done.dir, 'plan.md'))],
  ['dossier exists', fs.existsSync(path.join(done.dir, '_recon', 'dossier.md'))],
  ['screenshots exist', fs.existsSync(path.join(done.dir, '_recon', 'shots'))],
  ['html captured', fs.existsSync(path.join(done.dir, '_recon', 'html'))],
  ['approved plan', asked.value],
];

let bad = 0;
for (const [label, ok] of checks) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) bad += 1;
}
console.log(bad ? `\n${bad} check(s) failed` : '\nall checks passed');
process.exit(bad ? 1 : 0);
