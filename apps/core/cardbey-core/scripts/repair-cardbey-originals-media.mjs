/**
 * Idempotent repair: re-run Cardbey Originals import (upgrade existing rows)
 * so preview/source paths refresh and optional S3 durable URLs are written.
 *
 * Usage (from apps/core/cardbey-core):
 *   node scripts/repair-cardbey-originals-media.mjs
 *
 * Requires ENABLE_CARDBEY_ORIGINALS_SOURCE_V1 and DB access.
 * Does not delete assets or reseeds the whole library.
 */

import { PrismaClient } from '@prisma/client';
import { importCardbeyOriginals } from '../src/services/universalLibrary/cardbeyOriginalsImport.js';
import { toPublicAssetView } from '../src/services/universalLibrary/publicAssetView.js';

const prisma = new PrismaClient();

async function main() {
  const result = await importCardbeyOriginals(prisma, { skipExisting: true });
  const internals = await prisma.universalAsset.findMany({
    where: { provider: 'cardbey_internal', status: 'PUBLISHED' },
    take: 500,
  });

  const byType = {};
  const readiness = { PREVIEW_READY: 0, PREVIEW_MISSING: 0, PREVIEW_OPTIONAL: 0, MEDIA_UNREACHABLE: 0 };
  for (const row of internals) {
    const view = toPublicAssetView(row);
    const t = String(row.type || 'other').toLowerCase();
    byType[t] = byType[t] || { total: 0, ready: 0, missing: 0, unreachable: 0 };
    byType[t].total += 1;
    const pr = view.previewReadiness || 'PREVIEW_MISSING';
    readiness[pr] = (readiness[pr] || 0) + 1;
    if (pr === 'PREVIEW_READY' || pr === 'PREVIEW_OPTIONAL') byType[t].ready += 1;
    else if (pr === 'MEDIA_UNREACHABLE') byType[t].unreachable += 1;
    else byType[t].missing += 1;
  }

  console.log(JSON.stringify({
    ok: result.ok,
    import: {
      importedOrUpgraded: result.importedOrUpgraded,
      failed: result.failed,
      skipped: result.skipped,
    },
    inventory: { byType, readiness, publishedInternal: internals.length },
    sample: internals.slice(0, 5).map((r) => {
      const v = toPublicAssetView(r);
      return {
        id: r.id,
        title: r.title,
        type: r.type,
        preview: v.preview,
        streamUrl: v.streamUrl || null,
        previewReadiness: v.previewReadiness,
      };
    }),
  }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
