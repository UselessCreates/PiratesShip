

const FONT = {
  P: ['#######', '##...##', '##...##', '##...##', '#######', '##.....', '##.....', '##.....', '##.....'],
  I: ['..###..', '..###..', '..###..', '..###..', '..###..', '..###..', '..###..', '..###..', '..###..'],
  R: ['######.', '##...##', '##...##', '##...##', '######.', '##.##..', '##..##.', '##...##', '##...##'],
  A: ['.#####.', '##...##', '##...##', '##...##', '#######', '#######', '##...##', '##...##', '##...##'],
  T: ['#######', '#######', '..###..', '..###..', '..###..', '..###..', '..###..', '..###..', '..###..'],
  E: ['#######', '##.....', '##.....', '##.....', '######.', '##.....', '##.....', '##.....', '#######'],
  S: ['######.', '##...##', '##.....', '##.....', '.######', '.....##', '.....##', '##...##', '.#####.'],
  H: ['##...##', '##...##', '##...##', '##...##', '#######', '##...##', '##...##', '##...##', '##...##'],
};

const WORD = 'PIRATESHIP';

export function buildGrid(word = WORD) {
  const glyphs = [...word].map((ch) => FONT[ch] || FONT.E);
  const rows = glyphs[0].length;
  const cols = glyphs.length * 7 + (glyphs.length - 1);
  const grid = Array.from({ length: rows }, () => Array(cols).fill(0));
  glyphs.forEach((glyph, gi) => {
    const x0 = gi * 8;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < 7; x += 1) {
        if (glyph[y][x] === '#') grid[y][x0 + x] = 1;
      }
    }
  });
  return { cols, rows, grid };
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function shade(row, rows, dark) {
  const t = rows <= 1 ? 1 : row / (rows - 1);
  if (dark) {

    const top = [246, 246, 248];
    const bottom = [104, 104, 118];
    return top.map((c, i) => Math.round(c + (bottom[i] - c) * t));
  }
  const top = [26, 26, 31];
  const bottom = [122, 122, 134];
  return top.map((c, i) => Math.round(c + (bottom[i] - c) * t));
}

function maskFor(img) {
  if (img.__psMask) return img.__psMask;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const octx = off.getContext('2d');
  octx.drawImage(img, 0, 0);
  const data = octx.getImageData(0, 0, w, h);
  const px = data.data;
  const lumAt = (i) =>
    (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) * (px[i + 3] / 255);

  let max = 1;
  for (let i = 0; i < px.length; i += 4) {
    const lum = lumAt(i);
    if (lum > max) max = lum;
  }
  const floor = max * 0.22;
  const span = Math.max(1, max - floor);
  for (let i = 0; i < px.length; i += 4) {
    const lum = lumAt(i);
    px[i] = 255;
    px[i + 1] = 255;
    px[i + 2] = 255;
    px[i + 3] = Math.max(0, Math.min(255, Math.round(((lum - floor) / span) * 255)));
  }
  octx.putImageData(data, 0, 0);
  img.__psMask = { canvas: off, px, w, h };
  return img.__psMask;
}

function poolMask(mask, w, h) {
  if (!mask.pool) mask.pool = new Map();
  const key = `${w}x${h}`;
  if (mask.pool.has(key)) return mask.pool.get(key);

  const { px, w: sw, h: sh } = mask;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(w, h);
  const d = out.data;

  for (let y = 0; y < h; y += 1) {
    const y0 = Math.floor((y * sh) / h);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * sh) / h));
    for (let x = 0; x < w; x += 1) {
      const x0 = Math.floor((x * sw) / w);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * sw) / w));
      let best = 0;
      for (let sy = y0; sy < y1 && best < 255; sy += 1) {
        let i = (sy * sw + x0) * 4 + 3;
        for (let sx = x0; sx < x1; sx += 1, i += 4) {
          const a = px[i];
          if (a > best) best = a;
        }
      }
      const o = (y * w + x) * 4;
      d[o] = 255;
      d[o + 1] = 255;
      d[o + 2] = 255;
      d[o + 3] = best;
    }
  }
  ctx.putImageData(out, 0, 0);
  mask.pool.set(key, canvas);
  return canvas;
}

export function drawLogo(canvas, opts = {}) {
  const art = opts.art && opts.art.cells && opts.art.cells.length ? opts.art : null;
  const image = !art && opts.image && opts.image.naturalWidth ? opts.image : null;
  const { cols, rows, grid } = buildGrid();
  const totalCols = art ? art.cols : cols;
  const totalRows = art ? art.rows : rows;

  const scroller = canvas.closest('.main-scroll, .wiz-scroll') || document.body;
  const available = Math.max(240, (scroller.clientWidth || 640) - 48);
  const maxWidth = opts.maxWidth || Math.min(available, 640);

  let cellW;
  let cellH;
  let cssW;
  let cssH;

  if (image) {

    const maxHeight = opts.maxHeight || (opts.maxWidth ? 260 : 300);
    const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
    cssW = Math.max(1, Math.round(image.naturalWidth * scale));
    cssH = Math.max(1, Math.round(image.naturalHeight * scale));
  } else {

    cellW = opts.cellWidth || clamp(maxWidth / totalCols, 1, 11);
    cellH = art ? cellW * 1.5 : cellW * 1.55;
    cssW = totalCols * cellW;
    cssH = totalRows * cellH;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const dark = opts.dark !== false;

  if (image) {

    const pooled = poolMask(
      maskFor(image),
      Math.max(1, Math.round(cssW * dpr)),
      Math.max(1, Math.round(cssH * dpr))
    );
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pooled, 0, 0, cssW, cssH);
    ctx.globalCompositeOperation = 'source-in';
    const ink = ctx.createLinearGradient(0, 0, 0, cssH);
    if (dark) {
      ink.addColorStop(0, '#ffffff');
      ink.addColorStop(0.55, '#f1f1f5');
      ink.addColorStop(1, '#b6b6c4');
    } else {
      ink.addColorStop(0, '#14141a');
      ink.addColorStop(1, '#4c4c5b');
    }
    ctx.fillStyle = ink;
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.globalCompositeOperation = 'source-over';
    return { cols: image.naturalWidth, rows: image.naturalHeight, mode: 'image' };
  }

  ctx.imageSmoothingEnabled = false;
  const px = (c) => Math.round(c * cellW);
  const py = (r) => Math.round(r * cellH);

  if (art) {
    for (let r = 0; r < art.rows; r += 1) {
      for (let c = 0; c < art.cols; c += 1) {
        const hex = art.cells[r * art.cols + c];
        if (!hex) continue;
        ctx.fillStyle = hex;
        ctx.fillRect(px(c), py(r), Math.ceil(cellW), Math.ceil(cellH));
      }
    }
    return { cols: art.cols, rows: art.rows, mode: 'art' };
  }

  for (let r = 0; r < rows; r += 1) {
    const base = shade(r, rows, dark);
    for (let c = 0; c < cols; c += 1) {
      if (!grid[r][c]) continue;
      const above = r > 0 && grid[r - 1][c];
      const below = r < rows - 1 && grid[r + 1][c];
      let [rr, gg, bb] = base;
      if (!above) [rr, gg, bb] = [rr + 26, gg + 26, bb + 26];
      if (!below) [rr, gg, bb] = [rr - 22, gg - 22, bb - 18];
      ctx.fillStyle = `rgb(${clamp(rr, 0, 255)},${clamp(gg, 0, 255)},${clamp(bb, 0, 255)})`;
      ctx.fillRect(px(c), py(r), Math.ceil(cellW), Math.ceil(cellH));
    }
  }
  return { cols, rows, mode: 'word' };
}

export function makeLogoRenderer(canvas, opts = {}) {
  let art = null;
  let image = opts.image || null;
  let dark = opts.dark !== false;
  const render = () => drawLogo(canvas, { ...opts, art, image, dark });
  const ro = new ResizeObserver(() => render());
  ro.observe(canvas.parentElement || canvas);
  window.addEventListener('resize', render);
  render();
  return {
    setArt(next) {
      art = next && next.cells && next.cells.length ? next : null;
      render();
    },
    setImage(next) {
      image = next || null;
      render();
    },
    setDark(value) {
      dark = Boolean(value);
      render();
    },
    clearArt() {
      art = null;
      render();
    },
    get art() {
      return art;
    },
    render,
  };
}
