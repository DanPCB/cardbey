/**
 * Progressive loyalty artifact — partial card preview while topology runs.
 * Does NOT mark the mission complete; present_review still emits the full artifact.
 */

import { readMetadata, writeMetadata } from '../../persistence/metadataWriter.js';
import { broadcastMissionArtifact } from '../../../realtime/simpleSse.js';
import { renderLoyaltyDesktopChannel } from '../../businessUnderstanding/channelRenderers/loyaltyDesktopRenderer.js';

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
  let mergedPartial = { ...partial };
  const bundle = partial.businessUnderstanding ?? partial.businessUnderstandingBundle ?? null;
  if (bundle?.artifact) {
    const rendered = renderLoyaltyDesktopChannel(bundle, {
      storeName: pickString(partial.storeName, partial.name) || null,
    });
    if (rendered.ok && rendered.payload) {
      mergedPartial = {
        ...mergedPartial,
        programName: rendered.payload.programName ?? mergedPartial.programName,
        storeName: rendered.payload.storeName ?? mergedPartial.storeName,
        rule: rendered.payload.rule ?? mergedPartial.rule,
        cardTopology: rendered.payload.cardTopology ?? mergedPartial.cardTopology,
        cardFooterText: rendered.payload.cardFooterText ?? mergedPartial.cardFooterText,
        rendererMode: rendered.rendererMode,
        channel: rendered.channel,
      };
      const stamps = Number(rendered.payload.rule?.purchasesRequired);
      if (Number.isFinite(stamps) && stamps > 0) {
        mergedPartial.stampThreshold = stamps;
        mergedPartial.requiredStamps = stamps;
      }
      if (rendered.payload.rule?.rewardItem) {
        mergedPartial.reward = String(rendered.payload.rule.rewardItem);
      }
    }
  }

  const storeName = pickString(mergedPartial.storeName, mergedPartial.name) || null;
  const reward = pickString(mergedPartial.reward, mergedPartial.rewardRule) || null;
  const stampsRaw = mergedPartial.stampThreshold ?? mergedPartial.requiredStamps;
  const stamps = Number(stampsRaw);
  const stampThreshold = Number.isFinite(stamps) && stamps > 0 ? stamps : null;
  const programName = pickString(mergedPartial.programName, mergedPartial.name) || null;
  const storeId = pickString(mergedPartial.storeId) || null;
  const logoUrl = pickString(mergedPartial.logoUrl, mergedPartial.avatarImageUrl) || null;
  const category = pickString(mergedPartial.category, mergedPartial.businessCategory) || null;

  return {
    type: 'loyalty_progressive_artifact',
    stage,
    storeId,
    storeName,
    programName: programName || (storeName ? `${storeName} Rewards` : 'Loyalty Rewards'),
    reward,
    stampThreshold,
    requiredStamps: stampThreshold,
    rule: mergedPartial.rule && typeof mergedPartial.rule === 'object' ? mergedPartial.rule : null,
    cardTopology:
      mergedPartial.cardTopology && typeof mergedPartial.cardTopology === 'object'
        ? mergedPartial.cardTopology
        : null,
    cardFooterText: pickString(mergedPartial.cardFooterText) || null,
    logoUrl,
    category,
    rendererMode: pickString(mergedPartial.rendererMode) || null,
    channel: pickString(mergedPartial.channel) || null,
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
  const stamps = d.stampThreshold ?? d.requiredStamps ?? d.rule?.purchasesRequired;
  return {
    ...fromStore,
    storeId: pickString(d.storeId, fromStore.storeId) || null,
    storeName: pickString(d.storeName, fromStore.storeName) || null,
    programName: pickString(d.programName, d.name) || null,
    reward: pickString(d.reward, d.rewardRule, d.rule?.rewardItem) || null,
    stampThreshold: stamps,
    requiredStamps: stamps,
    rule: d.rule && typeof d.rule === 'object' ? d.rule : null,
    cardTopology: d.cardTopology && typeof d.cardTopology === 'object' ? d.cardTopology : null,
    cardFooterText: pickString(d.cardFooterText, d.cardTopology?.footerText) || null,
    layoutSource: pickString(d.layoutSource, d.cardTopology?.source) || null,
    layoutConfidence: Number(d.layoutConfidence ?? d.cardTopology?.confidence) || null,
  };
}
