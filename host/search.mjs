

import { stripTags, decodeEntities } from './util.mjs';

function unwrap(href) {
  let url = decodeEntities(href);
  const uddg = /[?&]uddg=([^&]+)/.exec(url);
  if (uddg) {
    try {
      url = decodeURIComponent(uddg[1]);
    } catch {}
  }
  return url;
}

export function decodeBing(href) {
  const raw = decodeEntities(href);
  const m = /[?&]u=a1([^&]+)/.exec(raw);
  if (!m) return null;
  try {
    const b64 = decodeURIComponent(m[1]).replace(/-/g, '+').replace(/_/g, '/');
    const url = Buffer.from(b64, 'base64').toString('utf8');
    return /^https?:\/\//i.test(url) ? url : null;
  } catch {
    return null;
  }
}

function usable(hit) {
  if (!hit.url || !/^https?:\/\//i.test(hit.url)) return false;
  if (/(^|\.)(bing|duckduckgo|google|yandex)\.[a-z.]+\/(ck\/a|y\.js|l\/)/i.test(hit.url)) return false;
  return hit.title.length >= 3;
}

export function parseLite(html) {
  const out = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < 30) {
    if (!/result-link/i.test(m[1])) continue;
    const href = /href=['"]([^'"]+)['"]/i.exec(m[1]);
    if (!href) continue;
    const after = html.slice(re.lastIndex, re.lastIndex + 1600);
    const snip = /class=['"][^'"]*result-snippet[^'"]*['"][^>]*>([\s\S]*?)<\/td>/i.exec(after);
    out.push({
      title: stripTags(m[2]).slice(0, 200),
      url: unwrap(href[1]),
      snippet: snip ? stripTags(snip[1]).slice(0, 400) : '',
    });
  }
  return out;
}

export function parseDdgHtml(html) {
  const out = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < 30) {
    if (!/result__a/i.test(m[1])) continue;
    const href = /href=['"]([^'"]+)['"]/i.exec(m[1]);
    if (!href) continue;
    const after = html.slice(re.lastIndex, re.lastIndex + 2000);
    const snip = /class=['"][^'"]*result__snippet[^'"]*['"][^>]*>([\s\S]*?)<\/a>/i.exec(after);
    out.push({
      title: stripTags(m[2]).slice(0, 200),
      url: unwrap(href[1]),
      snippet: snip ? stripTags(snip[1]).slice(0, 400) : '',
    });
  }
  return out;
}

export function parseBing(html) {
  const out = [];
  const re = /<h2>\s*<a\b([^>]*)>([\s\S]*?)<\/a>\s*<\/h2>([\s\S]{0,2000}?)(?=<h2>\s*<a\b|$)/gi;
  let m;
  while ((m = re.exec(html)) && out.length < 30) {
    const href = /href="([^"]+)"/i.exec(m[1]);
    if (!href) continue;
    const url = decodeBing(href[1]) || unwrap(href[1]);
    const snip = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(m[3]);
    out.push({
      title: stripTags(m[2]).slice(0, 200),
      url,
      snippet: snip ? stripTags(snip[1]).slice(0, 400) : '',
    });
  }
  return out;
}

export async function searchWeb(query, limit = 8, fetchText) {
  const q = encodeURIComponent(query);
  const sources = [
    [`https://lite.duckduckgo.com/lite/?q=${q}`, parseLite],
    [`https://html.duckduckgo.com/html/?q=${q}`, parseDdgHtml],
    [`https://www.bing.com/search?q=${q}`, parseBing],
  ];
  for (const [url, parse] of sources) {
    try {
      const html = await fetchText(url);
      const hits = parse(html).filter(usable);
      if (hits.length) return hits.slice(0, limit);
    } catch {

    }
  }
  return [];
}
