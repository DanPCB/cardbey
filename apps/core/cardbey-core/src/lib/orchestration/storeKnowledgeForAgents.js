/**
 * Build shared storeKnowledge for AgentCoordinator agents from SKP.
 * One buildSKP call per orchestrate() — agents must not re-query Prisma for store fields.
 */

import { buildSKP, skpToPublicDTO } from '../storeKnowledge/buildSKP.js';

/**
 * @param {unknown} skp
 * @returns {Record<string, unknown> | null}
 */
export function storeKnowledgeFromSkp(skp) {
  if (!skp) return null;
  const dto = skpToPublicDTO(skp);
  if (!dto) return null;
  return {
    ...dto,
    descriptionProvenance: skp.content?.description?.provenance ?? null,
    categoryProvenance: skp.classification?.category?.provenance ?? null,
    enrichmentStatus: skp.intelligence?.enrichmentStatus ?? null,
    canonicalUrl: skp.visibility?.canonicalUrl ?? dto.canonicalUrl ?? null,
    aiSearchReady: skp.visibility?.aiSearchReady ?? dto.aiSearchReady ?? null,
  };
}

/**
 * @param {string | null | undefined} storeId
 * @param {{ buildSKPFn?: typeof buildSKP }} [opts]
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function loadStoreKnowledgeForAgents(storeId, opts = {}) {
  const id = String(storeId ?? '').trim();
  if (!id) return null;
  const build = opts.buildSKPFn ?? buildSKP;
  try {
    const skp = await build(id);
    return storeKnowledgeFromSkp(skp);
  } catch (err) {
    console.warn(
      '[storeKnowledgeForAgents] buildSKP failed (non-fatal):',
      err?.message ?? err,
    );
    return null;
  }
}
