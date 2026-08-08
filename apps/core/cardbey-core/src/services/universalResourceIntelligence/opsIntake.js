/**
 * Phase 5 — Federation ops intake.
 * Path A: UL Pexels sync is invoked as an ops job behind Federation, not product discovery.
 */

import { ensureFederationReady, getAdapter, getSourceNode } from './sourceFederation.js';
import { runPexelsLibrarySync } from '../universalLibrary/pexelsLibrarySync.js';

/**
 * Run curated open-media intake for a federation source (ops only).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} [options]
 */
export async function runFederationOpsIntake(prisma, options = {}) {
  await ensureFederationReady();
  const sourceId = options.sourceId || 'src_pexels';
  const node = getSourceNode(sourceId);
  if (!node) return { ok: false, error: 'source_not_found', sourceId };

  const adapter = getAdapter(sourceId);
  const health = adapter?.health ? await adapter.health() : null;

  // Pexels: reuse existing curated UL sync pipeline, attributed to Federation
  if (sourceId === 'src_pexels') {
    const sync = await runPexelsLibrarySync(prisma, {
      force: options.force === true,
      maxPublish: options.maxPublish,
      queries: options.queries,
    });
    return {
      ok: Boolean(sync?.ok),
      mode: 'federation_ops_intake',
      sourceId,
      adapterPresent: Boolean(adapter),
      adapterHealth: health,
      sync,
      note: 'Ops intake only — not a consumer discovery path. Product UIs must use URI search/tasks.',
      authority: 'provider_federation',
    };
  }

  return {
    ok: false,
    error: 'ops_intake_not_implemented_for_source',
    sourceId,
    adapterHealth: health,
    note: 'Add intake job per adapter; discovery remains separate',
  };
}
