/**
 * 生成 Tauri 需要的应用图标（纯 Node 实现，无第三方依赖）。
 * 用法：node scripts/gen-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'src-tauri/icons');
mkdirSync(outDir, { recursive: true });

/* ---------- PNG 编码 ---------- */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- 图形 ---------- */
const DARK = [0x2b, 0x30, 0x40];
const LIGHT = [0xff, 0xff, 0xff];

const insideRoundRect = (x, y, x0, y0, x1, y1, r) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
};

function sampleColor(u, v) {
  const s = 1; // 归一化坐标 0..1
  const bg = insideRoundRect(u, v, 0, 0, s, s, 0.22);
  if (!bg) return null;
  const page = insideRoundRect(u, v, 0.235, 0.2, 0.765, 0.8, 0.06);
  if (page) {
    // 页面内的三条文字线
    const lineH = 0.052;
    for (const cy of [0.35, 0.475, 0.6]) {
      if (insideRoundRect(u, v, 0.33, cy - lineH / 2, 0.67, cy + lineH / 2, lineH / 2)) return DARK;
    }
    return LIGHT;
  }
  return DARK;
}

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const subs = 4;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let hits = 0;
      for (let sy = 0; sy < subs; sy += 1) {
        for (let sx = 0; sx < subs; sx += 1) {
          const u = (x + (sx + 0.5) / subs) / size;
          const v = (y + (sy + 0.5) / subs) / size;
          const color = sampleColor(u, v);
          if (!color) continue;
          r += color[0];
          g += color[1];
          b += color[2];
          hits += 1;
        }
      }
      const total = subs * subs;
      const i = (y * size + x) * 4;
      if (hits === 0) continue;
      rgba[i] = Math.round(r / hits);
      rgba[i + 1] = Math.round(g / hits);
      rgba[i + 2] = Math.round(b / hits);
      rgba[i + 3] = Math.round((hits / total) * 255);
    }
  }
  return encodePng(size, rgba);
}

/* ---------- ICO（内嵌 PNG，Vista+ 支持） ---------- */
function encodeIco(png, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size;
  entry[1] = size >= 256 ? 0 : size;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, png]);
}

const files = [
  ['32x32.png', 32],
  ['128x128.png', 128],
  ['128x128@2x.png', 256],
  ['icon.png', 512]
];

for (const [name, size] of files) {
  writeFileSync(resolve(outDir, name), render(size));
  console.log('生成', name, `${size}x${size}`);
}

writeFileSync(resolve(outDir, 'icon.ico'), encodeIco(render(256), 256));
console.log('生成 icon.ico 256x256');
