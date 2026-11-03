

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const W = 1000;
const H = 780;
const OUT = process.argv[2] || 'ui/assets/ship.png';

const mask = new Uint8Array(W * H);
const punches = [];

const set = (x, y) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  mask[y * W + x] = 1;
};

function line(x0, y0, x1, y1, width = 1) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1;
  const r = Math.max(0, (width - 1) / 2);
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy += 1) {
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx += 1) {
        if (width <= 1 || dx * dx + dy * dy <= r * r + 0.5) set(Math.round(x) + dx, Math.round(y) + dy);
      }
    }
  }
}

function polygon(points) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of points) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y += 1) {
    const crossings = [];
    for (let i = 0; i < points.length; i += 1) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      if (y1 === y2) continue;
      if ((y >= y1 && y < y2) || (y >= y2 && y < y1)) {
        crossings.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    crossings.sort((a, b) => a - b);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      for (let x = Math.ceil(crossings[i]); x <= Math.floor(crossings[i + 1]); x += 1) set(x, y);
    }
  }
}

function sail(cx, top, width, height) {
  const half = width / 2;
  const pts = [];
  const steps = 34;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    pts.push([cx - half + width * t, top - Math.sin(t * Math.PI) * height * 0.035]);
  }
  for (let i = steps; i >= 0; i -= 1) {
    const t = i / steps;
    const inset = half * 0.07;
    pts.push([
      cx - half + inset + (width - inset * 2) * t,
      top + height + Math.sin(t * Math.PI) * height * 0.11,
    ]);
  }
  polygon(pts);

  for (const f of [0.36, 0.68]) {
    punches.push({ x: cx - half - 2, y: Math.round(top + height * f), w: width + 4, h: 3 });
  }
  return { x: cx - half, y: top, w: width, h: height };
}

polygon([
  [238, 520],
  [768, 520],
  [808, 486],
  [736, 624],
  [292, 624],
]);
polygon([
  [238, 520],
  [238, 448],
  [388, 448],
  [414, 520],
]);
line(292, 624, 736, 624, 9);
line(292, 626, 268, 682, 5);
line(736, 626, 760, 682, 5);

line(250, 540, 780, 540, 3);
line(246, 468, 396, 468, 3);

for (let x = 322; x <= 700; x += 56) punches.push({ x, y: 566, w: 14, h: 14 });

for (let x = 262; x <= 348; x += 30) punches.push({ x, y: 486, w: 12, h: 18 });

line(792, 508, 908, 444, 5);

const masts = [
  { x: 356, top: 196 },
  { x: 524, top: 118 },
  { x: 692, top: 210 },
];
for (const m of masts) line(m.x, 540, m.x, m.top, 7);

for (const m of masts) {
  line(m.x - 22, m.top + 30, m.x + 22, m.top + 30, 7);
  line(m.x - 18, m.top + 34, m.x - 18, m.top + 44, 3);
  line(m.x + 18, m.top + 34, m.x + 18, m.top + 44, 3);
}

sail(356, 250, 134, 112);
sail(356, 396, 150, 106);
sail(524, 182, 158, 122);
sail(524, 336, 170, 116);
sail(692, 264, 130, 108);
sail(692, 402, 146, 102);

line(356, 212, 246, 520, 2);
line(692, 226, 776, 526, 2);
line(524, 134, 356, 212, 2);
line(524, 134, 692, 226, 2);

polygon([
  [524, 112],
  [610, 131],
  [524, 150],
]);

const waves = [
  { y: 664, len: 46, gap: 34, amp: 7 },
  { y: 690, len: 62, gap: 30, amp: 9 },
  { y: 716, len: 84, gap: 26, amp: 11 },
  { y: 744, len: 110, gap: 22, amp: 13 },
];
for (const w of waves) {
  let x = 40;
  let i = 0;
  while (x < W - 40) {
    const y = w.y + Math.round(Math.sin(x / 130 + i) * w.amp);
    line(x, y, x + w.len, y - Math.round(w.amp * 0.35), 4);
    x += w.len + w.gap + (i % 3) * 8;
    i += 1;
  }
}

const solid = mask.slice();
for (let y = 1; y < H - 1; y += 1) {
  for (let x = 1; x < W - 1; x += 1) {
    const i = y * W + x;
    if (!solid[i]) continue;
    const edge =
      !solid[i - 1] || !solid[i + 1] || !solid[i - W] || !solid[i + W] ||
      !solid[i - W - 1] || !solid[i - W + 1] || !solid[i + W - 1] || !solid[i + W + 1];
    if (edge) continue;
    if (x % 4 === 0 && y % 4 === 0) mask[i] = 0;
  }
}

for (const p of punches) {
  for (let y = p.y; y < p.y + p.h; y += 1) {
    for (let x = p.x; x < p.x + p.w; x += 1) {
      if (x >= 0 && y >= 0 && x < W && y < H) mask[y * W + x] = 0;
    }
  }
}

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y += 1) {
  const row = y * (W * 4 + 1);
  raw[row] = 0;
  for (let x = 0; x < W; x += 1) {
    const on = mask[y * W + x];
    const o = row + 1 + x * 4;
    raw[o] = on ? 255 : 0;
    raw[o + 1] = on ? 255 : 0;
    raw[o + 2] = on ? 255 : 0;
    raw[o + 3] = 255;
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const target = resolve(OUT);
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, png);
console.log(`wrote ${OUT} (${W}x${H}, ${(png.length / 1024).toFixed(1)} KB)`);
