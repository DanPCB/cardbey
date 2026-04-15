/**
 * One-time maintenance: convert locally-absolute Media / SignageAsset URLs to relative paths
 * (e.g. http://192.168.1.12:3001/uploads/media/x.mp4 -> /uploads/media/x.mp4).
 *
 * Usage (from repo root, with DATABASE_URL set):
 *   node scripts/normalize-stored-media-urls-to-relative.mjs
 *
 * Safe to re-run: rows already relative or CloudFront are unchanged.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.join(__dirname, '..'));

await import('../src/env/loadEnv.js');
const { PrismaClient } = await import('@prisma/client');
const { normalizeMediaUrlForStorage, isCloudFrontUrl } = await import('../src/utils/publicUrl.js');

const prisma = new PrismaClient();

function normField(label, url) {
  if (!url || typeof url !== 'string') return { next: url, changed: false };
  const trimmed = url.trim();
  if (!trimmed) return { next: url, changed: false };
  if (isCloudFrontUrl(trimmed)) return { next: trimmed, changed: false };
  const next = normalizeMediaUrlForStorage(trimmed, null);
  return { next, changed: next !== trimmed };
}

async function main() {
  let mediaUpdated = 0;
  let signageUpdated = 0;

  const mediaRows = await prisma.media.findMany({
    select: { id: true, url: true, optimizedUrl: true },
  });

  for (const row of mediaRows) {
    const u = normField('url', row.url);
    const o = row.optimizedUrl ? normField('optimizedUrl', row.optimizedUrl) : { next: null, changed: false };
    if (!u.changed && !o.changed) continue;
    await prisma.media.update({
      where: { id: row.id },
      data: {
        url: u.next,
        ...(row.optimizedUrl != null ? { optimizedUrl: o.next } : {}),
      },
    });
    mediaUpdated += 1;
    console.log('[normalize-media-urls] Media', row.id, {
      url: u.changed ? { from: row.url, to: u.next } : undefined,
      optimizedUrl: o.changed ? { from: row.optimizedUrl, to: o.next } : undefined,
    });
  }

  const assets = await prisma.signageAsset.findMany({
    select: { id: true, url: true },
  });

  for (const row of assets) {
    const u = normField('url', row.url);
    if (!u.changed) continue;
    await prisma.signageAsset.update({
      where: { id: row.id },
      data: { url: u.next },
    });
    signageUpdated += 1;
    console.log('[normalize-media-urls] SignageAsset', row.id, { from: row.url, to: u.next });
  }

  console.log('[normalize-media-urls] Done.', { mediaUpdated, signageUpdated, mediaScanned: mediaRows.length, signageScanned: assets.length });
}

main()
  .catch((e) => {
    console.error('[normalize-media-urls] Failed:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
