

import fs from 'node:fs';
import path from 'node:path';
import { chat } from './providers.mjs';
import { getSecret } from './secrets.mjs';
import { config } from './store.mjs';
import { MASTER_PROMPT, PLAN_PROMPT, BUILD_PROMPT, REPAIR_PROMPT, dossierForPrompt } from './prompt.mjs';
import { safeJoin, writeText, ensureDir, truncate, slugify } from './util.mjs';

const ALLOWED_EXT = new Set([
  '.html', '.htm', '.css', '.js', '.mjs', '.json', '.svg', '.md', '.txt', '.csv', '.webmanifest', '.ico',
]);

export function modelReady() {
  const c = config();
  if (!c.provider || !c.provider.id || c.provider.id === 'none') return false;
  if (!c.provider.model) return false;
  return true;
}

export function modelLabel() {
  const c = config();
  if (!modelReady()) return 'offline builder';
  const provider = c.provider;
  return `${provider.name || provider.id} ${provider.model}`.trim();
}

async function modelChat(messages, { maxTokens = 8192, temperature = 0.45, signal } = {}) {
  const c = config();
  const key = getSecret(`provider:${c.provider.id}`);
  return chat({
    providerId: c.provider.id,
    apiKey: key,
    baseUrl: c.provider.baseUrl || '',
    extra: c.provider.extra || {},
    model: c.provider.model,
    messages,
    maxTokens,
    temperature,
    signal,
  });
}

export async function makePlan({ dossierJson, kind, brief, log = () => {}, signal }) {
  if (!modelReady()) {
    log('warn', 'No model selected — writing the plan from the dossier with the offline builder.');
    return heuristicPlan(dossierJson, brief, kind);
  }
  const evidence = dossierForPrompt(dossierJson);
  log('info', `Planning with ${modelLabel()}…`);
  try {
    const { text } = await modelChat(
      [
        { role: 'system', content: MASTER_PROMPT },
        {
          role: 'user',
          content: `${PLAN_PROMPT}\n\nTARGET KIND: ${kind}\nUSER BRIEF: ${
            brief || '(none - recreate faithfully)'
          }\n\nRECON DOSSIER\n${evidence}`,
        },
      ],
      { maxTokens: 3000, temperature: 0.4, signal }
    );
    if (!text || text.length < 120) throw new Error('the model returned an empty plan');
    return text.trim();
  } catch (e) {

    log('warn', `${modelLabel()} unavailable (${e.message}) — planning from the dossier instead.`);
    return heuristicPlan(dossierJson, brief, kind);
  }
}

function heuristicPlan(d, brief, kind) {
  const p = d.primary || {};
  const pal = (d.palette || []).slice(0, 6).map((c) => c.hex).join(', ') || '#0b0b0f, #14141a, #f5a97f';
  const fonts = (d.fonts || []).slice(0, 3).map((f) => f.family).join(', ') || 'system sans';
  const briefText =
    brief && !/^https?:\/\//i.test(brief.trim())
      ? brief
      : `Faithful rebuild of ${d.primary?.title || d.target}: same structure, hierarchy and feel, original code and copy.`;
  return `## Read of the reference
${d.target} is being reconstructed as a ${kind}. ${briefText}
The three things that make it feel like itself: a restrained single accent over a near-monochrome canvas, a dense but calm information hierarchy, and confident type sizes with tight display leading.

## Structure map
1. Header — brand mark (original), primary navigation (${(p.nav || []).slice(0, 6).join(', ') || 'in-page anchors'}), single primary action.
2. Hero — the reference headline idea (${(p.headings || [])[0] || 'rebuilt headline'}), one supporting paragraph, one primary and one secondary action.
3. Proof / feature grid — ${Math.max(3, Math.min(9, (p.headings || []).length || 6))} cards derived from the reference sections.
4. Detail section — alternating media and copy, built from CSS gradients and inline SVG, never hotlinked images.
5. Closing call to action + footer with the reference's link groups.

## Visual system
- Canvas / surface / elevated: derived from ${pal}.
- Accent: the highest-saturation colour in the extracted palette.
- Type: ${fonts} with a system fallback stack; display 56/60, h2 32/38, body 16/26, small 13/20.
- Spacing scale 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96.
- Radius 8 / 12 / 20; hairline borders at 1px with 8-12% white or black.
- Motion 160ms feedback, 280ms entrances, cubic-bezier(.2,.7,.3,1), reduced-motion honoured.

## Components
Nav link, primary/secondary button (default, hover, focus-visible, active, disabled), card, badge, input with label and error, theme toggle, footer column. Every interactive component ships all states.

## Behaviour
Smooth in-page navigation, sticky header that condenses on scroll, theme toggle persisted to localStorage, mobile drawer with Escape to close and focus trap, form validation with inline errors and a success state.

## Responsive
360: single column, hamburger drawer, hero at 36px. 768: two-column grids, hero at 44px. 1024: three-column feature grid. 1440: 1200px container with generous margins.

## File list
- index.html — semantic document, all sections, inline SVG marks
- styles.css — tokens, layout, components, states, responsive, reduced motion
- app.js — theme, drawer, validation, scroll behaviour
- README.md — what this is and how to run it

## Risks
1. Looking generic: mitigated by using the extracted palette and type scale rather than defaults.
2. Empty states reading as broken: every list gets a designed empty state.
3. Mobile collapse losing hierarchy: the drawer keeps the same order as desktop.`;
}

function parseFiles(text) {
  const out = [];
  const chunks = String(text).split(/===FILE:\s*/).slice(1);
  for (const chunk of chunks) {
    const nl = chunk.indexOf('\n');
    if (nl === -1) continue;
    let name = chunk.slice(0, nl).replace(/=+\s*$/, '').trim().replace(/^[`"']|[`"']$/g, '');
    let body = chunk.slice(nl + 1);
    const end = body.indexOf('===END===');
    if (end !== -1) body = body.slice(0, end);
    body = body.replace(/^\s*```[a-zA-Z0-9]*\s*\r?\n/, '').replace(/\r?\n```\s*$/, '');
    if (name && body.trim()) out.push({ path: name, content: body.replace(/^\uFEFF/, '') });
  }
  if (!out.length) {
    const fenced = /```(?:html|HTML)\s*\r?\n([\s\S]*?)```/.exec(text);
    if (fenced) out.push({ path: 'index.html', content: fenced[1] });
    else if (/<html[\s>]/i.test(text)) out.push({ path: 'index.html', content: text });
  }
  return out;
}

function sanitizeFiles(files, log) {
  const clean = [];
  const seen = new Set();
  for (const f of files) {
    const rel = String(f.path).replace(/\\/g, '/').replace(/^\.?\//, '');
    if (!rel || rel.includes('..') || rel.startsWith('/')) {
      log('warn', `skipped unsafe path ${f.path}`);
      continue;
    }
    const ext = path.extname(rel).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      log('warn', `skipped non-text file ${rel}`);
      continue;
    }
    if (f.content.length > 500000) {
      log('warn', `skipped oversized file ${rel} (${(f.content.length / 1024).toFixed(0)} KB)`);
      continue;
    }
    if (seen.has(rel)) continue;
    seen.add(rel);
    clean.push({ path: rel, content: f.content });
    if (clean.length >= 14) break;
  }
  return clean;
}

export async function runBuild({ plan, dossierJson, kind, brief, dir, log = () => {}, signal }) {
  ensureDir(dir);
  const evidence = dossierForPrompt(dossierJson, 40000);

  if (!modelReady()) {
    log('info', 'Building the free scaffold from the dossier (no model calls).');
    const files = scaffoldFiles(dossierJson, { kind, brief });
    writeFiles(dir, files, log);
    return files;
  }

  log('info', `Generating files with ${modelLabel()}…`);
  let text = '';
  try {
    text = (
      await modelChat(
        [
          { role: 'system', content: MASTER_PROMPT },
          {
            role: 'user',
            content: `${BUILD_PROMPT}\n\nTARGET KIND: ${kind}\nUSER BRIEF: ${
              brief || '(none)'
            }\n\nAPPROVED PLAN\n${truncate(plan, 14000)}\n\nRECON DOSSIER\n${evidence}`,
          },
        ],
        { maxTokens: 16000, temperature: 0.35, signal }
      )
    ).text;
  } catch (e) {
    log('warn', `${modelLabel()} unavailable (${e.message}) — building the dossier scaffold instead.`);
    const fallback = scaffoldFiles(dossierJson, { kind, brief });
    writeFiles(dir, fallback, log);
    return fallback;
  }

  let files = sanitizeFiles(parseFiles(text), log);
  if (!files.length) {
    log('warn', 'The model did not return the file format — falling back to the dossier scaffold.');
    files = scaffoldFiles(dossierJson, { kind, brief });
  }
  writeFiles(dir, files, log);
  return files;
}

export async function repairBuild({ dir, problems, log = () => {}, signal }) {
  if (!modelReady()) return false;
  const existing = [];
  for (const rel of ['index.html', 'styles.css', 'app.js']) {
    try {
      existing.push(`--- ${rel} ---\n${fs.readFileSync(path.join(dir, rel), 'utf8').slice(0, 20000)}`);
    } catch {}
  }
  let text = '';
  try {
    text = (
      await modelChat(
        [
          { role: 'system', content: MASTER_PROMPT },
          { role: 'user', content: `${REPAIR_PROMPT}${problems.join('\n')}\n\nCURRENT FILES\n${existing.join('\n\n')}` },
        ],
        { maxTokens: 12000, temperature: 0.2, signal }
      )
    ).text;
  } catch (e) {
    log('warn', `repair skipped — ${e.message}`);
    return false;
  }
  const files = sanitizeFiles(parseFiles(text), log);
  if (!files.length) return false;
  writeFiles(dir, files, log);
  return true;
}

function writeFiles(dir, files, log) {
  for (const f of files) {
    const target = safeJoin(dir, f.path);
    writeText(target, f.content);
    log('ok', `wrote ${f.path} · ${(f.content.length / 1024).toFixed(1)} KB`);
  }
}

function readCssText(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.css'))
      .map((e) => fs.readFileSync(path.join(dir, e.name), 'utf8'))
      .join('\n');
  } catch {
    return '';
  }
}

export function verifyBuild(dir, opts = {}) {
  const problems = [];
  const notes = [];
  const index = path.join(dir, 'index.html');
  if (!fs.existsSync(index)) {
    problems.push('index.html is missing');
    return { ok: false, problems, notes };
  }
  const html = fs.readFileSync(index, 'utf8');
  if (html.length < 400) problems.push('index.html is suspiciously small');
  if (/lorem ipsum/i.test(html)) problems.push('index.html still contains lorem ipsum');
  if (/\bTODO\b|\byour text here\b|\bplaceholder\.(png|jpg)\b/i.test(html)) problems.push('index.html contains placeholders');

  const refs = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)].map((m) => m[1]);
  let missing = 0;
  for (const ref of refs) {
    if (/^(https?:|mailto:|tel:|#|data:|\/\/)/i.test(ref)) continue;
    const clean = ref.split('?')[0].split('#')[0];
    if (!clean) continue;
    if (!fs.existsSync(path.join(dir, clean))) {
      problems.push(`missing local asset: ${clean}`);
      missing += 1;
      if (missing > 4) break;
    }
  }
  const buttons = (html.match(/<button\b/gi) || []).length;
  const scripts = (html.match(/<script\b/gi) || []).length;
  if (buttons > 0 && scripts === 0) problems.push('page has buttons but no script block');
  const hand = (html.match(/<h1\b/gi) || []).length;
  if (hand > 1) problems.push(`${hand} h1 elements (exactly one required)`);

  const cssText = readCssText(dir);
  const haystack = `${cssText}\n${html}`.toLowerCase();
  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) {
    problems.push('no viewport meta tag (the page cannot adapt below 900px)');
  }

  const dossier = opts.dossier || null;
  const palette = ((dossier && dossier.palette) || [])
    .slice(0, 8)
    .map((c) => String(c.hex || '').toLowerCase())
    .filter(Boolean);
  if (palette.length) {
    const hits = palette.filter((hex) => haystack.includes(hex));
    notes.push(
      `palette: ${hits.length}/${palette.length} recon colours used${hits.length ? ` (${hits.slice(0, 4).join(' ')})` : ' — decide if the result still reads as the reference'}`
    );
  }

  const fonts = ((dossier && dossier.fonts) || [])
    .slice(0, 4)
    .map((f) => String(f.family || '').split(',')[0].replace(/["']/g, '').trim())
    .filter(Boolean);
  if (fonts.length) {
    const used = fonts.filter((f) => haystack.includes(f.toLowerCase()));
    notes.push(`type: ${used.length}/${fonts.length} recon typefaces referenced${used.length ? ` (${used.join(', ')})` : ''}`);
  }

  const landmarks = ['header', 'nav', 'main', 'footer'].filter((tag) => new RegExp(`<${tag}\\b`, 'i').test(html));
  const sections = (html.match(/<section\b/gi) || []).length;
  notes.push(
    `structure: ${landmarks.length} landmark(s)${landmarks.length ? ` (${landmarks.join(', ')})` : ''} · ${sections} section(s)`
  );

  const media = (cssText.match(/@media\b/gi) || []).length;
  const h1s = (html.match(/<h1\b/gi) || []).length;
  notes.push(`responsive: ${media} media quer${media === 1 ? 'y' : 'ies'} · ${h1s} h1`);

  const fileCount = fs.readdirSync(dir).filter((f) => ALLOWED_EXT.has(path.extname(f).toLowerCase())).length;
  notes.push(`${fileCount} file(s) · ${(html.length / 1024).toFixed(1)} KB of html`);
  return { ok: problems.length === 0, problems, notes };
}

function fallbackCss(t) {
  return `/* PiratesShip fallback stylesheet.
   The build referenced this file but did not emit it, so it is generated from
   the palette recovered during recon. Replace the values below with tokens from
   the plan if you keep editing. */
:root {
  color-scheme: dark;
  --canvas: ${t.canvas};
  --surface: ${t.surface};
  --elevated: ${t.elevated};
  --border: ${t.border};
  --text: ${t.text};
  --dim: ${t.dim};
  --accent: ${t.accent};
  --accent-ink: ${t.accentInk};
  --r-sm: 8px; --r-md: 14px; --r-lg: 22px;
  --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px;
  --s5: 24px; --s6: 32px; --s7: 48px; --s8: 64px;
  --ease: cubic-bezier(.2,.7,.3,1);
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--canvas); color: var(--text);
  font: 16px/1.6 ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}
main, header, footer, nav, section, article, aside { display: block; }
a { color: inherit; }
button, input, select, textarea { font: inherit; color: inherit; }
button { cursor: pointer; }
img, svg, video, canvas { max-width: 100%; height: auto; }
h1, h2, h3, h4 { line-height: 1.12; letter-spacing: -0.02em; margin: 0 0 var(--s3); }
h1 { font-size: clamp(2rem, 4.5vw, 3.4rem); }
h2 { font-size: clamp(1.4rem, 2.4vw, 1.9rem); }
p { margin: 0 0 var(--s4); color: var(--dim); }
:where(header, footer, section, article, nav) { border-color: var(--border); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.btn, button:not([data-plain]) {
  display: inline-flex; align-items: center; justify-content: center;
  min-height: 40px; padding: 0 18px; border-radius: var(--r-sm);
  border: 1px solid var(--border); background: var(--surface); color: var(--text);
  transition: border-color .16s var(--ease), filter .16s var(--ease);
}
.btn:hover, button:not([data-plain]):hover { border-color: var(--accent); }
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 1ms !important; transition-duration: 1ms !important; }
}
`;
}

function fallbackJs() {
  return `(() => {
  const root = document.documentElement;
  const themeBtn = document.getElementById('theme');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const next = root.dataset.theme === 'light' ? 'dark' : 'light';
      root.dataset.theme = next;
      try { localStorage.setItem('theme', next); } catch {}
    });
  }
  const burger = document.getElementById('burger');
  const nav = document.getElementById('nav');
  if (burger && nav) {
    burger.addEventListener('click', () => {
      const open = nav.dataset.open !== 'true';
      nav.dataset.open = String(open);
      burger.setAttribute('aria-expanded', String(open));
    });
  }
})();
`;
}

export function ensureLocalAssets(dir, dossierJson = {}, log = () => {}) {
  const created = [];
  let html;
  try {
    html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  } catch {
    return created;
  }
  const theme = deriveTheme(dossierJson.palette || []);
  const refs = new Set([...html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)].map((m) => m[1]));
  for (const ref of refs) {
    if (/^(https?:|mailto:|tel:|#|data:|\/\/)/i.test(ref)) continue;
    const clean = ref.split('?')[0].split('#')[0].trim();
    if (!clean || !/\.(css|js|mjs)$/i.test(clean)) continue;
    let target;
    try {
      target = safeJoin(dir, clean);
    } catch {
      continue;
    }
    if (fs.existsSync(target)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (/\.css$/i.test(clean)) {
      writeText(target, fallbackCss(theme));
      log('warn', `generated missing ${clean} from the recon palette`);
    } else {
      writeText(target, fallbackJs());
      log('warn', `generated missing ${clean} (guarded interaction layer)`);
    }
    created.push(clean);
  }
  return created;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

function rgbToHsl([r, g, b]) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

const hsl = (h, s, l) => `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;

function deriveTheme(palette = []) {
  const scored = palette.map((c) => {
    const [h, s, l] = rgbToHsl(hexToRgb(c.hex));
    return { ...c, h, s, l };
  });
  const dark = scored.filter((c) => c.l < 0.2).sort((a, b) => b.count - a.count)[0];
  const accent = scored
    .filter((c) => c.s > 0.22 && c.l > 0.3 && c.l < 0.78)
    .sort((a, b) => b.s * Math.log(b.count + 1) - a.s * Math.log(a.count + 1))[0];
  const baseHue = dark ? dark.h : 240;
  const aHue = accent ? accent.h : 22;
  const aSat = accent ? Math.min(0.95, Math.max(0.45, accent.s)) : 0.85;
  return {
    canvas: dark ? hsl(baseHue, Math.min(0.22, dark.s * 0.6 + 0.04), 0.06) : 'hsl(240 22% 6%)',
    surface: hsl(baseHue, 0.14, 0.09),
    elevated: hsl(baseHue, 0.12, 0.12),
    border: hsl(baseHue, 0.1, 0.2),
    text: hsl(baseHue, 0.08, 0.96),
    dim: hsl(baseHue, 0.06, 0.66),
    accent: hsl(aHue, aSat, accent ? Math.min(0.66, Math.max(0.52, accent.l)) : 0.62),
    accentInk: hsl(aHue, 0.6, 0.1),
  };
}

function pickName(d, brief) {
  const words = String(brief || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\b[\w-]+\.(com|net|org|io|dev|app|co|ai|site|tools|xyz)\b[^\s]*/gi, ' ')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(
      (w) =>
        w.length > 3 &&
        !/^(https?|www|recreate|clone|rebuild|build|make|like|the|with|site|website|app|game|from|this|that|page)$/i.test(w)
    );
  if (words.length) return words.slice(0, 2).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  const h1 = (d.primary?.headings || []).find((h) => h.startsWith('# '));
  if (h1) {
    const clean = h1.replace(/^#\s*/, '').split(/[|—–:·]/)[0].trim();
    if (clean.length > 2) return clean.slice(0, 28);
  }
  return 'Atlas';
}

export function scaffoldFiles(d, { kind = 'site', brief = '' } = {}) {
  const t = deriveTheme(d.palette || []);
  const name = pickName(d, brief);
  const nav = (d.primary?.nav || []).slice(0, 5);
  const navItems = nav.length ? nav : ['Overview', 'Features', 'Pricing', 'Docs'];
  const headings = (d.primary?.headings || []).map((h) => h.replace(/^#+\s*/, ''));
  const hero = headings[0] || `${name} — rebuilt from evidence`;
  const sub =
    (d.primary?.description || '').slice(0, 220) ||
    'A reconstruction built from the captured structure, palette and typography of the reference.';
  const cards = (headings.slice(1, 7).length ? headings.slice(1, 7) : [
    'Structure captured',
    'Palette extracted',
    'Type scale derived',
    'Responsive behaviour',
    'Accessible by default',
    'Runs from disk',
  ]).slice(0, 6);
  const shots = (d.shots || []).filter((s) => s.ok && s.file);
  const pages = (d.pages || []).slice(0, 6);
  const fontStack = (d.fonts || [])[0]?.family;

  const navHtml = navItems.map((n) => `<a href="#${n.toLowerCase().replace(/[^a-z0-9]+/g, '-')}">${n}</a>`).join('\n        ');
  const cardsHtml = cards
    .map(
      (c, i) => `        <article class="card" tabindex="0">
          <span class="num">0${i + 1}</span>
          <h3>${escapeHtml(c)}</h3>
          <p>Built from the reference's ${i % 2 ? 'layout rhythm and section order' : 'extracted palette and type scale'}.</p>
        </article>`
    )
    .join('\n');
  const evidenceHtml = pages.length
    ? pages.map((p) => `<li><span>${escapeHtml(new URL(p.url).pathname || '/')}</span><em>${escapeHtml(p.title || '')}</em></li>`).join('\n          ')
    : '<li><span>no secondary pages captured</span><em>single-page reference</em></li>';

  const index = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(name)} — rebuilt</title>
<meta name="description" content="${escapeHtml(sub)}" />
<link rel="stylesheet" href="styles.css" />
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>
  <header class="site-head">
    <div class="wrap head-inner">
      <a class="brand" href="#top">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M3 17c3-1.6 5.5-1.6 8.5 0 3 1.6 5.5 1.6 9.5 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6L12 16.8 6.7 19.6l1.1-6L3.4 9.4l6-.8L12 3z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
        </svg>
        <span>${escapeHtml(name)}</span>
      </a>
      <nav id="nav" aria-label="Primary">
        ${navHtml}
      </nav>
      <div class="head-actions">
        <button class="ghost" id="theme" type="button" aria-label="Toggle theme">◐</button>
        <a class="btn" href="#start">Get started</a>
        <button class="burger" id="burger" type="button" aria-expanded="false" aria-controls="nav" aria-label="Menu">☰</button>
      </div>
    </div>
  </header>

  <main id="main">
    <section class="hero" id="top">
      <div class="wrap">
        <p class="eyebrow">${escapeHtml(kind.toUpperCase())} RECONSTRUCTION</p>
        <h1>${escapeHtml(hero)}</h1>
        <p class="lede">${escapeHtml(sub)}</p>
        <div class="hero-actions">
          <a class="btn" href="#start">Start now</a>
          <a class="btn ghost" href="#evidence">See the evidence</a>
        </div>
      </div>
    </section>

    <section class="features" id="features">
      <div class="wrap">
        <h2>What the reference does, rebuilt</h2>
        <div class="grid">
${cardsHtml}
        </div>
      </div>
    </section>

    <section class="detail" id="overview">
      <div class="wrap detail-inner">
        <div class="panel" aria-hidden="true">
          <div class="panel-bar"><i></i><i></i><i></i></div>
          <div class="panel-body">
            <div class="line w70"></div>
            <div class="line w90"></div>
            <div class="line w60"></div>
            <div class="chip-row"><span></span><span></span><span></span></div>
          </div>
        </div>
        <div>
          <h2>A layout you can actually work in</h2>
          <p>The structure above came from the reference itself: its section order, its navigation labels, its hierarchy. What you are reading was rebuilt as original markup and copy, so you can ship it.</p>
          <ul class="ticks">
            <li>Semantic landmarks and a single h1</li>
            <li>Keyboard reachable everywhere, visible focus</li>
            <li>Two themes, honouring your system preference</li>
            <li>No frameworks, no build step, no network calls</li>
          </ul>
        </div>
      </div>
    </section>

    <section class="evidence" id="evidence">
      <div class="wrap">
        <h2>Evidence captured</h2>
        <p class="lede">${(d.shots || []).length} screenshot(s), ${(d.pages || []).length} page(s), ${
          (d.webIntel || []).length
        } research source(s).</p>
        <ul class="pages">
          ${evidenceHtml}
        </ul>
${
  shots.length
    ? `        <div class="shots">
          ${shots
            .slice(0, 3)
            .map((s) => `<figure><img src="../${s.file}" alt="Reference screenshot: ${escapeHtml(s.label)}" loading="lazy" /><figcaption>${escapeHtml(s.label)}</figcaption></figure>`)
            .join('\n          ')}
        </div>`
    : ''
}
      </div>
    </section>

    <section class="cta" id="start">
      <div class="wrap">
        <h2>Ready when you are</h2>
        <p>Everything here is static. Open it from disk, or drop it on any host.</p>
        <form class="signup" id="signup" novalidate>
          <label for="email">Email</label>
          <div class="field">
            <input id="email" name="email" type="email" placeholder="you@example.com" autocomplete="email" required />
            <button class="btn" type="submit">Join</button>
          </div>
          <p class="error" id="email-error" role="alert" hidden></p>
          <p class="sent" id="sent" hidden>Saved locally — this demo has no backend.</p>
        </form>
      </div>
    </section>
  </main>

  <footer class="site-foot">
    <div class="wrap foot-inner">
      <p>${escapeHtml(name)} — an original reconstruction. Reference structure only; no brand assets were copied.</p>
      <p class="fine">Generated by PiratesShip</p>
    </div>
  </footer>
  <script src="app.js"></script>
</body>
</html>
`;

  const css = `:root {
  color-scheme: dark;
  --canvas: ${t.canvas};
  --surface: ${t.surface};
  --elevated: ${t.elevated};
  --border: ${t.border};
  --text: ${t.text};
  --dim: ${t.dim};
  --accent: ${t.accent};
  --accent-ink: ${t.accentInk};
  --r-sm: 8px;
  --r-md: 14px;
  --r-lg: 22px;
  --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px; --s-5: 24px;
  --s-6: 32px; --s-7: 48px; --s-8: 64px; --s-9: 96px;
  --font: ${fontStack ? `"${fontStack}", ` : ''}ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --ease: cubic-bezier(.2,.7,.3,1);
}
[data-theme="light"] {
  color-scheme: light;
  --canvas: hsl(240 24% 98%);
  --surface: hsl(0 0% 100%);
  --elevated: hsl(240 20% 96%);
  --border: hsl(240 10% 88%);
  --text: hsl(240 20% 12%);
  --dim: hsl(240 8% 42%);
  --accent-ink: hsl(0 0% 100%);
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0; background: var(--canvas); color: var(--text);
  font-family: var(--font); font-size: 16px; line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
.wrap { width: min(1200px, calc(100% - 48px)); margin-inline: auto; }
a { color: inherit; text-decoration: none; }
.skip { position: absolute; left: -9999px; }
.skip:focus { left: 16px; top: 16px; background: var(--accent); color: var(--accent-ink); padding: 8px 14px; border-radius: var(--r-sm); z-index: 9; }
h1, h2, h3 { line-height: 1.1; letter-spacing: -0.02em; margin: 0 0 var(--s-3); }
h1 { font-size: clamp(2.25rem, 5vw, 3.75rem); }
h2 { font-size: clamp(1.5rem, 2.6vw, 2rem); }
h3 { font-size: 1.05rem; }
p { margin: 0 0 var(--s-4); color: var(--dim); }

.site-head {
  position: sticky; top: 0; z-index: 5;
  background: color-mix(in srgb, var(--canvas) 82%, transparent);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
}
.head-inner { display: flex; align-items: center; gap: var(--s-6); height: 64px; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 650; letter-spacing: -0.01em; }
.brand svg { color: var(--accent); }
nav { display: flex; gap: var(--s-5); margin-left: auto; }
nav a { color: var(--dim); font-size: 0.94rem; padding: 6px 0; border-bottom: 1px solid transparent; transition: color .16s var(--ease), border-color .16s var(--ease); }
nav a:hover, nav a:focus-visible { color: var(--text); border-bottom-color: var(--accent); }
.head-actions { display: flex; align-items: center; gap: var(--s-3); }
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 40px; padding: 0 18px; border-radius: var(--r-sm);
  background: var(--accent); color: var(--accent-ink);
  font-weight: 600; font-size: 0.94rem; border: 1px solid transparent;
  transition: transform .16s var(--ease), filter .16s var(--ease), background .16s var(--ease);
}
.btn:hover { filter: brightness(1.08); }
.btn:active { transform: translateY(1px); }
.btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.btn[disabled] { opacity: .5; pointer-events: none; }
.btn.ghost { background: transparent; color: var(--text); border-color: var(--border); }
.btn.ghost:hover { border-color: var(--accent); }
.ghost#theme { min-height: 40px; width: 40px; padding: 0; background: transparent; color: var(--dim); border: 1px solid var(--border); border-radius: var(--r-sm); cursor: pointer; }
.burger { display: none; }

.hero { padding: var(--s-9) 0 var(--s-8); border-bottom: 1px solid var(--border); }
.eyebrow { font-size: 0.72rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent); margin-bottom: var(--s-3); }
.lede { font-size: 1.06rem; max-width: 58ch; }
.hero-actions { display: flex; gap: var(--s-3); flex-wrap: wrap; margin-top: var(--s-5); }

.features { padding: var(--s-8) 0; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--s-4); margin-top: var(--s-5); }
.card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--r-md); padding: var(--s-5);
  transition: transform .2s var(--ease), border-color .2s var(--ease), background .2s var(--ease);
}
.card:hover, .card:focus-visible { transform: translateY(-2px); border-color: color-mix(in srgb, var(--accent) 55%, var(--border)); outline: none; }
.card .num { font-variant-numeric: tabular-nums; font-size: 0.75rem; color: var(--accent); }
.card p { margin: var(--s-2) 0 0; font-size: 0.92rem; }

.detail { padding: var(--s-8) 0; border-top: 1px solid var(--border); }
.detail-inner { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-7); align-items: center; }
.panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); overflow: hidden; }
.panel-bar { display: flex; gap: 6px; padding: 12px; border-bottom: 1px solid var(--border); }
.panel-bar i { width: 9px; height: 9px; border-radius: 50%; background: var(--border); }
.panel-body { padding: var(--s-5); display: grid; gap: var(--s-3); }
.line { height: 10px; border-radius: 6px; background: var(--elevated); }
.w70 { width: 70%; } .w90 { width: 90%; } .w60 { width: 60%; }
.chip-row { display: flex; gap: 8px; margin-top: var(--s-2); }
.chip-row span { height: 26px; flex: 1; border-radius: 7px; background: color-mix(in srgb, var(--accent) 22%, var(--elevated)); }
.ticks { list-style: none; padding: 0; margin: var(--s-4) 0 0; display: grid; gap: 10px; }
.ticks li { padding-left: 26px; position: relative; color: var(--dim); font-size: 0.95rem; }
.ticks li::before { content: "✓"; position: absolute; left: 0; top: -1px; color: var(--accent); font-weight: 700; }

.evidence { padding: var(--s-8) 0; border-top: 1px solid var(--border); }
.pages { list-style: none; padding: 0; margin: var(--s-5) 0 var(--s-6); display: grid; gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: var(--r-md); overflow: hidden; }
.pages li { background: var(--surface); padding: 12px 16px; display: flex; justify-content: space-between; gap: 16px; font-size: 0.9rem; }
.pages em { color: var(--dim); font-style: normal; }
.shots { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--s-4); }
.shots figure { margin: 0; border: 1px solid var(--border); border-radius: var(--r-md); overflow: hidden; background: var(--surface); }
.shots img { display: block; width: 100%; height: auto; }
.shots figcaption { padding: 10px 12px; font-size: 0.8rem; color: var(--dim); }

.cta { padding: var(--s-9) 0; border-top: 1px solid var(--border); background: var(--surface); }
.signup { max-width: 460px; margin-top: var(--s-5); }
.signup label { display: block; font-size: 0.85rem; color: var(--dim); margin-bottom: 6px; }
.field { display: flex; gap: var(--s-2); }
.field input {
  flex: 1; min-height: 44px; padding: 0 14px; border-radius: var(--r-sm);
  border: 1px solid var(--border); background: var(--canvas); color: var(--text); font: inherit;
  transition: border-color .16s var(--ease), box-shadow .16s var(--ease);
}
.field input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 24%, transparent); }
.field input[aria-invalid="true"] { border-color: #ff6b6b; }
.error { color: #ff8b8b; font-size: 0.85rem; margin: 8px 0 0; }
.sent { color: var(--accent); font-size: 0.85rem; margin: 8px 0 0; }
.site-foot { padding: var(--s-6) 0; border-top: 1px solid var(--border); }
.foot-inner { display: flex; justify-content: space-between; gap: var(--s-4); flex-wrap: wrap; font-size: 0.85rem; }
.foot-inner p { margin: 0; }
.fine { color: var(--dim); opacity: .7; }

@media (max-width: 900px) {
  .grid, .shots { grid-template-columns: repeat(2, 1fr); }
  .detail-inner { grid-template-columns: 1fr; }
}
@media (max-width: 720px) {
  nav {
    position: fixed; inset: 64px 0 auto 0; flex-direction: column; gap: 0;
    background: var(--surface); border-bottom: 1px solid var(--border);
    padding: var(--s-3) var(--s-5) var(--s-5);
    transform: translateY(-8px); opacity: 0; pointer-events: none;
    transition: opacity .18s var(--ease), transform .18s var(--ease);
  }
  nav[data-open="true"] { opacity: 1; transform: none; pointer-events: auto; }
  nav a { padding: 12px 0; border-bottom: 1px solid var(--border); }
  .burger { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; background: transparent; color: var(--text); border: 1px solid var(--border); border-radius: var(--r-sm); }
  .grid, .shots { grid-template-columns: 1fr; }
  .hero { padding: var(--s-7) 0 var(--s-6); }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  * { transition-duration: 1ms !important; animation-duration: 1ms !important; }
}
`;

  const js = `// ${name} — interaction layer. No dependencies.
const root = document.documentElement;
const storeKey = 'reconstruction-theme';

function applyTheme(mode) {
  const system = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  const next = mode === 'system' ? system : mode;
  root.dataset.theme = next;
  localStorage.setItem(storeKey, mode);
}

applyTheme(localStorage.getItem(storeKey) || 'system');
document.getElementById('theme').addEventListener('click', () => {
  applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
});

const burger = document.getElementById('burger');
const nav = document.getElementById('nav');
burger.addEventListener('click', () => {
  const open = nav.dataset.open !== 'true';
  nav.dataset.open = String(open);
  burger.setAttribute('aria-expanded', String(open));
});
nav.addEventListener('click', (e) => {
  if (e.target.tagName === 'A') {
    nav.dataset.open = 'false';
    burger.setAttribute('aria-expanded', 'false');
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && nav.dataset.open === 'true') {
    nav.dataset.open = 'false';
    burger.setAttribute('aria-expanded', 'false');
    burger.focus();
  }
});

const form = document.getElementById('signup');
const email = document.getElementById('email');
const error = document.getElementById('email-error');
const sent = document.getElementById('sent');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const value = email.value.trim();
  const valid = /^[^@\\s]+@[^@\\s]+\\.[^@\\s]{2,}$/.test(value);
  error.hidden = valid;
  sent.hidden = !valid;
  email.setAttribute('aria-invalid', String(!valid));
  if (valid) {
    localStorage.setItem('reconstruction-email', value);
    form.reset();
  } else {
    error.textContent = 'Enter a valid email address.';
    email.focus();
  }
});

const head = document.querySelector('.site-head');
let last = 0;
window.addEventListener('scroll', () => {
  const y = window.scrollY;
  head.style.boxShadow = y > 8 ? '0 8px 24px rgba(0,0,0,.18)' : 'none';
  last = y;
}, { passive: true });
`;

  const readme = `# ${name}

A reconstruction generated by **PiratesShip** — original code, copy and SVG marks,
built from research on ${d.url ? d.url : d.target}.

## Run it
Double-click \`index.html\`. No server, no build step, no dependencies.

## What came from the research
- Structure and section order: ${(d.pages || []).length} captured page(s)
- Palette: ${(d.palette || []).slice(0, 5).map((c) => c.hex).join(', ') || 'derived'}
- Fonts seen: ${(d.fonts || []).slice(0, 3).map((f) => f.family).join(', ') || 'system stack'}
- Research sources: ${(d.webIntel || []).length}

Reference screenshots live in \`../_recon/shots/\` and the full dossier in \`../_recon/dossier.md\`.

Nothing here copies a trademark, logo or proprietary copy from the reference.
`;

  return [
    { path: 'index.html', content: index },
    { path: 'styles.css', content: css },
    { path: 'app.js', content: js },
    { path: 'README.md', content: readme },
  ];
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export { slugify };
