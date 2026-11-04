import fs from 'node:fs';
import path from 'node:path';

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

function readText(dir, name) {
  try {
    return fs.readFileSync(path.join(dir, name), 'utf8');
  } catch {
    return '';
  }
}

function readCss(dir, html) {
  let css = '';
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isFile() && /\.css$/i.test(e.name)) css += `\n${readText(dir, e.name)}`;
    }
  } catch {}
  for (const m of String(html).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) css += `\n${m[1]}`;
  return css;
}

const nums = (list) => (list || []).map((v) => Number(v.px)).filter((n) => Number.isFinite(n));

function coverage(wanted, haystack, match) {
  const list = [...new Set(wanted)];
  if (!list.length) return { ratio: 1, missing: [] };
  const missing = list.filter((value) => !match(value, haystack));
  return { ratio: (list.length - missing.length) / list.length, missing };
}

const pxPresent = (value, hay) => new RegExp(`(^|[^\\d.])${value}px`).test(hay);
const hexPresent = (value, hay) => hay.includes(String(value).toLowerCase());

export function scoreBuild(dir, dossier = {}) {
  const html = readText(dir, 'index.html');
  if (!html) {
    return { score: 0, dimensions: [], gaps: ['index.html is missing'], missing: {} };
  }
  const css = readCss(dir, html);
  const trace = `${html}\n${css}`.toLowerCase();
  const design = dossier.design || {};
  const outline = Array.isArray(dossier.outline) ? dossier.outline : [];
  const primary = dossier.primary || {};
  const gaps = [];
  const dimensions = [];

  const typeCov = coverage(nums(design.typeScale), trace, pxPresent);
  dimensions.push({ id: 'type', label: 'type scale', weight: 18, ratio: typeCov.ratio });
  if (typeCov.missing.length) gaps.push(`measured type sizes missing: ${typeCov.missing.map((n) => `${n}px`).join(', ')}`);

  const wrapCov = coverage(nums(design.containers), trace, pxPresent);
  dimensions.push({ id: 'containers', label: 'container widths', weight: 14, ratio: wrapCov.ratio });
  if (wrapCov.missing.length) gaps.push(`container widths missing: ${wrapCov.missing.map((n) => `${n}px`).join(', ')}`);

  const radiusCov = coverage(nums(design.radii), trace, pxPresent);
  dimensions.push({ id: 'radii', label: 'radii', weight: 6, ratio: radiusCov.ratio });
  if (radiusCov.missing.length) gaps.push(`corner radii missing: ${radiusCov.missing.map((n) => `${n}px`).join(', ')}`);

  const palette = (dossier.palette || []).map((c) => c.hex).filter(Boolean);
  const colourCov = coverage(palette, trace, hexPresent);
  dimensions.push({ id: 'colour', label: 'palette', weight: 16, ratio: colourCov.ratio });
  if (colourCov.missing.length) gaps.push(`palette colours missing: ${colourCov.missing.slice(0, 8).join(', ')}`);

  const headings = outline.map((o) => norm(o.heading)).filter((h) => h.length > 2);
  const headCov = coverage(headings, norm(html).replace(/[^a-z0-9]+/g, ' '), (value, hay) => hay.includes(norm(value).replace(/[^a-z0-9]+/g, ' ')));
  dimensions.push({ id: 'headings', label: 'outline headings', weight: 18, ratio: headCov.ratio });
  if (headCov.missing.length) gaps.push(`outline headings missing: ${headCov.missing.slice(0, 6).join(' | ')}`);

  const nav = (primary.nav || []).map(norm).filter((n) => n.length > 1);
  const navCov = coverage(nav, norm(html), (value, hay) => hay.includes(value));
  dimensions.push({ id: 'nav', label: 'navigation labels', weight: 10, ratio: navCov.ratio });
  if (navCov.missing.length) gaps.push(`navigation labels missing: ${navCov.missing.slice(0, 8).join(', ')}`);

  const sections = (html.match(/<section\b/gi) || []).length;
  const wanted = Math.max(1, outline.filter((o) => o.heading || o.tag === 'section').length);
  const sectionRatio = Math.min(1, sections / wanted);
  dimensions.push({ id: 'sections', label: 'section count', weight: 10, ratio: sectionRatio });
  if (sections < wanted) gaps.push(`only ${sections} section(s) for ${wanted} in the outline`);

  const breakpoints = nums(design.breakpoints);
  const bpWanted = breakpoints.length ? [breakpoints[0], breakpoints[Math.floor(breakpoints.length / 2)]] : [];
  const bpCov = coverage(bpWanted, trace, (value, hay) => pxPresent(value, hay) || new RegExp(`\\b${value}px`).test(hay));
  dimensions.push({ id: 'responsive', label: 'breakpoints', weight: 8, ratio: bpCov.ratio });
  if (bpCov.missing.length) gaps.push(`breakpoints missing: ${bpCov.missing.map((n) => `${n}px`).join(', ')}`);

  const total = dimensions.reduce((sum, d) => sum + d.weight, 0) || 1;
  const score = Math.round((dimensions.reduce((sum, d) => sum + d.weight * d.ratio, 0) / total) * 100);
  return {
    score,
    dimensions: dimensions.map((d) => ({ ...d, ratio: Math.round(d.ratio * 100) })),
    gaps: gaps.slice(0, 8),
    counts: { sections, headings: headings.length, palette: palette.length },
    bytes: html.length,
  };
}

export function mergeScores(local, judged) {
  if (!judged || !Number.isFinite(judged.score)) return local;
  const score = Math.round(local.score * 0.6 + Math.min(100, Math.max(0, judged.score)) * 0.4);
  const gaps = [...new Set([...(judged.gaps || []), ...local.gaps])].slice(0, 10);
  return { ...local, score, gaps, judged: judged.score, dimensions: local.dimensions };
}
