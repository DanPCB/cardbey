/**

 * Loyalty program draft builder + context-aware planning.

 */



import { randomUUID } from 'node:crypto';

import { getPrismaClient } from '../../prisma.js';

import segmentLoyalCustomers from './segment_loyal_customers.js';

import defineLoyaltyTiers from './define_loyalty_tiers.js';

import createLoyaltyOffer from './create_loyalty_offer.js';

import { gatherLoyaltyProgramContext, inferRewardFromCatalog } from './loyaltyProgramContext.js';

import { writeLoyaltyProgramFromMission } from './writeLoyaltyProgramFromMission.js';
import { enrichLoyaltyDraftWithMatrixTopology, parseStampMatrixSpec } from '../../loyalty/loyaltyMatrixTopology.js';
import {
  alignLegacyFieldsWithCanonicalRule,
  hasAuthoritativeLoyaltyTopology,
  logLoyaltyContractDiagnostic,
} from '../../loyalty/loyaltyContractDiagnostics.js';
import {
  buildLoyaltyCreationContract,
  loyaltyCreationContractToDraft,
} from '../../loyalty/loyaltyCreationContract.js';
import { LoyaltyContractError } from '../../loyalty/loyaltyContractErrors.js';



function pickString(...values) {

  for (const value of values) {

    if (typeof value === 'string' && value.trim()) return value.trim();

  }

  return '';

}



function nestedOutput(result) {

  if (!result || typeof result !== 'object') return {};

  const bag = result.output && typeof result.output === 'object' ? result.output : result;

  return bag && typeof bag === 'object' ? bag : {};

}



/**

 * @param {object} params

 */

export function buildLoyaltyProgramDraftData(params) {

  const storeName = pickString(params.storeName, 'Your store');

  const businessCategory = pickString(params.businessCategory, 'General');

  const customerCount = Math.max(0, Number(params.customerCount) || 0);

  const tiers = Array.isArray(params.tiers) ? params.tiers : [];

  const offers = Array.isArray(params.offers) ? params.offers : [];

  const requirements = pickString(params.requirements);

  let preseeded =

    params.preseededDraft && typeof params.preseededDraft === 'object' ? params.preseededDraft : null;

  if (preseeded) {
    if (!hasAuthoritativeLoyaltyTopology(preseeded.cardTopology)) {
      const matrixSpec = parseStampMatrixSpec(requirements);
      if (matrixSpec) {
        preseeded = enrichLoyaltyDraftWithMatrixTopology(preseeded, {
          userMessage: requirements,
          purchaseItem: pickString(preseeded.purchaseItem, 'Coffee'),
          rewardItem: pickString(preseeded.reward, preseeded.rewardRule, 'Reward'),
          source: 'MATRIX_SPEC',
          forceMatrix: matrixSpec,
        });
      }
    } else {
      preseeded = alignLegacyFieldsWithCanonicalRule(preseeded);
    }
    logLoyaltyContractDiagnostic('buildLoyaltyProgramDraftData_input', preseeded, {
      missionId: params.missionId ?? null,
      storeId: params.storeId ?? null,
      evidenceId: preseeded.evidenceId ?? null,
      attachmentId: preseeded.attachmentId ?? null,
      sourceMode: preseeded.sourceMode ?? null,
    });

    const sourceBound =
      Boolean(preseeded.evidenceId || preseeded.attachmentId || preseeded.extractedFromImage) &&
      String(preseeded.sourceMode ?? '').toUpperCase() === 'SOURCE_DRIVEN';
    if (sourceBound && !hasAuthoritativeLoyaltyTopology(preseeded.cardTopology)) {
      throw new LoyaltyContractError(
        'LOYALTY_EVIDENCE_LOST',
        'Source-driven loyalty evidence exists but card topology was lost before draft build.',
        {
          missionId: params.missionId ?? null,
          evidenceId: preseeded.evidenceId ?? null,
          attachmentId: preseeded.attachmentId ?? null,
        },
      );
    }
  }

  const catalogReward = inferRewardFromCatalog({

    businessCategory,

    products: params.products,

  });



  const primaryTier = tiers[0] ?? { name: 'Member', minPoints: 0, reward: 'Welcome perk' };

  const primaryOffer = offers[0] ?? {

    headline: `${storeName} loyalty rewards`,

    rewardDescription: 'Earn stamps on every visit',

    ctaText: 'Join now',

  };



  let requiredStamps = customerCount > 20 ? 10 : 9;

  let reward = primaryOffer.rewardDescription || primaryTier.reward || '1 free item';

  let rewardRule = `Buy ${requiredStamps}, get 1 free`;

  let programName = `${storeName} Rewards`;

  let confidence = 0.55;

  const evidence = Array.isArray(params.evidence) ? [...params.evidence] : [];

  const missingFields = [];



  if (preseeded) {

    programName = pickString(preseeded.programName, programName);

    const seededStamps = preseeded.stampThreshold ?? preseeded.requiredStamps;
    const ruleStamps =
      preseeded.rule && typeof preseeded.rule === 'object'
        ? Number(preseeded.rule.purchasesRequired)
        : null;
    if (Number.isFinite(ruleStamps) && ruleStamps > 0) {
      requiredStamps = Math.max(1, Math.round(ruleStamps));
    } else if (seededStamps != null) {
      requiredStamps = Math.max(1, Number(seededStamps) || requiredStamps);
    }

    reward = pickString(preseeded.reward, preseeded.rewardDescription, reward);

    rewardRule = pickString(
      preseeded.rewardRule,
      preseeded.rule?.rewardItem ? `Collect ${requiredStamps} ${preseeded.rule.purchaseItem ?? 'stamps'}, receive ${preseeded.rule.rewardItem}` : null,
      `Buy ${requiredStamps}, get ${reward}`,
    );

    confidence = Math.max(confidence, Number(preseeded.confidence) || 0.85);

    evidence.push('preseeded_scanner_data');

    if (preseeded.extractedFromImage) evidence.push('loyalty_card_image');
    if (preseeded.cardTopology) evidence.push('loyalty_card_topology');

  } else if (catalogReward?.rewardTemplate) {

    const hint = catalogReward.productHint;

    rewardRule = catalogReward.rewardTemplate(hint);

    reward = rewardRule.includes('get') ? rewardRule.split('get').slice(1).join('get').trim() : reward;

    confidence = 0.72;

    evidence.push('catalog_products', `category:${businessCategory}`);

  }



  if (params.existingProgram?.id) {

    evidence.push('existing_loyalty_program');

  }



  const draftShape = {

    programType: pickString(preseeded?.programType, 'stamp_card'),

    programName,

    rewardRule,

    requiredStamps,

    reward,

    customerInstructions: `Collect ${requiredStamps} stamps to unlock your reward.`,

    ownerInstructions:

      params.mode === 'improvement'

        ? 'Review improvements to your existing loyalty program before applying changes.'

        : 'Print QR at checkout, train staff to stamp digital cards, and promote the program on social.',

    rolloutSteps: [

      'Announce the program in-store and on social',

      'Place QR/NFC signage at the counter',

      'Train staff on stamping workflow',

      customerCount > 0 ? 'Send a launch email or SMS to repeat customers' : 'Start capturing repeat visits with digital stamps',

    ],

    rolloutCampaignCopy: primaryOffer.headline || `${programName} — ${rewardRule}`,

    qrNfcSuggestion: 'Add a loyalty QR to receipts and counter signage so customers can join on their phone.',

    tiers,

    offers,

    loyalCustomerCount: customerCount,

    businessCategory,

    requirements: requirements || null,

    expiryNote: pickString(preseeded?.expiry, preseeded?.expiryPolicy) || 'No expiry by default — set limits when you apply if needed.',

    terms: pickString(preseeded?.terms) || null,

    confidence,

    evidence,

    missingFields,

    mode: params.mode ?? 'create',

    existingProgramId: params.existingProgram?.id ?? null,

    extractedFromImage: Boolean(preseeded?.extractedFromImage),

    imageAssetId: pickString(preseeded?.imageAssetId) || null,

    rule: preseeded?.rule && typeof preseeded.rule === 'object' ? preseeded.rule : null,

    cardTopology:
      preseeded?.cardTopology && typeof preseeded.cardTopology === 'object'
        ? preseeded.cardTopology
        : null,

    cardFooterText: pickString(preseeded?.cardFooterText, preseeded?.cardTopology?.footerText) || null,

    topologyReviewRequired: Boolean(preseeded?.topologyReviewRequired ?? preseeded?.cardTopology?.reviewRequired),

  };

  const alignedDraft = alignLegacyFieldsWithCanonicalRule(draftShape);
  logLoyaltyContractDiagnostic('loyalty_program_draft_artifact', alignedDraft, {
    missionId: params.missionId ?? null,
  });
  return alignedDraft;
}



/**

 * @param {{

 *   store: { id: string, name: string, type?: string | null };

 *   context: Awaited<ReturnType<typeof gatherLoyaltyProgramContext>>;

 *   pipeline: object;

 *   preseededDraft?: object | null;

 *   requirements?: string | null;

 *   missionEvidenceGraph?: object | null;

 * }} params

 */

export function planLoyaltyProgramDraft(params) {

  const store = params.store;

  const context = params.context;

  const pipeline = params.pipeline ?? {};

  const preseeded =

    params.preseededDraft && typeof params.preseededDraft === 'object' ? params.preseededDraft : null;

  const requirements = pickString(params.requirements);

  const businessCategory = pickString(store.type, 'General');

  const customerCount = Number(context.customerCount) || 0;

  const hasCatalog = Array.isArray(context.products) && context.products.length > 0;

  const hasPreseed = Boolean(preseeded?.reward || preseeded?.requiredStamps);

  const hasRequirements = Boolean(requirements);

  const hasExisting = Boolean(context.existingProgram?.id);



  const insufficient =

    !hasPreseed &&

    !hasRequirements &&

    !hasExisting &&

    !hasCatalog &&

    customerCount === 0 &&

    businessCategory === 'General';



  if (insufficient) {

    return {

      blocked: true,

      blocker: {

        code: 'LOYALTY_CONTEXT_INSUFFICIENT',

        message:

          'Need more context to draft a loyalty program. Upload a loyalty card, describe your reward rules, or add products to your catalog first.',

      },

      missingFields: ['reward_rule', 'catalog_or_card_or_requirements'],

      confidence: 0.2,

      evidence: ['insufficient_store_context'],

    };

  }



  const mode = hasExisting ? 'improvement' : 'create';

  const draft = buildLoyaltyProgramDraftData({

    storeName: store.name,

    businessCategory,

    customerCount,

    tiers: pipeline.tiers ?? [],

    offers: pipeline.offers ?? [],

    requirements,

    preseededDraft: preseeded,

    products: context.products,

    existingProgram: context.existingProgram,

    mode,

    evidence: Object.entries(context.evidence ?? {}).map(([k, v]) => `${k}:${v}`),

  });



  if (hasExisting && context.existingProgram) {

    draft.priorProgram = {

      id: context.existingProgram.id,

      name: context.existingProgram.name,

      stampsRequired: context.existingProgram.stampsRequired,

      reward: context.existingProgram.reward,

    };

    draft.programName = `${store.name} Rewards`;

    draft.ownerInstructions =

      `You already have "${context.existingProgram.name}". Review suggested improvements before applying.`;

    draft.confidence = Math.max(draft.confidence, 0.8);

    draft.evidence.push('existing_program_improvement');

  }

  const creationContract = buildLoyaltyCreationContract({
    storeId: store.id,
    preseededDraft: { ...preseeded, ...draft },
    userMessage: requirements,
    requirements,
    hasAttachmentEvidence:
      Boolean(preseeded?.evidenceId || preseeded?.attachmentId) ||
      preseeded?.extractedFromImage === true ||
      Boolean(preseeded?.cardTopology) ||
      Boolean(preseeded?.rule),
    storeContext: context,
    missionEvidenceGraph: params.missionEvidenceGraph ?? null,
  });

  if (
    creationContract.sourceMode === 'SOURCE_DRIVEN' &&
    (creationContract.sourceEvidence?.evidenceId || preseeded?.evidenceId) &&
    !hasAuthoritativeLoyaltyTopology(creationContract.cardTopology)
  ) {
    throw new LoyaltyContractError(
      'SOURCE_TOPOLOGY_MISSING',
      'Card analysis completed, but its topology was not attached to this mission.',
      {
        missionId: params.missionId ?? null,
        evidenceId: creationContract.sourceEvidence?.evidenceId ?? preseeded?.evidenceId ?? null,
        storeId: store.id,
      },
    );
  }

  const unifiedDraft = loyaltyCreationContractToDraft(creationContract);
  unifiedDraft.evidence = draft.evidence;
  unifiedDraft.ownerInstructions = draft.ownerInstructions;
  unifiedDraft.priorProgram = draft.priorProgram;
  unifiedDraft.tiers = draft.tiers;
  unifiedDraft.offers = draft.offers;
  unifiedDraft.confidence = Math.max(draft.confidence, creationContract.sourceEvidence?.confidence ?? 0);

  logLoyaltyContractDiagnostic('loyalty_creation_contract', unifiedDraft, {
    missionId: params.missionId ?? null,
    storeId: store.id,
    evidenceId: creationContract.sourceEvidence?.evidenceId ?? preseeded?.evidenceId ?? null,
    attachmentId: preseeded?.attachmentId ?? null,
    sourceMode: creationContract.sourceMode ?? null,
  });

  return {

    blocked: false,

    draft: unifiedDraft,

    creationContract,

    confidence: unifiedDraft.confidence,

    evidence: unifiedDraft.evidence,

    missingFields: creationContract.missingFields ?? draft.missingFields,

    mode,

  };

}



/**

 * @param {{ storeId: string, userId?: string | null }} params

 */

export async function assertStoreOwnership(params) {

  const storeId = pickString(params.storeId);

  const userId = pickString(params.userId);

  if (!storeId) {

    return {

      ok: false,

      status: 'blocked',

      blocker: {

        code: 'STORE_REQUIRED',

        message: 'Choose a store before setting up a loyalty campaign.',

      },

    };

  }

  if (!userId) {

    return {

      ok: false,

      status: 'blocked',

      blocker: {

        code: 'AUTH_REQUIRED',

        message: 'Sign in to set up a loyalty program.',

      },

    };

  }



  const prisma = getPrismaClient();

  const store = await prisma.business.findFirst({

    where: { id: storeId, userId, isActive: true },

    select: { id: true, name: true, type: true, slug: true },

  });

  if (!store) {

    return {

      ok: false,

      status: 'blocked',

      blocker: {

        code: 'STORE_ACCESS_DENIED',

        message: 'You do not have access to this store.',

      },

    };

  }

  return { ok: true, store };

}



/**

 * @param {{ storeId: string, userId?: string | null, requirements?: string | null, context?: object, businessCategory?: string }} params

 */

export async function runLoyaltyProgramPipeline(params) {

  const storeId = pickString(params.storeId);

  const ctx = params.context && typeof params.context === 'object' ? params.context : {};



  const segmentResult = await segmentLoyalCustomers({ storeId }, ctx);

  const segmentOut = nestedOutput(segmentResult);

  const customerCount = Number(segmentOut.customerCount) || 0;



  const tiersResult = await defineLoyaltyTiers({ storeId, customerCount }, ctx);

  const tiersOut = nestedOutput(tiersResult);

  const tiers = Array.isArray(tiersOut.tiers) ? tiersOut.tiers : [];



  const offersResult = await createLoyaltyOffer(

    {

      storeId,

      tiers,

      businessCategory: pickString(params.businessCategory, 'General'),

    },

    ctx,

  );

  const offersOut = nestedOutput(offersResult);

  const offers = Array.isArray(offersOut.offers) ? offersOut.offers : [];



  return { segmentOut, tiersOut, offersOut, customerCount, tiers, offers };

}



/**

 * @param {{

 *   storeId: string;

 *   userId: string;

 *   tenantId?: string | null;

 *   missionId?: string | null;

 *   draft: object;

 *   source?: string;

 *   runtimeContext?: object;

 *   artifactId?: string | null;

 * }} params

 */

export async function applyLoyaltyProgramDraft(params) {

  return writeLoyaltyProgramFromMission(params);

}



/**
 * @param {Record<string, unknown>} draft
 * @returns {number | null}
 */
export function resolveDraftStampThreshold(draft = {}) {
  const rule = draft.rule && typeof draft.rule === 'object' ? draft.rule : null;
  const fromRule = Number(rule?.purchasesRequired);
  if (Number.isFinite(fromRule) && fromRule > 0) return Math.round(fromRule);
  const n = Number(draft.stampThreshold ?? draft.requiredStamps);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}



/**
 * Owner / execution-draft values win over OCR or planner defaults.
 * @param {Record<string, unknown>} draft
 * @param {Record<string, unknown>} [seed]
 */
export function applyCanonicalLoyaltyDraftFields(draft = {}, seed = {}) {
  const enrichedSeed = hasAuthoritativeLoyaltyTopology(seed.cardTopology)
    ? alignLegacyFieldsWithCanonicalRule(
        seed && typeof seed === 'object' ? { ...seed } : {},
      )
    : (() => {
        const matrixSpec = parseStampMatrixSpec(seed.stampMatrix);
        if (matrixSpec) {
          return enrichLoyaltyDraftWithMatrixTopology(
            seed && typeof seed === 'object' ? { ...seed } : {},
            {
              rewardItem: pickString(seed.reward, seed.rewardRule, 'Reward'),
              purchaseItem: pickString(seed.purchaseItem, 'Coffee'),
              source: 'MATRIX_SPEC',
              forceMatrix: matrixSpec,
            },
          );
        }
        return alignLegacyFieldsWithCanonicalRule(
          seed && typeof seed === 'object' ? { ...seed } : {},
        );
      })();
  const out = { ...(draft && typeof draft === 'object' ? draft : {}) };

  if (enrichedSeed.rule && typeof enrichedSeed.rule === 'object') {
    out.rule = enrichedSeed.rule;
  }
  if (enrichedSeed.cardTopology && typeof enrichedSeed.cardTopology === 'object') {
    out.cardTopology = enrichedSeed.cardTopology;
  }
  if (enrichedSeed.matrix && typeof enrichedSeed.matrix === 'object') {
    out.matrix = enrichedSeed.matrix;
  }
  if (enrichedSeed.stampMatrix) out.stampMatrix = enrichedSeed.stampMatrix;
  const footer = pickString(
    seed.cardFooterText,
    enrichedSeed.cardFooterText,
    enrichedSeed.cardTopology?.footerText,
  );
  if (footer) out.cardFooterText = footer;
  if (enrichedSeed.layoutSource || seed.layoutSource) {
    out.layoutSource = pickString(enrichedSeed.layoutSource, seed.layoutSource);
  }
  if (enrichedSeed.layoutConfidence != null || seed.layoutConfidence != null) {
    out.layoutConfidence = Number(enrichedSeed.layoutConfidence ?? seed.layoutConfidence);
  }
  if (seed.topologyReviewRequired != null) {
    out.topologyReviewRequired = Boolean(seed.topologyReviewRequired);
  }

  const stamps = resolveDraftStampThreshold(enrichedSeed) ?? resolveDraftStampThreshold(out);
  const reward = pickString(seed.reward, seed.rewardRule, out.reward, out.rule?.rewardItem);
  if (reward) {
    out.reward = reward;
  }
  if (stamps != null) {
    out.requiredStamps = stamps;
    out.stampThreshold = stamps;
    const rule = out.rule && typeof out.rule === 'object' ? out.rule : null;
    out.rewardRule = pickString(
      seed.rewardRule,
      rule
        ? `Collect ${rule.purchasesRequired} ${rule.purchaseItem} · Get ${rule.rewardQuantity} ${rule.rewardItem}`
        : null,
      out.rewardRule,
      reward ? `Buy ${stamps}, get ${reward}` : `Buy ${stamps}, get 1 free`,
    );
    out.customerInstructions = pickString(
      out.customerInstructions,
      rule
        ? `Collect ${rule.purchasesRequired} ${rule.purchaseItem} stamps to unlock your reward.`
        : `Collect ${stamps} stamps to unlock your reward.`,
    );
  }
  const programName = pickString(seed.programName, out.programName);
  if (programName) out.programName = programName;
  return out;
}



export function loyaltyDraftArtifact(draft, missionId = null) {

  const artifactId = `loyalty-draft-${randomUUID().slice(0, 8)}`;

  return {

    type: 'loyalty_program_draft',

    title: 'Loyalty Program Draft',

    data: { ...draft, artifactId },

    missionId,

    artifactId,

  };

}



export { gatherLoyaltyProgramContext };


