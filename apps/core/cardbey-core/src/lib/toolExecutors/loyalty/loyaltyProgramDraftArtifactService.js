/**
 * Persist + emit generated_loyalty_program mission artifacts (metadata + SSE).
 */

import { readMetadata, writeMetadata } from '../../persistence/metadataWriter.js';
import { broadcastMissionArtifact } from '../../../realtime/simpleSse.js';
import { buildGeneratedLoyaltyProgramArtifact } from './generatedLoyaltyProgramService.js';
import { saveGeneratedLoyaltyToSuitcase } from './saveGeneratedLoyaltyToSuitcase.js';

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

const LOYALTY_ARTIFACT_TYPES = new Set(['generated_loyalty_program', 'loyalty_program_draft']);

/**
 * @param {{
 *   missionId: string;
 *   storeId?: string | null;
 *   storeName?: string | null;
 *   draft: Record<string, unknown>;
 *   userId?: string | null;
 * }} params
 */
export async function buildLoyaltyProgramDraftMissionArtifact(params) {
  return buildGeneratedLoyaltyProgramArtifact(params);
}

/**
 * @param {string} missionId
 * @param {{
 *   storeId?: string | null;
 *   storeName?: string | null;
 *   draft: Record<string, unknown>;
 *   userId?: string | null;
 * }} params
 */
export async function persistAndEmitLoyaltyProgramDraftArtifact(missionId, params) {
  const mid = pickString(missionId);
  if (!mid) throw new Error('persistAndEmitLoyaltyProgramDraftArtifact requires missionId');

  const artifact = await buildGeneratedLoyaltyProgramArtifact({ missionId: mid, ...params });
  const meta = asMetadata(await readMetadata(mid));
  const prior = Array.isArray(meta.missionDeliveredArtifacts) ? meta.missionDeliveredArtifacts : [];
  const nextArtifacts = [
    ...prior.filter(
      (row) => row && typeof row === 'object' && !LOYALTY_ARTIFACT_TYPES.has(String(row.type)),
    ),
    artifact,
  ];

  const userId = pickString(params.userId, meta.userId, meta.ownerId);
  let suitcaseItem = null;
  if (userId) {
    try {
      const saved = await saveGeneratedLoyaltyToSuitcase({
        ownerId: userId,
        missionId: mid,
        storeId: artifact.storeId,
        artifact,
      });
      if (saved.ok) suitcaseItem = saved.item;
    } catch {
      /* suitcase save is best-effort on generation */
    }
  }

  await writeMetadata(mid, {
    loyaltyProgramDraft: artifact.data,
    loyaltyProgramDraftArtifact: artifact,
    generatedLoyaltyProgram: artifact.payload,
    loyaltyDraftArtifactId: artifact.id,
    missionDeliveredArtifacts: nextArtifacts,
    multiAgentCompletionMessage: 'Loyalty program ready.',
    phase: 'awaiting_owner_review',
    artifactType: 'generated_loyalty_program',
    ...(suitcaseItem?.id ? { loyaltySuitcaseItemId: suitcaseItem.id } : {}),
  });

  broadcastMissionArtifact({
    missionId: mid,
    subtype: 'generated_loyalty_program',
    payload: artifact,
  });

  return { ...artifact, suitcaseItem: suitcaseItem ?? null };
}

/**
 * @param {unknown} nodeRun
 */
export function extractLoyaltyDraftArtifactFromNodeRun(nodeRun) {
  if (!nodeRun || typeof nodeRun !== 'object') return null;
  const run = /** @type {Record<string, unknown>} */ (nodeRun);
  const toolOutputs =
    run.toolOutputs && typeof run.toolOutputs === 'object' ? run.toolOutputs : {};
  const present =
    toolOutputs['loyalty.present_review'] && typeof toolOutputs['loyalty.present_review'] === 'object'
      ? /** @type {Record<string, unknown>} */ (toolOutputs['loyalty.present_review'])
      : null;
  const fromPresent = pickLoyaltyArtifact(present?.artifact) || pickFromArray(present?.artifacts);
  if (fromPresent) return fromPresent;

  const outputs = run.outputs && typeof run.outputs === 'object' ? run.outputs : {};
  if (outputs.loyaltyProgramDraftArtifact && typeof outputs.loyaltyProgramDraftArtifact === 'object') {
    return outputs.loyaltyProgramDraftArtifact;
  }
  return pickFromArray(outputs.artifacts);
}

function pickLoyaltyArtifact(value) {
  if (!value || typeof value !== 'object') return null;
  const type = String(/** @type {Record<string, unknown>} */ (value).type ?? '');
  if (LOYALTY_ARTIFACT_TYPES.has(type)) return value;
  return null;
}

function pickFromArray(value) {
  if (!Array.isArray(value)) return null;
  for (const row of value) {
    const picked = pickLoyaltyArtifact(row);
    if (picked) return picked;
  }
  return null;
}

function asMetadata(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : {};
}
