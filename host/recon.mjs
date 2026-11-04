

import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, writeText, sleep, truncate, stripTags, decodeEntities } from './util.mjs';
import { searchWeb } from './search.mjs';
import { analyzeWebsite, reaLabel } from './rea.mjs';

const PROXY = 'https://proxy.cors.dev/';
const SHOT = 'https://pageshot.site/v1/screenshot';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

let requestBudget = 0;
function spend(n = 1) {
  requestBudget += n;
  return requestBudget;
}

export function resetBudget() {
  requestBudget = 0;
}

async function proxyGet(url, { timeoutMs = 30000, maxBytes = 6 * 1024 * 1024 } = {}) {
  spend();
  const res = await fetch(`${PROXY}${url}`, {
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,text/css,*/*' },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`proxy ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.subarray(0, maxBytes).toString('utf8');
}

export function normalizeUrl(input) {
  let s = String(input || '').trim();
  if (!s) return null;
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(s) && !s.startsWith('localhost')) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (!/^https?:$/.test(u.protocol)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function origin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

function absolutize(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

export async function screenshot(url, file, opts = {}) {
  const q = new URLSearchParams({ url, format: 'webp', block_ads: 'true', full_page: 'false' });
  if (opts.fullPage) q.set('full_page', 'true');
  if (opts.dark) q.set('dark_mode', 'true');
  if (opts.width) q.set('width', String(opts.width));
  if (opts.height) q.set('height', String(opts.height));
  const width = opts.width || 1440;
  const height = opts.height || 1200;
  const targets = [
    `${SHOT}?${q}`,
    `https://image.thum.io/get/width/${width}/crop/${height}/${url}`,
    `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=${width}`,
  ];
  const errors = [];
  for (const target of targets) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let host = 'screenshot service';
      try {
        host = new URL(target).host;
        const res = await fetch(target, {
          headers: { 'user-agent': UA },
          signal: AbortSignal.timeout(60000),
        });
        if (!res.ok) throw new Error(`${host} ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 1200) throw new Error(`${host} returned an empty image`);
        ensureDir(path.dirname(file));
        fs.writeFileSync(file, buf);
        return { file, bytes: buf.length, source: host };
      } catch (e) {
        errors.push(e.message);
        const retryable = /\b(429|5\d\d|empty image)\b/.test(e.message);
        if (retryable && attempt === 0) await sleep(1500 + Math.random() * 1500);
      }
    }
  }
  throw new Error(errors.slice(0, 4).join(', ') || 'screenshot failed');
}

export async function webSearch(query, limit = 8) {
  return searchWeb(query, limit, (url) => proxyGet(url, { timeoutMs: 25000 }));
}

export function extractPage(html, pageUrl) {
  const title = stripTags(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '').slice(0, 200);
  const meta = (name) => {
    const re = new RegExp(
      `<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`,
      'i'
    );
    const alt = new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`,
      'i'
    );
    return decodeEntities(re.exec(html)?.[1] || alt.exec(html)?.[1] || '').slice(0, 400);
  };

  const headings = [];
  const hre = /<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m;
  while ((m = hre.exec(html)) && headings.length < 60) {
    const text = stripTags(m[2]).slice(0, 200);
    if (text) headings.push(`${'#'.repeat(Number(m[1]))} ${text}`);
  }

  const navBlock = /<nav[^>]*>([\s\S]{0,20000}?)<\/nav>/gi;
  const nav = [];
  while ((m = navBlock.exec(html))) {
    const are = /<a[^>]*>([\s\S]*?)<\/a>/gi;
    let a;
    while ((a = are.exec(m[1])) && nav.length < 40) {
      const t = stripTags(a[1]).slice(0, 60);
      if (t) nav.push(t);
    }
  }

  const links = [];
  const are = /<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = are.exec(html)) && links.length < 200) {
    const href = absolutize(decodeEntities(m[1]), pageUrl);
    const text = stripTags(m[2]).slice(0, 80);
    if (href && text && /^https?:/.test(href)) links.push(`${text} -> ${href}`);
  }

  const buttons = [];
  const bre = /<button[^>]*>([\s\S]*?)<\/button>/gi;
  while ((m = bre.exec(html)) && buttons.length < 40) {
    const t = stripTags(m[1]).slice(0, 60);
    if (t) buttons.push(t);
  }

  const forms = [];
  const fre = /<(input|select|textarea)\b([^>]*)>/gi;
  while ((m = fre.exec(html)) && forms.length < 30) {
    const attrs = m[2];
    const type = /type=["']([^"']+)["']/i.exec(attrs)?.[1] || m[1];
    const ph = /placeholder=["']([^"']+)["']/i.exec(attrs)?.[1] || '';
    const nameAttr = /name=["']([^"']+)["']/i.exec(attrs)?.[1] || '';
    forms.push([type, ph, nameAttr].filter(Boolean).join(' '));
  }

  const images = [];
  const ire = /<img\b([^>]*)>/gi;
  while ((m = ire.exec(html)) && images.length < 60) {
    const src = /src=["']([^"']+)["']/i.exec(m[1])?.[1] || '';
    const alt = /alt=["']([^"']*)["']/i.exec(m[1])?.[1] || '';
    const abs = absolutize(decodeEntities(src), pageUrl);
    if (abs) images.push({ src: abs, alt: decodeEntities(alt).slice(0, 120) });
  }

  const sections = [];
  const sre = /<(section|article|aside|footer|header)[^>]*(?:aria-label|class|id)=["']([^"']{0,80})["']/gi;
  while ((m = sre.exec(html)) && sections.length < 30) {
    sections.push(`${m[1]} .${m[2]}`.slice(0, 100));
  }

  const cssChunks = [];
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  while ((m = styleRe.exec(html)) && cssChunks.length < 20) cssChunks.push(m[1]);
  const inlineStyles = html.match(/style=["'][^"']{0,400}["']/gi) || [];

  const stylesheets = [];
  const lre = /<link[^>]+rel=["']stylesheet["'][^>]*>/gi;
  while ((m = lre.exec(html)) && stylesheets.length < 12) {
    const href = /href=["']([^"']+)["']/i.exec(m[0])?.[1];
    const abs = absolutize(decodeEntities(href || ''), pageUrl);
    if (abs) stylesheets.push(abs);
  }

  const scripts = [];
  const scRe = /<script[^>]+src=["']([^"']+)["']/gi;
  while ((m = scRe.exec(html)) && scripts.length < 25) {
    const abs = absolutize(decodeEntities(m[1]), pageUrl);
    if (abs) scripts.push(abs);
  }

  const tech = [];
  const add = (cond, label) => cond && tech.push(label);
  add(/__NEXT_DATA__|\/_next\//.test(html), 'Next.js');
  add(/__NUXT__|\/_nuxt\//.test(html), 'Nuxt');
  add(/___gatsby|page-data\.json/.test(html), 'Gatsby');
  add(/wp-content|wp-includes/.test(html), 'WordPress');
  add(/cdn\.shopify\.com|Shopify\.theme/.test(html), 'Shopify');
  add(/svelte-|__sveltekit/.test(html), 'SvelteKit');
  add(/data-reactroot|react-dom/.test(html), 'React');
  add(/ng-version|angular/.test(html), 'Angular');
  add(/tailwind|--tw-/.test(html), 'Tailwind');
  add(/framer-motion|data-framer/.test(html), 'Framer');
  add(/webflow/i.test(html), 'Webflow');

  const fonts = [];
  const fontRe = /font-family\s*:\s*([^;}"]+)/gi;
  const allCss = cssChunks.join('\n') + '\n' + inlineStyles.join('\n');
  while ((m = fontRe.exec(allCss)) && fonts.length < 40) {
    const family = m[1].split(',')[0].replace(/["']/g, '').trim();
    if (family && !/^(inherit|initial|unset|sans-serif|serif|monospace|system-ui)$/i.test(family)) fonts.push(family);
  }

  return {
    url: pageUrl,
    title,
    description: meta('description') || meta('og:description'),
    ogImage: meta('og:image'),
    themeColor: meta('theme-color'),
    headings,
    nav: [...new Set(nav)],
    buttons: [...new Set(buttons)],
    forms: [...new Set(forms)],
    links: [...new Set(links)],
    images,
    sections: [...new Set(sections)],
    stylesheets,
    scripts,
    tech: [...new Set(tech)],
    fonts: [...new Set(fonts)],
    text: stripTags(
      (html.match(/<body[\s\S]*<\/body>/i)?.[0] || html)
        .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
    ).slice(0, 4000),
    cssText: allCss.slice(0, 400000),
  };
}

const COLOR_RE = /#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b|rgba?\([^)]{5,40}\)/gi;

function normalizeColor(c) {
  const s = c.trim().toLowerCase();
  if (s.startsWith('#')) {
    if (s.length === 4) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
    return s.slice(0, 7);
  }
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(s);
  if (!m) return null;
  const hex = (n) => Number(n).toString(16).padStart(2, '0');
  return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
}

export function paletteFromCss(cssTexts) {
  const counts = new Map();
  for (const css of cssTexts) {
    const hits = String(css || '').match(COLOR_RE) || [];
    for (const h of hits) {
      const hex = normalizeColor(h);
      if (!hex) continue;
      if (hex === '#ffffff' || hex === '#000000') continue;
      counts.set(hex, (counts.get(hex) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 16)
    .map(([hex, count]) => ({ hex, count }));
}

export function fontsFrom(list) {
  const counts = new Map();
  for (const f of list) counts.set(f, (counts.get(f) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([family, count]) => ({ family, count }));
}

const CSS_DECL_RE = /([a-z-]{2,32})\s*:\s*([^;{}]+)/gi;

function lengthToPx(value) {
  const m = /^(-?\d+(?:\.\d+)?)(px|rem|em|pt)?$/.exec(String(value).trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  if (m[2] === 'rem' || m[2] === 'em') return Math.round(n * 16 * 10) / 10;
  if (m[2] === 'pt') return Math.round(((n * 4) / 3) * 10) / 10;
  if (!m[2]) return null;
  return n;
}

function cssValueMap(cssTexts) {
  const props = new Map();
  for (const css of cssTexts) {
    const text = String(css || '').replace(/\/\*[\s\S]*?\*\//g, ' ');
    for (const m of text.matchAll(CSS_DECL_RE)) {
      const prop = m[1].toLowerCase();
      const value = m[2].trim().toLowerCase().slice(0, 160);
      if (!value || value.startsWith('url(')) continue;
      if (!props.has(prop)) props.set(prop, new Map());
      const bucket = props.get(prop);
      bucket.set(value, (bucket.get(value) || 0) + 1);
    }
  }
  return props;
}

function topRaw(map, limit = 6) {
  if (!map) return [];
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([value, count]) => ({ value, count }));
}

function pxFrom(map, limit = 14) {
  const counts = new Map();
  for (const [value, count] of map || []) {
    const px = lengthToPx(value);
    if (px === null || px < 0 || px > 2400) continue;
    counts.set(px, (counts.get(px) || 0) + count);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([px, count]) => ({ px, count }));
}

function colorRoles(props) {
  const pick = (names) => {
    const counts = new Map();
    for (const name of names) {
      for (const [value, count] of props.get(name) || []) {
        for (const hit of String(value).match(COLOR_RE) || []) {
          const hex = normalizeColor(hit);
          if (!hex) continue;
          counts.set(hex, (counts.get(hex) || 0) + count);
        }
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([hex, count]) => ({ hex, count }));
  };
  return {
    background: pick(['background', 'background-color']),
    ink: pick(['color', 'fill', 'stroke']),
    border: pick(['border-color', 'border', 'border-top', 'border-bottom', 'outline-color']),
    accent: pick(['box-shadow', 'accent-color', 'outline']),
  };
}

export function designFromCss(cssTexts) {
  const props = cssValueMap(cssTexts);
  const joined = cssTexts.join('\n');
  const breakpoints = [
    ...new Set(
      [...joined.matchAll(/@media[^{]*?(?:min|max)-width\s*:\s*(\d+(?:\.\d+)?)(px|rem|em)/gi)].map((m) =>
        lengthToPx(`${m[1]}${m[2]}`)
      )
    ),
  ]
    .filter((n) => n !== null && n > 0)
    .sort((a, b) => a - b);
  const space = pxFrom(
    new Map(
      ['padding', 'padding-top', 'padding-block', 'padding-inline', 'margin', 'margin-top', 'margin-bottom', 'gap', 'row-gap', 'column-gap'].flatMap(
        (name) => [...(props.get(name) || [])]
      )
    ),
    16
  );
  return {
    typeScale: pxFrom(props.get('font-size'), 14).sort((a, b) => a.px - b.px),
    weights: topRaw(props.get('font-weight'), 6),
    lineHeights: topRaw(props.get('line-height'), 6),
    space,
    radii: pxFrom(props.get('border-radius'), 8).sort((a, b) => a.px - b.px),
    containers: pxFrom(props.get('max-width'), 6),
    breakpoints,
    grids: topRaw(props.get('grid-template-columns'), 6),
    shadows: topRaw(props.get('box-shadow'), 4),
    colors: colorRoles(props),
    fontFamilies: topRaw(props.get('font-family'), 6),
    cssBytes: joined.length,
  };
}

export function designLinesFrom(design) {
  const d = design || {};
  const L = [];
  if (d.typeScale?.length) L.push(`type scale: ${d.typeScale.map((v) => `${v.px}px`).join(' ')}`);
  const literal = (list) => (list || []).filter((v) => !String(v.value).startsWith('var(') && String(v.value).length < 40);
  if (literal(d.weights).length) L.push(`weights: ${literal(d.weights).map((v) => v.value).join(' ')}`);
  if (literal(d.lineHeights).length) L.push(`line heights: ${literal(d.lineHeights).map((v) => v.value).join(' ')}`);
  if (d.space?.length) L.push(`spacing: ${d.space.map((v) => `${v.px}px`).join(' ')}`);
  if (d.radii?.length) L.push(`radii: ${d.radii.map((v) => `${v.px}px`).join(' ')}`);
  if (d.containers?.length) L.push(`container max-widths: ${d.containers.map((v) => `${v.px}px`).join(' ')}`);
  if (d.breakpoints?.length) L.push(`breakpoints: ${d.breakpoints.map((v) => `${v}px`).join(' ')}`);
  if (d.grids?.length) L.push(`grids: ${d.grids.slice(0, 4).map((v) => v.value).join(' | ')}`);
  if (d.shadows?.length) L.push(`shadow: ${d.shadows[0].value}`);
  for (const role of ['background', 'ink', 'border', 'accent']) {
    const list = (d.colors || {})[role] || [];
    if (list.length) L.push(`${role}: ${list.slice(0, 5).map((c) => c.hex).join(' ')}`);
  }
  return L;
}

function splitBlocks(html, tag) {
  const src = String(html || '');
  const re = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, 'gi');
  const out = [];
  let depth = 0;
  let start = -1;
  let m;
  while ((m = re.exec(src))) {
    const closing = m[0][1] === '/';
    if (!closing) {
      if (depth === 0) start = m.index;
      depth += 1;
    } else if (depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        out.push(src.slice(start, m.index + m[0].length));
        start = -1;
      }
    }
  }
  if (depth > 0 && start >= 0) out.push(src.slice(start));
  return out;
}

function describeBlock(html, index) {
  const head = /^<([a-z0-9]+)([^>]*)>/i.exec(html) || [];
  const tag = (head[1] || 'section').toLowerCase();
  const attrs = head[2] || '';
  const id = /id=["']([^"']+)["']/i.exec(attrs)?.[1] || '';
  const cls = (/class=["']([^"']+)["']/i.exec(attrs)?.[1] || '')
    .split(/\s+/)
    .filter((c) => c && !/^(w-|js-|is-|has-)/.test(c))
    .slice(0, 2)
    .join('.');
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
  const anyHeading = /<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/i.exec(html)?.[2];
  const heading = clean(stripTags(h1 || anyHeading || '')).slice(0, 90);
  const paragraphs = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((x) => clean(stripTags(x[1])))
    .filter((t) => t.length > 2)
    .slice(0, 2)
    .map((t) => t.slice(0, 110));
  const links = [
    ...new Set(
      [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)]
        .map((x) => clean(stripTags(x[1])))
        .filter((t) => t && t.length < 48)
    ),
  ].slice(0, 8);
  const buttons = [
    ...new Set(
      [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)].map((x) => clean(stripTags(x[1]))).filter(Boolean)
    ),
  ].slice(0, 5);
  const imgs = (html.match(/<img\b/gi) || []).length;
  const items = (html.match(/<li\b/gi) || []).length;
  const cards = (html.match(/<(article|figure)\b/gi) || []).length;
  const bg = /style=["'][^"']*background(?:-color)?\s*:\s*([^;"']+)/i.exec(html)?.[1]?.trim() || '';
  const line = `${index}. ${tag}${id ? `#${id}` : ''}${cls ? `.${cls}` : ''} — ${
    heading ? `h "${heading}"` : 'no heading'
  }${paragraphs.length ? ` · p "${paragraphs[0].slice(0, 80)}"` : ''}${
    links.length ? ` · links [${links.join(', ')}]` : ''
  }${buttons.length ? ` · buttons [${buttons.join(', ')}]` : ''}${imgs ? ` · ${imgs} img` : ''}${
    items ? ` · ${items} li` : ''
  }${cards ? ` · ${cards} card(s)` : ''}${bg ? ` · bg ${bg}` : ''}`;
  return { index, tag, id, cls, heading, paragraphs, links, buttons, imgs, items, cards, bg, line };
}

export function outlineFromHtml(html) {
  const src = String(html || '');
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(src)?.[1] || src;
  const tags = ['section', 'header', 'footer', 'main', 'article'];
  const re = /<(\/?)(section|header|footer|main|article)\b[^>]*>/gi;
  const blocks = [];
  let depth = 0;
  let start = -1;
  let tag = '';
  let m;
  while ((m = re.exec(body))) {
    const closing = m[1] === '/';
    if (!closing) {
      if (depth === 0) {
        start = m.index;
        tag = m[2].toLowerCase();
      }
      depth += 1;
    } else if (depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        blocks.push({ tag, html: body.slice(start, m.index + m[0].length) });
        start = -1;
      }
    }
  }
  if (depth > 0 && start >= 0) blocks.push({ tag, html: body.slice(start) });
  const ordered = [];
  for (const b of blocks) {
    if (b.tag === 'main' && /<section\b/i.test(b.html)) {
      for (const part of splitBlocks(b.html, 'section')) ordered.push({ tag: 'section', html: part });
    } else ordered.push(b);
  }
  const usable = ordered.filter((b) => tags.includes(b.tag));
  if (usable.length && !usable.some((b) => /<h1\b/i.test(b.html))) {
    const hit = /<h1\b[^>]*>[\s\S]*?<\/h1>/i.exec(body);
    if (hit) {
      const from = Math.max(0, body.lastIndexOf('<', Math.max(0, hit.index - 2500)));
      const hero = body.slice(from, Math.min(body.length, hit.index + 6000));
      const at = usable.findIndex((b) => b.tag === 'section');
      usable.splice(at === -1 ? usable.length : at, 0, { tag: 'section', html: hero });
    }
  }
  const described = usable
    .map((b) => describeBlock(b.html, 0))
    .filter((d) => d.heading || d.paragraphs.length || d.buttons.length || d.imgs || d.items || d.links.length);
  return described.map((d, i) => {
    const index = i + 1;
    return { ...d, index, line: d.line.replace(/^\d+\./, `${index}.`) };
  });
}

export function renderDesignMarkdown(d) {
  const L = [`# Measured design — ${d.target || 'reference'}`];
  const s = d.design || {};
  if (s.typeScale?.length) L.push(`\n## Type scale\n${s.typeScale.map((v) => `- ${v.px}px ×${v.count}`).join('\n')}`);
  if (s.weights?.length) L.push(`\n## Weights\n${s.weights.map((v) => `- ${v.value} ×${v.count}`).join('\n')}`);
  if (s.lineHeights?.length) L.push(`\n## Line heights\n${s.lineHeights.map((v) => `- ${v.value} ×${v.count}`).join('\n')}`);
  if (s.space?.length) L.push(`\n## Spacing\n${s.space.map((v) => `- ${v.px}px ×${v.count}`).join('\n')}`);
  if (s.radii?.length) L.push(`\n## Radii\n${s.radii.map((v) => `- ${v.px}px`).join('\n')}`);
  if (s.containers?.length) L.push(`\n## Containers\n${s.containers.map((v) => `- ${v.px}px ×${v.count}`).join('\n')}`);
  if (s.breakpoints?.length) L.push(`\n## Breakpoints\n${s.breakpoints.map((v) => `- ${v}px`).join('\n')}`);
  if (s.grids?.length) L.push(`\n## Grids\n${s.grids.map((v) => `- ${v.value} ×${v.count}`).join('\n')}`);
  for (const [role, list] of Object.entries(s.colors || {})) {
    if (list.length) L.push(`\n## ${role}\n${list.map((c) => `- ${c.hex} ×${c.count}`).join('\n')}`);
  }
  if (d.outline?.length) L.push(`\n## Page outline\n${d.outline.map((o) => o.line).join('\n')}`);
  return L.join('\n');
}

async function readRobots(base) {
  const info = { disallow: [], sitemaps: [], ok: false, raw: '' };
  try {
    const txt = await proxyGet(`${base}/robots.txt`, { timeoutMs: 15000 });
    info.ok = true;
    info.raw = txt.slice(0, 4000);
    let applies = false;
    for (const line of txt.split(/\r?\n/)) {
      const l = line.trim();
      if (/^user-agent:/i.test(l)) applies = /star|\*/i.test(l.split(':')[1] || '');
      else if (applies && /^disallow:/i.test(l)) {
        const p = l.split(':').slice(1).join(':').trim();
        if (p) info.disallow.push(p);
      } else if (/^sitemap:/i.test(l)) info.sitemaps.push(l.split(':').slice(1).join(':').trim());
    }
  } catch {

  }
  return info;
}

function allowedByRobots(url, robots) {
  try {
    const p = new URL(url).pathname;
    return !robots.disallow.some((d) => d !== '/' && p.startsWith(d));
  } catch {
    return true;
  }
}

async function discoverPages(base, robots, primary) {
  const found = [];
  const addPage = (u) => {
    const abs = absolutize(u, base);
    if (!abs) return;
    if (origin(abs) !== origin(base)) return;
    if (/\.(png|jpe?g|webp|gif|svg|pdf|zip|mp4|css|js|json|xml|ico|woff2?)$/i.test(abs)) return;
    if (!found.includes(abs)) found.push(abs);
  };

  for (const sm of robots.sitemaps.slice(0, 2)) {
    try {
      const xml = await proxyGet(sm, { timeoutMs: 20000, maxBytes: 1024 * 1024 });
      const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].slice(0, 40);
      for (const l of locs) addPage(decodeEntities(l[1]));
    } catch {}
  }
  if (found.length < 4) {
    try {
      const xml = await proxyGet(`${base}/sitemap.xml`, { timeoutMs: 20000, maxBytes: 1024 * 1024 });
      for (const l of [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].slice(0, 40)) addPage(decodeEntities(l[1]));
    } catch {}
  }
  for (const l of primary.links.slice(0, 30)) {
    const u = l.split(' -> ')[1];
    if (u) addPage(u);
  }
  return found.filter((u) => allowedByRobots(u, robots));
}

export async function recon({
  target,
  kind = 'site',
  url,
  brief,
  outDir,
  log = () => {},
  shots = true,
  pages = 6,
  useRea = true,
  signal,
}) {
  resetBudget();
  const started = Date.now();
  const reconDir = ensureDir(path.join(outDir, '_recon'));
  const dossier = {
    target,
    kind,
    url: url || null,
    userBrief: brief || '',
    startedAt: new Date().toISOString(),
    shots: [],
    pages: [],
    subPages: [],
    palette: [],
    fonts: [],
    webIntel: [],
    robots: null,
    notes: [],
  };

  if (url) {
    const base = origin(url);
    log('info', `Reference: ${url}`);

    const robots = await readRobots(base);
    dossier.robots = { ok: robots.ok, entries: robots.disallow.length, sitemaps: robots.sitemaps.length };
    log('dim', robots.ok ? `robots.txt: ${robots.disallow.length} disallow rule(s)` : 'robots.txt: none');

    if (shots) {
      const variants = [
        { label: 'desktop 1440', width: 1440, height: 900, fullPage: false },
        { label: 'desktop full page', width: 1440, height: 900, fullPage: true },
        { label: 'mobile 390', width: 390, height: 844, fullPage: false },
        { label: 'dark mode', width: 1440, height: 900, dark: true, fullPage: false },
        { label: 'tablet 834', width: 834, height: 1112, fullPage: false },
      ];
      for (const v of variants) {
        const file = path.join(reconDir, 'shots', `${v.label.replace(/[^a-z0-9]+/gi, '-')}.webp`);
        try {
          const r = await screenshot(url, file, v);
          dossier.shots.push({ file: path.relative(outDir, file).replace(/\\/g, '/'), label: v.label, ok: true, bytes: r.bytes });
          log('ok', `screenshot ${v.label} · ${(r.bytes / 1024).toFixed(0)} KB`);
        } catch (e) {
          dossier.shots.push({ file: null, label: v.label, ok: false });
          log('warn', `screenshot ${v.label} failed: ${e.message}`);
        }
        await sleep(250);
      }
    }

    let primaryHtml = '';
    const sheets = [];
    try {
      primaryHtml = await proxyGet(url);
      writeText(path.join(reconDir, 'html', 'index.html'), primaryHtml);
      log('ok', `html index.html · ${(primaryHtml.length / 1024).toFixed(0)} KB`);
    } catch (e) {
      log('warn', `html fetch failed: ${e.message}`);
    }

    const primary = primaryHtml ? extractPage(primaryHtml, url) : { links: [], stylesheets: [], fonts: [], cssText: '' };
    dossier.primary = {
      url,
      title: primary.title,
      description: primary.description,
      headings: primary.headings,
      nav: primary.nav,
      buttons: primary.buttons,
      forms: primary.forms,
      links: primary.links,
      images: primary.images,
      sections: primary.sections,
      tech: primary.tech,
      text: primary.text,
    };
    log('dim', `structure: ${(primary.headings || []).length} headings · ${(primary.nav || []).length} nav · ${
      (primary.buttons || []).length
    } buttons · ${(primary.images || []).length} images`);

    const cssTexts = [primary.cssText || ''];
    const sheetUrls = (primary.stylesheets || []).filter((s) => origin(s) === base).slice(0, 14);
    for (const sheet of sheetUrls) {
      try {
        let text = '';
        for (let attempt = 0; attempt < 3 && !text; attempt++) {
          try {
            text = await proxyGet(sheet, { timeoutMs: 25000, maxBytes: 1800000 });
          } catch (err) {
            if (attempt === 2) throw err;
            await sleep(1200 * (attempt + 1));
          }
        }
        cssTexts.push(text);
        const name = new URL(sheet).pathname.split('/').filter(Boolean).pop() || 'sheet.css';
        const rel = `_recon/assets/css/${name}`;
        writeText(path.join(outDir, rel), text);
        sheets.push({ url: sheet, file: rel });
        log('dim', `css ${new URL(sheet).pathname.slice(0, 60)}`);
      } catch (e) {
        log('dim', `css skipped: ${e.message}`);
      }
      await sleep(200);
    }
    dossier.palette = paletteFromCss(cssTexts);
    dossier.design = designFromCss(cssTexts);
    dossier.designLines = designLinesFrom(dossier.design);
    dossier.outline = primaryHtml ? outlineFromHtml(primaryHtml) : [];
    writeText(path.join(reconDir, 'design.md'), renderDesignMarkdown(dossier));
    log(
      'ok',
      `design: ${dossier.design.typeScale.length} type sizes · ${dossier.outline.length} sections · ${
        dossier.design.containers.length
      } container widths`
    );
    dossier.fonts = fontsFrom([
      ...(primary.fonts || []),
      ...[...cssTexts.join('\n').matchAll(/font-family\s*:\s*([^;}"]+)/gi)].map(
        (m) => m[1].split(',')[0].replace(/["']/g, '').trim()
      ),
    ]);
    log('ok', `palette: ${dossier.palette.slice(0, 5).map((c) => c.hex).join(' ')}`);
    if (primaryHtml) dossier.capture = { html: '_recon/html/index.html', base: url, sheets };

    if (pages > 0) {
      const candidates = (await discoverPages(url, robots, primary)).filter((u) => u !== url).slice(0, pages);
      for (const pageUrl of candidates) {
        try {
          const html = await proxyGet(pageUrl, { timeoutMs: 25000 });
          const name = new URL(pageUrl).pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'page';
          writeText(path.join(reconDir, 'html', `${name}.html`), html);
          const ex = extractPage(html, pageUrl);
          dossier.subPages.push({
            url: pageUrl,
            title: ex.title,
            headings: ex.headings.slice(0, 16),
            text: truncate(ex.text, 1200),
            nav: ex.nav,
            buttons: ex.buttons,
          });
          dossier.pages.push({ url: pageUrl, title: ex.title });
          log('dim', `page ${new URL(pageUrl).pathname}`);
        } catch (e) {
          log('dim', `page skipped ${pageUrl}: ${e.message}`);
        }
        await sleep(250);
      }
      if (url) dossier.pages.unshift({ url, title: primary.title });
    }
  }

  const name = target.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const queries =
    kind === 'site' || kind === 'app'
      ? [`${name} design breakdown`, `${name} features and user flow`, `${name} clone open source`]
      : [`${target} gameplay mechanics`, `${target} art style and design`, `${target} feature list`];
  for (const q of queries) {
    try {
      const results = await webSearch(q, 6);
      for (const r of results) {
        if (!dossier.webIntel.some((x) => x.url === r.url)) dossier.webIntel.push({ ...r, query: q });
      }
      log('dim', `search "${q}" → ${results.length} results`);
    } catch (e) {
      log('warn', `search failed: ${e.message}`);
    }
    await sleep(400);
  }

  const readable = dossier.webIntel
    .filter((r) => !/youtube\.com|twitter\.com|x\.com|facebook\.com/.test(r.url))
    .slice(0, 2);
  for (const r of readable) {
    try {
      const html = await proxyGet(r.url, { timeoutMs: 25000, maxBytes: 1.5 * 1024 * 1024 });
      r.excerpt = stripTags(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')).slice(0, 2500);
      log('dim', `read ${new URL(r.url).hostname}`);
    } catch {}
    await sleep(300);
  }

  if (useRea && url) {
    try {
      const r = await analyzeWebsite(url, { signal, log });
      dossier.rea = {
        ok: Boolean(r.ok && r.summary),
        tool: r.tool || null,
        reason: r.reason || null,
        summary: r.ok ? r.summary : null,
        ms: r.ms || 0,
      };
      if (r.ok && r.summary) writeText(path.join(reconDir, 'rea-evidence.md'), r.summary);
      log(r.ok ? 'ok' : 'dim', reaLabel(r));
    } catch (e) {
      dossier.rea = { ok: false, reason: e.message, tool: null, summary: null, ms: 0 };
      log('dim', `REA skipped: ${e.message}`);
    }
  }

  dossier.finishedAt = new Date().toISOString();
  dossier.requests = requestBudget;
  dossier.elapsedMs = Date.now() - started;

  const md = renderDossierMarkdown(dossier);
  writeText(path.join(reconDir, 'dossier.md'), md);
  writeText(path.join(reconDir, 'dossier.json'), JSON.stringify(dossier, null, 2));
  log('ok', `dossier ready · ${(md.length / 1024).toFixed(0)} KB · ${dossier.requests} requests · ${(
    dossier.elapsedMs / 1000
  ).toFixed(1)}s`);

  return { dossier, markdown: md };
}

export function renderDossierMarkdown(d) {
  const L = [];
  L.push(`# Recon dossier — ${d.target}`);
  L.push(`kind: ${d.kind}${d.url ? ` · url: ${d.url}` : ''}`);
  if (d.userBrief) L.push(`\n**User brief:** ${d.userBrief}`);
  L.push(`\nGenerated ${d.finishedAt} · ${d.requests} proxied requests`);
  if (d.shots.length) {
    L.push(`\n## Screenshots\n${d.shots.map((s) => `- ${s.label}: ${s.ok ? s.file : 'failed'}`).join('\n')}`);
  }
  if (d.primary) {
    const p = d.primary;
    L.push(`\n## Primary page\n- title: ${p.title}\n- description: ${p.description}`);
    if (p.tech?.length) L.push(`- stack hints: ${p.tech.join(', ')}`);
    L.push(`\n### Headings\n${p.headings.map((h) => `- ${h}`).join('\n')}`);
    L.push(`\n### Navigation\n${p.nav.join(' | ')}`);
    L.push(`\n### Buttons\n${p.buttons.join(' | ')}`);
    L.push(`\n### Form controls\n${p.forms.join(' | ')}`);
    L.push(`\n### Sections\n${p.sections.slice(0, 20).join('\n')}`);
    L.push(`\n### Body copy sample\n${p.text.slice(0, 1800)}`);
  }
  if (d.palette.length) {
    L.push(`\n## Palette\n${d.palette.map((c) => `- ${c.hex} (${c.count})`).join('\n')}`);
  }
  if (d.fonts.length) L.push(`\n## Fonts\n${d.fonts.map((f) => `- ${f.family} (${f.count})`).join('\n')}`);
  if (d.designLines?.length) L.push(`\n## Measured design\n${d.designLines.map((l) => `- ${l}`).join('\n')}`);
  if (d.outline?.length) L.push(`\n## Page outline\n${d.outline.map((o) => `- ${o.line}`).join('\n')}`);
  if (d.subPages.length) {
    L.push(`\n## Secondary pages`);
    for (const p of d.subPages) {
      L.push(`\n### ${p.title} — ${p.url}\n${p.headings.join(' | ')}\n${p.text.slice(0, 500)}`);
    }
  }
  if (d.webIntel.length) {
    L.push(`\n## Web research`);
    for (const r of d.webIntel) {
      L.push(`- **${r.title}** — ${r.url}\n  ${r.snippet}${r.excerpt ? `\n  > ${r.excerpt.slice(0, 600)}` : ''}`);
    }
  }
  if (d.rea) {
    L.push(
      d.rea.ok
        ? `\n## REA inspection\ntool: ${d.rea.tool} · ${(d.rea.ms / 1000).toFixed(1)}s\n\n${d.rea.summary}`
        : `\n## REA inspection\nnot used: ${d.rea.reason}`
    );
  }
  if (d.robots) L.push(`\n## Robots\n${JSON.stringify(d.robots)}`);
  return L.join('\n');
}
