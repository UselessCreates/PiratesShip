

import { run } from '../host/util.mjs';
import { runChecks, installItem } from '../host/setup.mjs';
import { config } from '../host/store.mjs';
import { listSecretNames } from '../host/secrets.mjs';

const results = [];

async function probe(label, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ label, ok: true, detail, ms: Date.now() - started });
  } catch (e) {
    results.push({ label, ok: false, detail: e.message, ms: Date.now() - started });
  }
}

const UA = 'PiratesShip-doctor/0.1';

await probe('pageshot.site screenshot', async () => {
  const res = await fetch('https://pageshot.site/v1/screenshot?url=https://example.com&format=webp', {
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1200) throw new Error('image too small');
  return `${(buf.length / 1024).toFixed(0)} KB webp`;
});

await probe('proxy.cors.dev html', async () => {
  const res = await fetch('https://proxy.cors.dev/https://example.com', {
    headers: { 'user-agent': UA },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return `${text.length} chars`;
});

await probe('duckduckgo search via proxy', async () => {
  const res = await fetch('https://proxy.cors.dev/https://html.duckduckgo.com/html/?q=stripe+checkout', {
    headers: { 'user-agent': UA },
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  const hits = (text.match(/result__a/g) || []).length;
  if (!hits) throw new Error('no results parsed');
  return `${hits} result links`;
});

const checks = await runChecks();
const cfg = config();
const secrets = listSecretNames();

console.log('\nPiratesShip doctor\n==================\n');
console.log('environment');
for (const c of checks) {
  console.log(`  ${c.ok ? 'ok  ' : '--  '} ${c.label.padEnd(18)} ${c.detail}`);
}
console.log('\nnetwork');
for (const r of results) {
  console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} ${r.label.padEnd(30)} ${r.detail} (${r.ms}ms)`);
}
console.log('\nconfig');
console.log(`  provider        ${cfg.provider.id} / ${cfg.provider.model || '(no model)'}`);
console.log(`  keys stored     ${secrets.length ? secrets.map((s) => s.replace('provider:', '')).join(', ') : 'none'}`);
console.log(`  output folder   ${cfg.outputDir}`);
console.log(`  setup complete  ${cfg.setupComplete}`);
console.log('');

const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.log(`${failed.length} network probe(s) failed. The engine still works for offline scaffolds.`);
  process.exitCode = 1;
}

void run;
void installItem;
