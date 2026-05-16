/**
 * Backfill DraftStore.generationRunId from input.generationRunId (dev-only optional).
 * Scans recent drafts where generationRunId column is null and sets it from input JSON.
 * Safe to re-run (idempotent).
 *
 * Usage: node scripts/backfillDraftStoreGenerationRunId.js
 * Or: npm run backfill:draft-generation-run-id
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const LIMIT = 500;

async function backfillDraftStoreGenerationRunId() {
  if (process.env.NODE_ENV === 'production') {
    console.warn('[backfillDraftStoreGenerationRunId] Skipping in production. Run in dev only.');
    return;
  }

  console.log('[backfillDraftStoreGenerationRunId] Scanning drafts with null generationRunId...');

  const drafts = await prisma.draftStore.findMany({
    where: { generationRunId: null },
    orderBy: { createdAt: 'desc' },
    take: LIMIT,
    select: { id: true, input: true },
  }).catch((err) => {
    console.error('[backfillDraftStoreGenerationRunId] findMany failed:', err?.message ?? err);
    return [];
  });

  const toUpdate = drafts.filter((d) => {
    const input = d.input && typeof d.input === 'object' ? d.input : null;
    const genId = input?.generationRunId;
    return typeof genId === 'string' && genId.trim().length > 0;
  });

  console.log(`[backfillDraftStoreGenerationRunId] Found ${toUpdate.length} drafts to backfill (out of ${drafts.length} with null column).`);

  if (toUpdate.length === 0) {
    console.log('[backfillDraftStoreGenerationRunId] Nothing to do.');
    return;
  }

  let updated = 0;
  let errors = 0;

  for (const d of toUpdate) {
    const input = d.input && typeof d.input === 'object' ? d.input : {};
    const genId = input.generationRunId;
    if (typeof genId !== 'string' || !genId.trim()) continue;
    try {
      await prisma.draftStore.update({
        where: { id: d.id },
        data: { generationRunId: genId.trim() },
      });
      updated++;
    } catch (err) {
      console.warn(`[backfillDraftStoreGenerationRunId] Failed to update draft ${d.id}:`, err?.message ?? err);
      errors++;
    }
  }

  console.log(`[backfillDraftStoreGenerationRunId] Done. Updated ${updated}, errors ${errors}.`);
}

backfillDraftStoreGenerationRunId()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
