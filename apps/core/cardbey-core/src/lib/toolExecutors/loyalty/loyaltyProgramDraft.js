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

  const preseeded =

    params.preseededDraft && typeof params.preseededDraft === 'object' ? params.preseededDraft : null;

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
    if (seededStamps != null) {
      requiredStamps = Math.max(1, Number(seededStamps) || requiredStamps);
    }

    reward = pickString(preseeded.reward, preseeded.rewardDescription, reward);

    rewardRule = pickString(preseeded.rewardRule, `Buy ${requiredStamps}, get ${reward}`);

    confidence = Math.max(confidence, Number(preseeded.confidence) || 0.85);

    evidence.push('preseeded_scanner_data');

    if (preseeded.extractedFromImage) evidence.push('loyalty_card_image');

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



  return {

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

  };

}



/**

 * @param {{

 *   store: { id: string, name: string, type?: string | null };

 *   context: Awaited<ReturnType<typeof gatherLoyaltyProgramContext>>;

 *   pipeline: object;

 *   preseededDraft?: object | null;

 *   requirements?: string | null;

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



  return {

    blocked: false,

    draft,

    confidence: draft.confidence,

    evidence: draft.evidence,

    missingFields: draft.missingFields,

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
  const n = Number(draft.stampThreshold ?? draft.requiredStamps);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}



/**
 * Owner / execution-draft values win over OCR or planner defaults.
 * @param {Record<string, unknown>} draft
 * @param {Record<string, unknown>} [seed]
 */
export function applyCanonicalLoyaltyDraftFields(draft = {}, seed = {}) {
  const out = { ...(draft && typeof draft === 'object' ? draft : {}) };
  const stamps = resolveDraftStampThreshold(seed) ?? resolveDraftStampThreshold(out);
  const reward = pickString(seed.reward, seed.rewardRule, out.reward);
  if (reward) {
    out.reward = reward;
  }
  if (stamps != null) {
    out.requiredStamps = stamps;
    out.stampThreshold = stamps;
    out.rewardRule = pickString(
      seed.rewardRule,
      out.rewardRule,
      reward ? `Buy ${stamps}, get ${reward}` : `Buy ${stamps}, get 1 free`,
    );
    out.customerInstructions = pickString(
      out.customerInstructions,
      `Collect ${stamps} stamps to unlock your reward.`,
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


