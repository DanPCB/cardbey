/**
 * Canonical loyalty creation contract — all modes converge here before execution.
 */

import { buildDefaultTopologyForThreshold, logDefaultTemplateBlocked } from './defaultLoyaltyCardTopology.js';
import {
  alignLegacyFieldsWithCanonicalRule,
  hasAuthoritativeLoyaltyTopology,
} from './loyaltyContractDiagnostics.js';
import { inferRuleFromTopology } from './loyaltyRuleInference.js';
import { resolveLoyaltySourceMode } from './loyaltyCreationMode.js';
import { buildLoyaltyRecommendations } from './loyaltyRecommendationEngine.js';
import { resolveRendererModeWithDecision } from '../evidence/evidenceDecisionService.js';
import { mergeGraphPreseedIntoPriors, graphToLegacyEvidenceView } from '../evidence/missionEvidenceGraphService.js';
import { Features } from '../../config/features.js';

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/**
 * @param {import('./loyaltyTopologyTypes.js').LoyaltyProgramRule | null | undefined} rule
 */
function isCompleteRule(rule) {
  return Boolean(
    rule &&
      rule.programType === 'STAMP_CARD' &&
      Number(rule.purchasesRequired) > 0 &&
      pickString(rule.rewardItem, rule.purchaseItem),
  );
}

/**
 * @param {Record<string, unknown>} draft
 */
function provenanceFromDraft(draft, sourceMode) {
  const topology = draft.cardTopology && typeof draft.cardTopology === 'object' ? draft.cardTopology : null;
  const hasTopology = hasAuthoritativeLoyaltyTopology(topology);
  const ruleFromSource =
    draft.extractedFromImage === true ||
    topology?.source === 'VISION_EXTRACTED' ||
    draft.layoutSource === 'VISION_EXTRACTED';

  let ruleSource = 'AI_RECOMMENDED';
  if (draft.provenance?.ruleSource) {
    ruleSource = draft.provenance.ruleSource;
  } else if (ruleFromSource && sourceMode !== 'INTENT_DRIVEN') {
    ruleSource = 'SOURCE_EXTRACTED';
  } else if (draft.selectedRecommendationId) {
    ruleSource = 'AI_RECOMMENDED';
  }

  let topologySource = 'NONE';
  if (hasTopology) {
    topologySource = String(topology?.source ?? 'VISION_EXTRACTED');
  } else if (sourceMode === 'INTENT_DRIVEN') {
    topologySource = draft.cardTopology?.source === 'OWNER_DEFINED' ? 'OWNER_DEFINED' : 'DEFAULT_TEMPLATE';
  }

  return { ruleSource, topologySource };
}

/**
 * @param {{
 *   storeId: string;
 *   preseededDraft?: Record<string, unknown> | null;
 *   userMessage?: string | null;
 *   requirements?: string | null;
 *   hasAttachmentEvidence?: boolean;
 *   storeContext?: Record<string, unknown> | null;
 *   selectedRecommendationId?: string | null;
 *   hybridLayoutChoice?: 'preserve' | 'redesign' | 'simplified' | null;
 * }} input
 */
export function buildLoyaltyCreationContract(input) {
  const storeId = pickString(input.storeId);
  const graphView =
    input.missionEvidenceGraph && typeof input.missionEvidenceGraph === 'object'
      ? graphToLegacyEvidenceView(input.missionEvidenceGraph)
      : null;
  const preseeded = mergeGraphPreseedIntoPriors(
    input.preseededDraft && typeof input.preseededDraft === 'object' ? input.preseededDraft : {},
    graphView?.preseededDraft ?? null,
  );
  const storeContext = input.storeContext && typeof input.storeContext === 'object' ? input.storeContext : {};
  const sourceMode = resolveLoyaltySourceMode({
    hasAttachmentEvidence: input.hasAttachmentEvidence,
    userMessage: input.userMessage,
    requirements: input.requirements,
    preseededDraft: preseeded,
    extractedFromImage: preseeded.extractedFromImage === true,
  });

  const recommendations =
    sourceMode === 'INTENT_DRIVEN' || sourceMode === 'HYBRID'
      ? buildLoyaltyRecommendations({
          storeName: storeContext.storeName,
          businessCategory: storeContext.businessCategory,
          products: storeContext.products,
          customerCount: storeContext.customerCount,
        })
      : [];

  const selectedId = pickString(input.selectedRecommendationId, preseeded.selectedRecommendationId);
  const selectedRecommendation =
    recommendations.find((r) => r.id === selectedId) ?? recommendations[0] ?? null;

  /** @type {import('./loyaltyTopologyTypes.js').LoyaltyProgramRule | null} */
  let rule =
    preseeded.rule && typeof preseeded.rule === 'object' ? { ...preseeded.rule } : null;
  /** @type {import('./loyaltyTopologyTypes.js').LoyaltyCardTopology | null | undefined} */
  let cardTopology =
    preseeded.cardTopology && typeof preseeded.cardTopology === 'object'
      ? preseeded.cardTopology
      : null;

  const originalRule = rule ? { ...rule } : null;
  const originalTopology = cardTopology ? { ...cardTopology, cells: [...(cardTopology.cells ?? [])] } : null;

  if (sourceMode === 'SOURCE_DRIVEN') {
    if (!isCompleteRule(rule) && preseeded.requiredStamps) {
      rule = {
        programType: 'STAMP_CARD',
        purchaseItem: pickString(preseeded.purchaseItem, 'Coffee'),
        purchasesRequired: Number(preseeded.requiredStamps),
        rewardQuantity: 1,
        rewardItem: pickString(preseeded.reward, preseeded.rewardRule, 'Reward'),
        repeatMode: 'INDEFINITE',
      };
    }
    if (cardTopology && !rule) {
      rule = inferRuleFromTopology(cardTopology, {
        purchaseItem: pickString(preseeded.purchaseItem, 'Coffee'),
        rewardItem: pickString(preseeded.reward, 'Reward'),
      });
    }
  } else if (sourceMode === 'INTENT_DRIVEN') {
    if (selectedRecommendation?.rule) {
      rule = { ...selectedRecommendation.rule };
    }
    if (!cardTopology && rule?.purchasesRequired) {
      cardTopology = buildDefaultTopologyForThreshold(rule.purchasesRequired);
      if (!cardTopology && Features.loyalty.disableDefaultTemplate) {
        logDefaultTemplateBlocked('buildLoyaltyCreationContract.INTENT_DRIVEN');
      }
    }
  } else if (sourceMode === 'HYBRID') {
    if (selectedRecommendation?.rule && /better|improve|upgrade|redesign/i.test(
      pickString(input.userMessage, input.requirements),
    )) {
      rule = { ...selectedRecommendation.rule };
    } else if (!isCompleteRule(rule) && selectedRecommendation?.rule) {
      rule = { ...selectedRecommendation.rule };
    }
    const layoutChoice = input.hybridLayoutChoice ?? preseeded.hybridLayoutChoice ?? 'preserve';
    if (layoutChoice === 'simplified' && rule?.purchasesRequired) {
      cardTopology = buildDefaultTopologyForThreshold(rule.purchasesRequired);
    } else if (layoutChoice === 'redesign' && rule?.purchasesRequired) {
      cardTopology = buildDefaultTopologyForThreshold(rule.purchasesRequired);
      if (cardTopology) cardTopology.source = 'DEFAULT_TEMPLATE';
    }
  }

  const aligned = alignLegacyFieldsWithCanonicalRule({
    ...preseeded,
    rule,
    cardTopology,
    storeId,
  });

  const provenance = provenanceFromDraft(
    {
      ...aligned,
      extractedFromImage: preseeded.extractedFromImage,
      selectedRecommendationId: selectedId,
    },
    sourceMode,
  );

  const hasValidRule = isCompleteRule(aligned.rule);
  const missingFields = [];
  if (!hasValidRule) {
    if (!Number(aligned.rule?.purchasesRequired)) missingFields.push('threshold');
    if (!pickString(aligned.rule?.rewardItem, aligned.reward)) missingFields.push('reward');
    if (!pickString(aligned.rule?.purchaseItem)) missingFields.push('qualifying_purchase');
  }

  const requiresOwnerReview =
    preseeded.ownerApproved === true
      ? false
      : sourceMode === 'INTENT_DRIVEN' ||
        sourceMode === 'HYBRID' ||
        sourceMode === 'SOURCE_DRIVEN' ||
        Boolean(aligned.topologyReviewRequired ?? aligned.cardTopology?.reviewRequired) ||
        recommendations.length > 1 ||
        !hasValidRule;

  /** @type {import('./loyaltyCreationContractTypes.js').LoyaltyCreationContract} */
  const contract = {
    sourceMode,
    storeId,
    rule: aligned.rule,
    cardTopology: aligned.cardTopology ?? undefined,
    sourceEvidence:
      sourceMode === 'SOURCE_DRIVEN' || sourceMode === 'HYBRID'
        ? {
            evidenceId: pickString(preseeded.evidenceId, preseeded.attachmentId ? `att:${preseeded.attachmentId}` : '') || undefined,
            assetRef: pickString(preseeded.imageAssetId, preseeded.assetRef, preseeded.attachmentId) || undefined,
            confidence: Number(preseeded.confidence ?? aligned.cardTopology?.confidence) || undefined,
          }
        : undefined,
    recommendationContext:
      sourceMode === 'INTENT_DRIVEN' || sourceMode === 'HYBRID'
        ? {
            businessCategory: pickString(storeContext.businessCategory) || undefined,
            catalogRefs: recommendations.flatMap((r) => r.basedOnCatalogRefs),
            reasoningSummary:
              selectedRecommendation?.rationale ??
              recommendations[0]?.rationale ??
              undefined,
          }
        : undefined,
    provenance,
    requiresOwnerReview,
    recommendations: recommendations.length ? recommendations : undefined,
    selectedRecommendationId: selectedId || selectedRecommendation?.id || undefined,
    hybridContext:
      sourceMode === 'HYBRID'
        ? {
            originalRule,
            originalTopology,
            proposedRule: selectedRecommendation?.rule ?? null,
            layoutChoice:
              input.hybridLayoutChoice ?? preseeded.hybridLayoutChoice ?? 'preserve',
          }
        : undefined,
    cardFooterText: pickString(aligned.cardFooterText, aligned.cardTopology?.footerText) || undefined,
    missingFields,
    programName: pickString(aligned.programName, storeContext.storeName ? `${storeContext.storeName} Rewards` : 'Loyalty Rewards'),
  };

  if (Features.reasoningPhase0.explicitDefaultTemplate) {
    try {
      const renderer = resolveRendererModeWithDecision({
        cardTopology:
          hasAuthoritativeLoyaltyTopology(contract.cardTopology)
            ? contract.cardTopology
            : graphView?.preseededDraft?.cardTopology ?? contract.cardTopology ?? null,
        creationMode: contract.sourceMode,
        graph: input.missionEvidenceGraph ?? null,
      });
      contract.rendererMode = renderer.mode;
      contract.rendererDecision = renderer.decision;
      if (renderer.mode === 'DEFAULT_TEMPLATE' && !contract.cardTopology && contract.rule?.purchasesRequired) {
        contract.cardTopology = buildDefaultTopologyForThreshold(contract.rule.purchasesRequired);
        if (contract.cardTopology) contract.cardTopology.source = 'DEFAULT_TEMPLATE';
        if (!contract.cardTopology && Features.loyalty.disableDefaultTemplate) {
          contract.missingFields = [...new Set([...(contract.missingFields ?? []), 'topology'])];
          contract.requiresOwnerReview = true;
          contract.explicitFallbackRequired = true;
          contract.rendererDecision = {
            ...(contract.rendererDecision ?? {}),
            answer: 'TOPOLOGY_REQUIRED',
            rationale: 'DEFAULT_TEMPLATE disabled; extracted topology missing',
            fallback: false,
          };
        }
      }
    } catch (err) {
      if (err?.code === 'EXPLICIT_FALLBACK_REQUIRED') {
        contract.explicitFallbackRequired = true;
        contract.rendererDecision = err.decision;
        contract.missingFields = [...new Set([...(contract.missingFields ?? []), 'topology_fallback_ack'])];
        contract.requiresOwnerReview = true;
      } else if (err?.code === 'DEFAULT_TEMPLATE_DISABLED') {
        contract.explicitFallbackRequired = true;
        contract.rendererDecision = err.details?.decision ?? null;
        contract.missingFields = [...new Set([...(contract.missingFields ?? []), 'topology'])];
        contract.requiresOwnerReview = true;
      } else {
        throw err;
      }
    }
  }

  return contract;
}

/**
 * Apply owner review action to contract provenance.
 * @param {import('./loyaltyCreationContractTypes.js').LoyaltyCreationContract} contract
 * @param {'APPROVE' | 'EDIT' | 'REJECT' | 'USE_SIMPLIFIED' | 'SELECT_RECOMMENDATION' | 'PRESERVE_LAYOUT' | 'REDESIGN_LAYOUT'} action
 * @param {Record<string, unknown>} [payload]
 */
export function applyOwnerActionToCreationContract(contract, action, payload = {}) {
  const next = {
    ...contract,
    provenance: { ...contract.provenance },
    hybridContext: contract.hybridContext ? { ...contract.hybridContext } : undefined,
  };

  if (action === 'EDIT' || action === 'APPROVE') {
    if (payload.rule && typeof payload.rule === 'object') {
      next.rule = payload.rule;
      next.provenance.ruleSource = 'OWNER_DEFINED';
    }
    if (payload.cardTopology && typeof payload.cardTopology === 'object') {
      next.cardTopology = payload.cardTopology;
      next.provenance.topologySource = 'OWNER_DEFINED';
    }
    if (action === 'APPROVE') {
      next.requiresOwnerReview = false;
      if (next.cardTopology) {
        next.cardTopology = { ...next.cardTopology, reviewRequired: false, source: 'APPROVED' };
        next.provenance.topologySource = 'APPROVED';
      }
    }
  }

  if (action === 'USE_SIMPLIFIED' && next.rule?.purchasesRequired) {
    next.cardTopology = buildDefaultTopologyForThreshold(next.rule.purchasesRequired);
    next.provenance.topologySource = 'DEFAULT_TEMPLATE';
  }

  if (action === 'PRESERVE_LAYOUT' && contract.hybridContext?.originalTopology) {
    next.cardTopology = contract.hybridContext.originalTopology;
    next.provenance.topologySource = String(contract.hybridContext.originalTopology.source ?? 'VISION_EXTRACTED');
    if (next.hybridContext) next.hybridContext.layoutChoice = 'preserve';
  }

  if (action === 'REDESIGN_LAYOUT' && next.rule?.purchasesRequired) {
    next.cardTopology = buildDefaultTopologyForThreshold(next.rule.purchasesRequired);
    next.provenance.topologySource = 'DEFAULT_TEMPLATE';
    if (next.hybridContext) next.hybridContext.layoutChoice = 'redesign';
  }

  if (action === 'SELECT_RECOMMENDATION' && payload.recommendationId && contract.recommendations) {
    const rec = contract.recommendations.find((r) => r.id === payload.recommendationId);
    if (rec) {
      next.rule = { ...rec.rule };
      next.selectedRecommendationId = rec.id;
      next.provenance.ruleSource = 'AI_RECOMMENDED';
    }
  }

  if (action === 'REJECT') {
    next.requiresOwnerReview = true;
    next.rejected = true;
  }

  return {
    ...next,
    rule: next.rule ?? null,
    cardTopology: next.cardTopology ?? undefined,
  };
}

/**
 * Flatten contract into persistence/draft shape (single runtime path).
 * @param {import('./loyaltyCreationContractTypes.js').LoyaltyCreationContract} contract
 */
export function loyaltyCreationContractToDraft(contract) {
  const aligned = alignLegacyFieldsWithCanonicalRule({
    storeId: contract.storeId,
    programName: contract.programName,
    rule: contract.rule,
    cardTopology: contract.cardTopology ?? null,
    cardFooterText: contract.cardFooterText ?? null,
    requiredStamps: contract.rule?.purchasesRequired ?? null,
    stampThreshold: contract.rule?.purchasesRequired ?? null,
    reward: contract.rule?.rewardItem ?? null,
    rewardRule: contract.rule
      ? `Collect ${contract.rule.purchasesRequired} ${contract.rule.purchaseItem} · Get ${contract.rule.rewardQuantity} ${contract.rule.rewardItem}`
      : null,
    layoutSource: contract.provenance?.topologySource ?? contract.cardTopology?.source ?? null,
    layoutConfidence: contract.cardTopology?.confidence ?? null,
    topologyReviewRequired: contract.requiresOwnerReview,
    creationContract: contract,
    sourceMode: contract.sourceMode,
    recommendations: contract.recommendations,
    selectedRecommendationId: contract.selectedRecommendationId,
    hybridContext: contract.hybridContext,
    provenance: contract.provenance,
    missingFields: contract.missingFields,
  });
  return aligned;
}

export default {
  buildLoyaltyCreationContract,
  applyOwnerActionToCreationContract,
  loyaltyCreationContractToDraft,
};
