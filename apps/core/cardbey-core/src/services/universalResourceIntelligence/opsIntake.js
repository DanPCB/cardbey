/**
 * Phase 5 — Federation ops intake.
 * Path A: curated UL sync jobs behind Federation (not product discovery).
 */

import { ensureFederationReady, getAdapter, getSourceNode } from './sourceFederation.js';
import { runPexelsLibrarySync } from '../universalLibrary/pexelsLibrarySync.js';
import { runOpenverseLibrarySync } from '../universalLibrary/openverseLibrarySync.js';
import { runWikimediaLibrarySync } from '../universalLibrary/wikimediaLibrarySync.js';

/**
 * Run curated open-media intake for a federation source (ops only).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} [options]
 */
export async function runFederationOpsIntake(prisma, options = {}) {
  await ensureFederationReady();
  const sourceId = options.sourceId || 'src_pexels';
  const node = getSourceNode(sourceId);
  if (!node && !['src_pexels', 'src_openverse', 'src_wikimedia'].includes(sourceId)) {
    return { ok: false, error: 'source_not_found', sourceId };
  }

  const adapter = getAdapter(sourceId);
  const health = adapter?.health ? await adapter.health() : null;
  const syncOpts = {
    force: options.force === true,
    maxPublish: options.maxPublish,
    queries: options.queries,
  };

  if (sourceId === 'src_pexels') {
    const sync = await runPexelsLibrarySync(prisma, syncOpts);
    return wrap(sourceId, adapter, health, sync);
  }
  if (sourceId === 'src_openverse') {
    const sync = await runOpenverseLibrarySync(prisma, syncOpts);
    return wrap(sourceId, adapter, health, sync);
  }
  if (sourceId === 'src_wikimedia') {
    const sync = await runWikimediaLibrarySync(prisma, syncOpts);
    return wrap(sourceId, adapter, health, sync);
  }

  return {
    ok: false,
    error: 'ops_intake_not_implemented_for_source',
    sourceId,
    adapterHealth: health,
    note: 'V1 activates Pexels, Openverse, Wikimedia only',
  };
}

function wrap(sourceId, adapter, health, sync) {
  return {
    ok: Boolean(sync?.ok),
    mode: 'federation_ops_intake',
    sourceId,
    adapterPresent: Boolean(adapter),
    adapterHealth: health,
    sync,
    note: 'Ops intake only — not a consumer discovery path. Product UIs use Library index + URI search.',
    authority: 'provider_federation',
  };
}
