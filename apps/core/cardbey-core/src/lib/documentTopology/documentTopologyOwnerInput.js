/**
 * Merge owner topology review actions into preseeded draft.
 */

import { buildDefaultTopologyForThreshold } from '../loyalty/defaultLoyaltyCardTopology.js';
import { rebuildLoyaltyCycles } from '../loyalty/loyaltyTopologyBuild.js';
import { inferRuleFromTopology } from '../loyalty/loyaltyRuleInference.js';
import {
  applyOwnerDefinedTopology,
  DocumentTopologyEngine,
} from '../documentTopology/index.js';
import { recordDocumentTopologyRevision } from '../documentTopology/documentTopologyRevisionService.js';

function normalizeTopologyAction(action) {
  const raw = String(action ?? '').trim().toUpperCase();
  if (raw === 'APPROVE') return 'APPROVE';
  if (raw === 'EDIT') return 'EDIT';
  if (raw === 'USE_SIMPLIFIED' || raw === 'SIMPLIFIED') return 'USE_SIMPLIFIED';
  if (raw === 'REJECT') return 'REJECT';
  return raw || null;
}

/**
 * @param {Record<string, unknown> | null | undefined} existing
 * @param {Record<string, unknown>} ownerInput
 * @param {{ missionId?: string; userId?: string | null }} [ctx]
 */
export function mergeOwnerTopologyIntoDraft(existing, ownerInput, ctx = {}) {
  const base = existing && typeof existing === 'object' ? { ...existing } : {};
  const action = normalizeTopologyAction(ownerInput.topologyAction);
  const incomingTopology =
    ownerInput.cardTopology && typeof ownerInput.cardTopology === 'object'
      ? ownerInput.cardTopology
      : null;

  const priorTopology =
    base.cardTopology && typeof base.cardTopology === 'object' ? base.cardTopology : null;

  if (priorTopology?.source === 'OWNER_DEFINED' && !incomingTopology && !action) {
    return base;
  }

  if (action === 'REJECT') {
    DocumentTopologyEngine.rejectTopology(
      /** @type {import('../documentTopology/documentTopologyTypes.js').DocumentTopology} */ (
        priorTopology
      ),
      { missionId: ctx.missionId ?? null },
    );
    return {
      ...base,
      topologyRejected: true,
      layoutSource: priorTopology?.source ?? 'VISION_EXTRACTED',
    };
  }

  if (action === 'USE_SIMPLIFIED') {
    const threshold = Math.max(
      1,
      Number(base.stampThreshold ?? base.requiredStamps ?? priorTopology?.cells?.length) || 10,
    );
    const simplified = buildDefaultTopologyForThreshold(threshold);
    return {
      ...base,
      cardTopology: simplified,
      layoutSource: 'DEFAULT_TEMPLATE',
      layoutConfidence: 1,
      topologyRejected: false,
    };
  }

  if (incomingTopology) {
    const original =
      priorTopology?.originalExtraction ??
      (priorTopology?.source === 'VISION_EXTRACTED' ? priorTopology : null);
    const isApprove = action === 'APPROVE';
    const ownerDefined = isApprove
      ? { ...incomingTopology, source: 'APPROVED', reviewRequired: false }
      : applyOwnerDefinedTopology(
          /** @type {import('../documentTopology/documentTopologyTypes.js').DocumentTopology} */ (
            incomingTopology
          ),
          original,
        );
    const loyaltyTopology = rebuildLoyaltyCycles({
      ...ownerDefined,
      cycles:
        incomingTopology.cycles ??
        priorTopology?.cycles ??
        [],
      footerText:
        incomingTopology.footerText ??
        ownerDefined.footer?.text ??
        priorTopology?.footerText,
    });
    const rule =
      ownerInput.rule && typeof ownerInput.rule === 'object'
        ? ownerInput.rule
        : base.rule && typeof base.rule === 'object'
          ? base.rule
          : inferRuleFromTopology(loyaltyTopology);

    if (ctx.missionId) {
      void recordDocumentTopologyRevision({
        documentId: ctx.missionId,
        documentType: 'LOYALTY_CARD',
        topology: loyaltyTopology,
        createdBy: ctx.userId ?? null,
        source: isApprove ? 'APPROVED' : 'OWNER_DEFINED',
        changes: { topologyAction: action ?? 'EDIT' },
        approved: isApprove,
      }).catch(() => {});
    }

    if (isApprove) {
      DocumentTopologyEngine.approveTopology(loyaltyTopology, { missionId: ctx.missionId ?? null });
    } else {
      DocumentTopologyEngine.applyOwnerTopologyEdit(loyaltyTopology, original, {
        missionId: ctx.missionId ?? null,
      });
    }

    return {
      ...base,
      cardTopology: loyaltyTopology,
      rule,
      layoutSource: isApprove ? 'APPROVED' : 'OWNER_DEFINED',
      layoutConfidence: loyaltyTopology.confidence,
      layoutReviewedAt: new Date().toISOString(),
      layoutReviewedBy: ctx.userId ?? null,
      topologyRejected: false,
      topologyReviewRequired: false,
      stampThreshold: rule?.purchasesRequired ?? base.stampThreshold,
      requiredStamps: rule?.purchasesRequired ?? base.requiredStamps,
      reward: rule?.rewardItem ?? base.reward,
    };
  }

  if (action === 'APPROVE' && priorTopology) {
    const approved = DocumentTopologyEngine.approveTopology(priorTopology, {
      missionId: ctx.missionId ?? null,
    });
    if (ctx.missionId) {
      void recordDocumentTopologyRevision({
        documentId: ctx.missionId,
        documentType: 'LOYALTY_CARD',
        topology: approved,
        createdBy: ctx.userId ?? null,
        source: 'APPROVED',
        approved: true,
      }).catch(() => {});
    }
    return {
      ...base,
      cardTopology: approved,
      rule:
        ownerInput.rule && typeof ownerInput.rule === 'object'
          ? ownerInput.rule
          : base.rule,
      layoutSource: 'APPROVED',
      layoutReviewedAt: new Date().toISOString(),
      layoutReviewedBy: ctx.userId ?? null,
      topologyReviewRequired: false,
    };
  }

  return base;
}

export default { mergeOwnerTopologyIntoDraft };
