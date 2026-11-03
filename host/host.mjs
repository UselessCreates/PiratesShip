

import crypto from 'node:crypto';
import { createServer } from './server.mjs';
import { freePort, openExternal, APP_NAME, VERSION } from './util.mjs';
import { config } from './store.mjs';

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const valueOf = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const native = has('--native');

const token = process.env.PIRATES_TOKEN || crypto.randomBytes(18).toString('hex');

const port = Number(valueOf('--port', '0')) || (await freePort());
const server = createServer({ token });

server.on('error', (err) => {
  console.error(`PIRATES_ERROR ${err.message}`);
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}/?t=${token}`;
  if (native) {

    console.log(`PIRATES_READY ${url}`);
    if (process.stdout.isTTY === false) process.stdout.write('');
  } else {
    console.log(`\n  ${APP_NAME} v${VERSION}`);
    console.log(`  setup complete: ${config().setupComplete ? 'yes' : 'not yet'}`);
    console.log(`  engine: ${url}\n`);
    if (!has('--no-open')) openExternal(url);
  }
});

const shutdown = () => {
  try {
    server.close();
  } catch {}
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', (e) => console.error(`PIRATES_ERROR ${e.message}`));
process.on('unhandledRejection', (e) => console.error(`PIRATES_ERROR ${e && e.message}`));
