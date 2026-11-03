

export function parseArtHtml(htmlText) {
  const doc = new DOMParser().parseFromString(htmlText, 'text/html');
  const pre = doc.querySelector('pre') || doc.body;
  if (!pre) throw new Error('That file has no markup to read.');

  const rows = [[]];
  const closeRow = () => {
    rows.push([]);
  };

  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.nodeValue || '';
        for (let i = 0; i < text.length; i += 1) {
          if (text[i] === '\n') closeRow();
        }
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = child.tagName;
      if (tag === 'BR') {
        closeRow();
        continue;
      }
      if (tag === 'SPAN' || tag === 'B' || tag === 'I' || tag === 'FONT') {
        const style = `${child.getAttribute('style') || ''} ${child.getAttribute('color') || ''}`;
        const rgb = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i.exec(style);
        const hexAttr = /#([0-9a-f]{6})\b/i.exec(style);
        let hex = '';
        if (rgb) {
          hex = `#${[1, 2, 3].map((i) => Number(rgb[i]).toString(16).padStart(2, '0')).join('')}`;
        } else if (hexAttr) {
          hex = `#${hexAttr[1].toLowerCase()}`;
        }
        const glyph = (child.textContent || '').trim();
        const filled = glyph.length > 0 && !/^\s*$/.test(glyph);

        const hasElementChild = child.querySelector && child.querySelector('span');
        if (hasElementChild && !rgb && !hexAttr) {
          walk(child);
          continue;
        }
        if (hex && filled) rows[rows.length - 1].push(hex);
        else if (hex) rows[rows.length - 1].push('');
        else if (filled) rows[rows.length - 1].push('');
        continue;
      }
      walk(child);
    }
  };

  walk(pre);

  while (rows.length && rows[0].length === 0) rows.shift();
  while (rows.length && rows[rows.length - 1].length === 0) rows.pop();
  if (!rows.length) throw new Error('No pixel rows found in that file.');

  let cols = 0;
  for (const row of rows) cols = Math.max(cols, row.length);
  if (cols < 4) throw new Error(`Only ${cols} pixel column(s) — that does not look like pixel art.`);

  const cells = new Array(cols * rows.length).fill('');
  rows.forEach((row, r) => {
    row.forEach((hex, c) => {
      cells[r * cols + c] = hex;
    });
  });

  let dropped = 0;
  for (let i = 0; i < cells.length; i += 1) {
    const hex = cells[i];
    if (!hex) continue;
    const n = parseInt(hex.slice(1), 16);
    const lum = (n >> 16 & 255) * 0.299 + (n >> 8 & 255) * 0.587 + (n & 255) * 0.114;
    if (lum < 16) {
      cells[i] = '';
      dropped += 1;
    }
  }

  return { cols, rows: rows.length, cells, dropped, savedAt: new Date().toISOString() };
}

export async function artFromFile(file) {
  const text = await file.text();
  if (!/<pre|<span/i.test(text)) throw new Error('That file is not an ascii-art .html file.');
  return parseArtHtml(text);
}
