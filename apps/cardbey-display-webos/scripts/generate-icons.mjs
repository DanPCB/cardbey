/**
 * Generate temporary Cardbey Display launcher icons:
 * red circle with a simple white "C" mark.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function drawLogo(x, y, size) {
  const bg = [232, 43, 43, 255];
  const ink = [255, 255, 255, 255];
  const cx = size / 2;
  const cy = size / 2;
  const dx = x - cx;
  const dy = y - cy;
  const r = size * 0.46;
  if (dx * dx + dy * dy > r * r) return [0, 0, 0, 0];

  const t = size * 0.2;
  const thick = Math.max(2, Math.floor(size * 0.1));
  const bar = function (x0, y0, x1, y1) {
    const minx = Math.min(x0, x1) - thick / 2;
    const maxx = Math.max(x0, x1) + thick / 2;
    const miny = Math.min(y0, y1) - thick / 2;
    const maxy = Math.max(y0, y1) + thick / 2;
    return x >= minx && x <= maxx && y >= miny && y <= maxy;
  };

  const x0 = cx - t;
  const x1 = cx + t * 0.85;
  const y0 = cy - t * 1.15;
  const y1 = cy + t * 1.15;
  const onC = bar(x0, y0, x1, y0) || bar(x0, y0, x0, y1) || bar(x0, y1, x1, y1);
  return onC ? ink : bg;
}

function png(size) {
  const raw = Buffer.alloc((1 + size * 4) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (1 + size * 4)] = 0;
    for (let x = 0; x < size; x += 1) {
      const i = y * (1 + size * 4) + 1 + x * 4;
      const c = drawLogo(x, y, size);
      raw[i] = c[0];
      raw[i + 1] = c[1];
      raw[i + 2] = c[2];
      raw[i + 3] = c[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(root, { recursive: true });
writeFileSync(join(root, 'icon.png'), png(80));
writeFileSync(join(root, 'largeIcon.png'), png(130));
console.log('Wrote temporary Cardbey C logo icons');
