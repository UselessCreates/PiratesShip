
import fs from 'node:fs';
import path from 'node:path';
import { run, runStream } from './util.mjs';
import { reaStatus, nodeSupportsRea } from './rea.mjs';

const WINGET = 'winget';

function npmInvocation(args) {
  if (process.platform !== 'win32') return { cmd: 'npm', args };
  const comspec = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
  return { cmd: comspec, args: ['/d', '/s', '/c', `npm ${args.join(' ')}`] };
}

const NODE_DIRS = [
  process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'nodejs'),
  process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'nodejs'),
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'nodejs'),
].filter(Boolean);

function adoptNodePath() {
  const current = String(process.env.PATH || '');
  const known = current.split(path.delimiter);
  const add = NODE_DIRS.filter((dir) => {
    try {
      return fs.existsSync(dir) && !known.includes(dir);
    } catch {
      return false;
    }
  });
  if (add.length) process.env.PATH = `${add.join(path.delimiter)}${path.delimiter}${current}`;
  return add;
}

const NODE_WINGET_ARGS = [
  'install',
  '--exact',
  '--id',
  'OpenJS.NodeJS.LTS',
  '--accept-source-agreements',
  '--accept-package-agreements',
  '--silent',
];

export const INSTALLS = {
  node: {
    label: 'Node.js LTS',
    args: NODE_WINGET_ARGS,
    note: 'Needed to run the engine. Already bundled? Then skip.',
    url: 'https://nodejs.org/en/download',
  },
  npm: {
    label: 'npm (ships with Node.js LTS)',
    args: NODE_WINGET_ARGS,
    note: 'npm comes with Node, so this installs Node.js LTS.',
    url: 'https://nodejs.org/en/download',
  },
  git: {
    label: 'Git',
    args: ['install', '--exact', '--id', 'Git.Git', '--accept-source-agreements', '--accept-package-agreements', '--silent'],
    note: 'Optional — for versioning what you build.',
    url: 'https://git-scm.com/download/win',
  },
  ollama: {
    label: 'Ollama',
    args: ['install', '--exact', '--id', 'Ollama.Ollama', '--accept-source-agreements', '--accept-package-agreements', '--silent'],
    note: 'Runs local models with no key and no cost.',
    url: 'https://ollama.com/download/windows',
  },
  webview2: {
    label: 'WebView2 runtime',
    args: [
      'install',
      '--exact',
      '--id',
      'Microsoft.EdgeWebView2Runtime',
      '--accept-source-agreements',
      '--accept-package-agreements',
      '--silent',
    ],
    note: 'The renderer for the PiratesShip window.',
    url: 'https://developer.microsoft.com/microsoft-edge/webview2/',
  },
  rea: {
    label: 'REA inspection kit',

    npm: ['install', '--global', 'rea-agents'],
    note: 'Installs Node.js LTS when needed, then rea-agents, then proves it starts.',
    url: 'https://rea.tools/get-started',
  },
};

async function webview2Version() {
  const keys = [
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
    'HKCU\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
  ];
  for (const key of keys) {
    const r = await run('reg', ['query', key, '/v', 'pv'], { timeoutMs: 8000 });
    if (r.code !== 0) continue;
    const m = /pv\s+REG_SZ\s+([\d.]+)/.exec(`${r.out}${r.err}`);
    if (m) return m[1];
  }
  return null;
}

export async function runChecks({ quick = false } = {}) {
  const items = [];

  const nodeVersion = process.version;
  const nodeMajor = Number(nodeVersion.replace('v', '').split('.')[0]);
  items.push({
    id: 'node',
    label: 'Node.js',
    detail: `${nodeVersion} (engine runtime)`,
    ok: nodeMajor >= 18,
    required: true,
    installable: false,
    note:
      nodeMajor > 22 || (nodeMajor === 22 && Number(nodeVersion.replace('v', '').split('.')[1]) >= 23)
        ? 'Meets the Node 22.23.4+ target that rea.tools asks for.'
        : nodeMajor >= 18
          ? 'Runs PiratesShip (18+). rea.tools wants 22.23.4+ for its own tooling.'
          : 'Too old — install Node 24 LTS.',
  });

  const npmCall = npmInvocation(['-v']);
  const npm = await run(npmCall.cmd, npmCall.args, { timeoutMs: 25000 });
  items.push({
    id: 'npm',
    label: 'npm',
    detail: npm.code === 0 ? `v${npm.out.trim()}` : 'not found',
    ok: npm.code === 0,
    required: true,
    installable: true,
    note: npm.code === 0 ? '' : 'Comes with Node.js LTS — installing Node fixes this.',
  });

  const wv = await webview2Version();
  items.push({
    id: 'webview2',
    label: 'WebView2',
    detail: wv ? `v${wv}` : 'not detected',
    ok: Boolean(wv),
    required: true,
    installable: true,
  });

  if (quick) return items;

  const git = await run('git', ['--version'], { timeoutMs: 12000 });
  items.push({
    id: 'git',
    label: 'Git',
    detail: git.code === 0 ? git.out.trim() : 'not found',
    ok: git.code === 0,
    required: false,
    installable: true,
  });

  const winget = await run(WINGET, ['--version'], { timeoutMs: 15000 });
  items.push({
    id: 'winget',
    label: 'winget',
    detail: winget.code === 0 ? winget.out.trim() : 'not available',
    ok: winget.code === 0,
    required: false,
    installable: false,
    note: 'Used for one-click installs.',
  });

  const ollama = await run('ollama', ['--version'], { timeoutMs: 12000 });
  let ollamaRunning = false;
  try {
    const res = await fetch('http://127.0.0.1:11434/api/version', { signal: AbortSignal.timeout(1500) });
    ollamaRunning = res.ok;
  } catch {}
  items.push({
    id: 'ollama',
    label: 'Ollama (local AI)',
    detail: ollamaRunning ? 'installed and running' : ollama.code === 0 ? 'installed, server not running' : 'not installed',
    ok: ollama.code === 0,
    required: false,
    installable: true,
    note: 'Free local models. Skip if you will use a cloud key.',
  });

  const rea = await reaStatus();
  items.push({
    id: 'rea',
    label: 'REA inspection kit',
    detail: rea.available ? `${rea.version} · ${rea.bin}` : 'not usable',
    ok: rea.available,
    required: false,
    installable: true,
    note: rea.available
      ? 'Recon asks REA to observe the reference in a real browser and feeds that evidence to the model.'
      : `${rea.reason}. Optional — recon still runs without it, and install handles Node + rea-agents for you.`,
  });

  return items;
}

async function wingetInstall(id, say) {
  const recipe = INSTALLS[id];
  const available = await run(WINGET, ['--version'], { timeoutMs: 12000 });
  if (available.code !== 0) {
    throw new Error('winget is not available on this machine — install manually from ' + recipe.url);
  }
  say(`winget ${recipe.args.join(' ')}`);
  const code = await runStream(WINGET, recipe.args, say, { timeoutMs: 900000 });
  return { ok: code === 0, code };
}

async function npmInstallGlobal(args, say) {
  say(`npm ${args.join(' ')}`);
  const inv = npmInvocation(args);
  const code = await runStream(inv.cmd, inv.args, say, { timeoutMs: 600000 });
  return { ok: code === 0, code };
}

async function installRea(say) {
  const before = await reaStatus();
  if (before.available) {
    say(`rea already responds (${before.version}) — nothing to install`);
    return { ok: true, code: 0 };
  }

  adoptNodePath();

  const npmCall = npmInvocation(['-v']);
  const npm = await run(npmCall.cmd, npmCall.args, { timeoutMs: 25000 });
  if (npm.code !== 0) {
    say('npm is missing — installing Node.js LTS first');
    const node = await wingetInstall('node', say);
    if (!node.ok) {
      return { ok: false, code: node.code, reason: 'could not install Node.js LTS with winget' };
    }
    const added = adoptNodePath();
    say(added.length ? `using Node from ${added[0]}` : 'Node installed — a restart may be needed before PATH picks it up');
  }

  const pkg = await npmInstallGlobal(INSTALLS.rea.npm, say);

  const afterPkg = await reaStatus();
  if (afterPkg.available) {
    say(`rea ${afterPkg.version} responds`);
    return { ok: true, code: 0 };
  }

  if (!pkg.ok) {
    return { ok: false, code: pkg.code, reason: 'npm install --global rea-agents failed — see the output above' };
  }

  const nodeOnPath = await run('node', ['--version'], { timeoutMs: 15000 });
  const pathNode = nodeOnPath.code === 0 ? nodeOnPath.out.trim() : 'missing';
  say(`rea is installed but will not start (${afterPkg.reason})`);
  say(`Node on PATH is ${pathNode} — REA asks for 22.23.4+ / 24.22.1+ / 26.12.1+`);

  const node = await wingetInstall('node', say);
  if (!node.ok) {
    return {
      ok: false,
      code: node.code,
      reason: `rea needs a newer Node.js (${pathNode}); winget could not install one`,
    };
  }
  adoptNodePath();

  const retry = await reaStatus();
  if (retry.available) {
    say(`rea ${retry.version} responds`);
    return { ok: true, code: 0 };
  }
  say(`rea still will not start: ${retry.reason}`);
  return { ok: false, code: 1, reason: retry.reason };
}

export async function installItem(id, onLine) {
  const recipe = INSTALLS[id];
  if (!recipe) throw new Error(`Nothing to install for "${id}".`);
  const say = (line, level = 'out') => onLine(level === 'err' ? 'warn' : 'dim', String(line).slice(0, 300));

  if (id === 'rea') return installRea(say);
  if (recipe.npm) return npmInstallGlobal(recipe.npm, say);
  return wingetInstall(id, say);
}

export function outputTree(root) {
  const out = [];
  const walk = (dir, depth = 0) => {
    if (depth > 2) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      out.push(`${'  '.repeat(depth)}${e.isDirectory() ? '▸' : '·'} ${e.name}`);
      if (e.isDirectory()) walk(full, depth + 1);
    }
  };
  walk(root);
  return out.slice(0, 60);
}
