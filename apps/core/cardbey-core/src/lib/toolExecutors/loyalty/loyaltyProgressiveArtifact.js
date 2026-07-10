/**
 * Progressive loyalty artifact — partial card preview while topology runs.
 * Does NOT mark the mission complete; present_review still emits the full artifact.
 */

import { readMetadata, writeMetadata } from '../../persistence/metadataWriter.js';
import { broadcastMissionArtifact } from '../../../realtime/simpleSse.js';

/** @typedef {'store_loaded' | 'draft_ready' | 'awaiting_input' | 'complete'} LoyaltyProgressiveStage */

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

/**
 * @param {LoyaltyProgressiveStage} stage
 * @param {Record<string, unknown>} [partial]
 */
export function buildLoyaltyProgressiveArtifact(stage, partial = {}) {
  const storeName = pickString(partial.storeName, partial.name) || null;
  const reward = pickString(partial.reward, partial.rewardRule) || null;
  const stampsRaw = partial.stampThreshold ?? partial.requiredStamps;
  const stamps = Number(stampsRaw);
  const stampThreshold = Number.isFinite(stamps) && stamps > 0 ? stamps : null;
  const programName = pickString(partial.programName, partial.name) || null;
  const storeId = pickString(partial.storeId) || null;
  const logoUrl = pickString(partial.logoUrl, partial.avatarImageUrl) || null;
  const category = pickString(partial.category, partial.businessCategory) || null;

  return {
    type: 'loyalty_progressive_artifact',
    stage,
    storeId,
    storeName,
    programName: programName || (storeName ? `${storeName} Rewards` : 'Loyalty Rewards'),
    reward,
    stampThreshold,
    requiredStamps: stampThreshold,
    logoUrl,
    category,
    updatedAt: new Date().toISOString(),
    partial: true,
  };
}

/**
 * Persist progressive artifact on mission metadata and broadcast SSE.
 * Safe to call repeatedly; never sets multiAgentStatus to completed.
 *
 * @param {string} missionId
 * @param {LoyaltyProgressiveStage} stage
 * @param {Record<string, unknown>} [partial]
 */
export async function emitLoyaltyProgressiveArtifact(missionId, stage, partial = {}) {
  const mid = pickString(missionId);
  if (!mid) return null;

  const artifact = buildLoyaltyProgressiveArtifact(stage, partial);
  const prior = asRecord(await readMetadata(mid)) ?? {};
  const priorProgressive = asRecord(prior.loyaltyProgressiveArtifact) ?? {};

  const merged = {
    ...priorProgressive,
    ...artifact,
    // Keep earlier known fields when later stages omit them.
    storeId: artifact.storeId || priorProgressive.storeId || null,
    storeName: artifact.storeName || priorProgressive.storeName || null,
    programName: artifact.programName || priorProgressive.programName || null,
    reward: artifact.reward || priorProgressive.reward || null,
    stampThreshold: artifact.stampThreshold ?? priorProgressive.stampThreshold ?? null,
    requiredStamps: artifact.requiredStamps ?? priorProgressive.requiredStamps ?? null,
    logoUrl: artifact.logoUrl || priorProgressive.logoUrl || null,
    category: artifact.category || priorProgressive.category || null,
    stage,
  };

  await writeMetadata(mid, {
    loyaltyProgressiveArtifact: merged,
  });

  broadcastMissionArtifact({
    missionId: mid,
    subtype: 'loyalty_progressive_artifact',
    payload: merged,
  });

  return merged;
}

/**
 * @param {Record<string, unknown> | null | undefined} storeContext
 * @param {Record<string, unknown> | null | undefined} [extra]
 */
export function progressivePartialFromStoreContext(storeContext, extra = {}) {
  const ctx = asRecord(storeContext) ?? {};
  return {
    storeId: pickString(ctx.storeId, extra.storeId) || null,
    storeName: pickString(ctx.name, ctx.storeName, extra.storeName) || null,
    category: pickString(ctx.category, ctx.businessCategory, extra.category) || null,
    logoUrl: pickString(ctx.logoUrl, ctx.avatarImageUrl, extra.logoUrl) || null,
    ...extra,
  };
}

/**
 * @param {Record<string, unknown> | null | undefined} draft
 * @param {Record<string, unknown> | null | undefined} [storeContext]
 */
export function progressivePartialFromDraft(draft, storeContext = null) {
  const d = asRecord(draft) ?? {};
  const fromStore = progressivePartialFromStoreContext(storeContext);
  const stamps = d.stampThreshold ?? d.requiredStamps;
  return {
    ...fromStore,
    storeId: pickString(d.storeId, fromStore.storeId) || null,
    storeName: pickString(d.storeName, fromStore.storeName) || null,
    programName: pickString(d.programName, d.name) || null,
    reward: pickString(d.reward, d.rewardRule) || null,
    stampThreshold: stamps,
    requiredStamps: stamps,
  };
}
