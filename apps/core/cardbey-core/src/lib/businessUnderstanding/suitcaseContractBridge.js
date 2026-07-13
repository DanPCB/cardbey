/**
 * Phase 11 — Suitcase integration for reusable canonical contracts.
 */

import { buildSuitcaseContractKey } from './canonicalContracts.js';

/**
 * @param {{
 *   ownerId: string;
 *   storeId?: string | null;
 *   storeSlug?: string | null;
 *   bundle: import('./businessUnderstandingTypes.js').CanonicalUnderstandingBundle;
 * }} input
 */
export async function persistUnderstandingToSuitcase(input = {}) {
  const ownerId = String(input.ownerId ?? '').trim();
  if (!ownerId) {
    return { ok: false, reason: 'OWNER_REQUIRED' };
  }

  const bundle = input.bundle;
  if (!bundle?.artifact) {
    return { ok: false, reason: 'BUNDLE_REQUIRED' };
  }

  let createSuitcaseItem;
  try {
    const mod = await import('../../services/suitcase/suitcaseItemService.js');
    createSuitcaseItem = mod.createSuitcaseItem ?? mod.default?.createSuitcaseItem;
  } catch {
    return { ok: false, reason: 'SUITCASE_UNAVAILABLE' };
  }

  if (typeof createSuitcaseItem !== 'function') {
    return { ok: false, reason: 'SUITCASE_UNAVAILABLE' };
  }

  const slug = input.storeSlug ?? input.storeId ?? 'business';
  const contracts = [
    { kind: 'artifact', payload: bundle.artifact },
    bundle.layout ? { kind: 'layout', payload: bundle.layout } : null,
    bundle.businessRule ? { kind: 'loyalty', payload: bundle.businessRule } : null,
    bundle.brand ? { kind: 'brand', payload: bundle.brand } : null,
    bundle.intent ? { kind: 'intent', payload: bundle.intent } : null,
  ].filter(Boolean);

  /** @type {Array<{ key: string; id?: string }>} */
  const saved = [];

  for (const row of contracts) {
    const key = buildSuitcaseContractKey({ storeSlug: slug, contractKind: row.kind });
    try {
      const result = await createSuitcaseItem({
        ownerId,
        title: key,
        contentType: 'json',
        sourceType: 'artifact',
        payload: row.payload,
        summary: `${row.payload?.schema ?? 'contract'} v${row.payload?.version ?? '1'}`,
        storeId: input.storeId ?? null,
        missionId: bundle.artifact.missionId ?? null,
        metadata: {
          contractSchema: row.payload?.schema ?? null,
          contractVersion: row.payload?.version ?? null,
          evidenceId: bundle.artifact.evidenceId ?? null,
          pipelineVersion: bundle.pipelineVersion,
        },
        idempotencyKey: `${key}:${bundle.extractedAt.slice(0, 10)}`,
      });
      saved.push({ key, id: result?.item?.id ?? null });
    } catch (err) {
      console.warn('[BUE] suitcase contract save failed:', key, err?.message ?? err);
    }
  }

  return { ok: saved.length > 0, saved, reason: saved.length ? 'saved' : 'save_failed' };
}

export default { persistUnderstandingToSuitcase };
