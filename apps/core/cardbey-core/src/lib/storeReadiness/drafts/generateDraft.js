/**
 * Deterministic draft content generator grounded in findings + snapshot (Phase 3).
 * No automatic apply / publish.
 */

import {
  DRAFT_TYPES,
  newDraftId,
  saveReadinessDraft,
  getReadinessDraft,
} from './draftStore.js';

/**
 * Map finding code → preferred draft type.
 * @param {string} findingCode
 * @param {string} [actionType]
 */
export function draftTypeForFinding(findingCode, actionType) {
  const code = String(findingCode || '');
  if (code.includes('DESCRIPTION') && code.includes('CATALOG')) return 'product_description';
  if (code.includes('SERVICE') && code.includes('DESCRIPTION')) return 'service_description';
  if (code.includes('PROFILE_MISSING_DESCRIPTION') || code.includes('PLACEHOLDER_DESCRIPTION')) {
    return 'business_description';
  }
  if (code.includes('TAGLINE') || (code.includes('HERO') && code.includes('HEAD'))) return 'hero_headline';
  if (code.includes('CTA')) return 'cta_text';
  if (code.includes('LOYALTY')) return 'loyalty_introduction';
  if (code.includes('CAMPAIGN') || code.includes('MARKETING')) return 'campaign_copy';
  if (actionType === 'generate_content' && code.includes('CATALOG')) return 'product_description';
  if (actionType === 'generate_content') return 'business_description';
  return 'business_description';
}

/**
 * @param {object} input
 * @param {import('../types.js').StoreReadinessSnapshot} input.snapshot
 * @param {object} [input.finding]
 * @param {string} [input.draftType]
 * @param {string} [input.generatedBy]
 * @param {Record<string, unknown>} [input.studioMeta]
 */
export function generateReadinessDraft(input) {
  const snapshot = input.snapshot;
  const finding =
    input.finding ||
    (input.findingCode
      ? (snapshot.findings || []).find((f) => f.code === input.findingCode)
      : null);
  const draftType = /** @type {import('./draftTypes.js').ReadinessDraftType} */ (
    DRAFT_TYPES.includes(input.draftType)
      ? input.draftType
      : draftTypeForFinding(finding?.code, finding?.recommendedActionType)
  );

  const storeName = input.studioMeta?.storeName || 'your business';
  const category = input.studioMeta?.category || snapshot.vertical || 'business';
  const productLabel = finding?.affectedObject?.label || 'this item';
  const now = new Date().toISOString();

  /** @type {Record<string, unknown>} */
  let content = {};
  switch (draftType) {
    case 'business_description':
      content = {
        text: `${storeName} is a ${category} ready to welcome customers. ${
          finding?.recommendation || 'Share what makes you unique, what you offer, and who you serve.'
        }`,
        field: 'description',
      };
      break;
    case 'hero_headline':
      content = {
        text: typeof storeName === 'string' ? `${storeName}` : 'Welcome',
        field: 'tagline',
      };
      break;
    case 'hero_subheading':
      content = {
        text: finding?.reason
          ? `Quality ${category} — ${String(finding.recommendation || '').slice(0, 120)}`
          : `Discover what ${storeName} has to offer.`,
        field: 'heroText',
      };
      break;
    case 'cta_text':
      content = {
        text: snapshot.vertical === 'service' ? 'Book now' : 'Order now',
        field: 'ctaLabel',
      };
      break;
    case 'product_description':
    case 'service_description':
      content = {
        text: `${productLabel}: a carefully prepared offering from ${storeName}. Ask us for details, options, and pricing.`,
        field: 'description',
        productId: finding?.affectedObject?.id || null,
      };
      break;
    case 'faq':
      content = {
        items: [
          {
            q: `What does ${storeName} offer?`,
            a: `We provide ${category} products and services tailored to local customers.`,
          },
          {
            q: 'How do I get in touch?',
            a: 'Use the contact options on our store page and we will respond promptly.',
          },
        ],
        field: 'faq',
      };
      break;
    case 'campaign_copy':
      content = {
        headline: `Discover ${storeName}`,
        body: `This week, explore what makes our ${category} special.`,
        field: 'campaign',
      };
      break;
    case 'loyalty_introduction':
      content = {
        text: `Join the ${storeName} rewards program — collect stamps and unlock member perks.`,
        field: 'loyaltyIntro',
      };
      break;
    default:
      content = { text: '', field: 'description' };
  }

  const draft = {
    id: newDraftId(),
    storeId: snapshot.storeId,
    ownerUserId: snapshot.ownerUserId,
    findingId: finding ? `finding_${finding.code}` : null,
    findingCode: finding?.code || null,
    draftType,
    status: /** @type {const} */ ('draft'),
    generatedBy: input.generatedBy || 'seller_assistant',
    content,
    targetObjectType: finding?.affectedObject?.type || 'store',
    targetObjectId: finding?.affectedObject?.id || snapshot.storeId,
    createdAt: now,
    updatedAt: now,
    approval: null,
    generation: 1,
    readinessScoreBefore: snapshot.overallScore,
    readinessScoreAfter: null,
  };

  return saveReadinessDraft(draft);
}

/**
 * Regenerate content without touching live store.
 * @param {string} draftId
 * @param {import('../types.js').StoreReadinessSnapshot} snapshot
 * @param {Record<string, unknown>} [studioMeta]
 */
export function regenerateReadinessDraft(draftId, snapshot, studioMeta = {}) {
  const existing = getReadinessDraft(draftId);
  if (!existing) return null;
  if (existing.storeId !== snapshot.storeId) return null;

  const temp = generateReadinessDraft({
    snapshot,
    findingCode: existing.findingCode || undefined,
    draftType: existing.draftType,
    generatedBy: existing.generatedBy,
    studioMeta,
  });

  existing.content = temp.content;
  existing.generation = (existing.generation || 1) + 1;
  existing.status = 'draft';
  existing.approval = null;
  existing.updatedAt = new Date().toISOString();
  existing.readinessScoreBefore = snapshot.overallScore;
  existing.readinessScoreAfter = null;
  saveReadinessDraft(existing);

  // Drop temporary generated row
  temp.status = 'discarded';
  saveReadinessDraft(temp);

  return existing;
}
