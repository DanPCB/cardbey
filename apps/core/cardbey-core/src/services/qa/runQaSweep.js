/**
 * QA Sweep - runs runDraftQa on recent ready drafts and persists qaReport.
 * Called by qaSweepScheduler when QA_SWEEP_ENABLED=true.
 *
 * @param {{ prisma: import('@prisma/client').PrismaClient, logger?: (msg: string, data?: object) => void }} opts
 * @returns {Promise<{ swept: number, updated: number }>}
 */
import { runDraftQa } from './draftQaAgent.js';

export async function runQaSweep({ prisma, logger = console.log.bind(console) }) {
  let swept = 0;
  let updated = 0;
  try {
    const drafts = await prisma.draftStore.findMany({
      where: { status: { in: ['ready', 'draft'] } },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    for (const d of drafts) {
      swept += 1;
      const preview = typeof d.preview === 'string' ? (() => { try { return JSON.parse(d.preview); } catch { return {}; } })() : (d.preview || {});
      const qaReport = runDraftQa({ preview, input: d.input }, { logger: () => {} });
      const meta = { ...(preview.meta || {}), qaReport };
      const merged = { ...preview, meta };
      await prisma.draftStore.update({
        where: { id: d.id },
        data: { preview: merged, updatedAt: new Date() },
      });
      updated += 1;
    }
  } catch (err) {
    logger('[QaSweep] Error:', { err: err?.message });
  }
  return { swept, updated };
}
