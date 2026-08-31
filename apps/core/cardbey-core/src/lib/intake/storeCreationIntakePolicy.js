/**
 * Day 3 — intelligence-first store creation intake policy.
 * Classifies input, separates inferable vs hard-blocker gaps, and emits lightweight telemetry.
 */

import { isVagueLocationPhrase } from '../multiAgent/multiStorePlanHelpers.ts';
import { shouldRunStoreCreationResearchFromFields } from '../storeCreationResearch/researchInputFields.js';
import { extractFirstUrlFromText } from './storeCreationDraftAssetBridge.js';
import { isBareStoreCreateRequest } from '../intent/storeCreateFastPath.js';

/** @typedef {'url' | 'name' | 'description' | 'name_url' | 'mixed' | 'insufficient'} StoreCreationInputMode */

const INSUFFICIENT_PATTERNS = [
  /^help me start something\.?$/i,
  /^start something\.?$/i,
  /^i need help\.?$/i,
  /^help me\.?$/i,
  /^create something\.?$/i,
  /^help me create something\.?$/i,
];

/**
 * @param {string | null | undefined} msg
 */
export function isProvisionalDescriptionInput(msg) {
  const text = String(msg ?? '').trim();
  if (!text || text.length < 12) return false;
  return (
    /^i run (?:a|an) /i.test(text) ||
    /^i (?:own|operate|manage) (?:a|an) /i.test(text) ||
    /^we (?:run|operate|are) (?:a|an) /i.test(text) ||
    /\b(?:factory|packaging|handyman)\b/i.test(text)
  );
}

/**
 * @param {string | null | undefined} userMessage
 * @param {{ name?: string | null; website?: string | null; location?: string | null }} [draft]
 * @returns {StoreCreationInputMode}
 */
export function classifyStoreCreationInputMode(userMessage, draft = {}) {
  const msg = String(userMessage ?? '').trim();
  const url = draft.website || extractFirstUrlFromText(msg) || null;
  const hasName = Boolean(String(draft?.name ?? '').trim().length >= 2);
  const hasDescription = isProvisionalDescriptionInput(msg);

  if (INSUFFICIENT_PATTERNS.some((pattern) => pattern.test(msg))) return 'insufficient';
  if (isBareStoreCreateRequest(msg)) return 'mixed';
  if (!msg && !url && !hasName) return 'insufficient';

  if (url && hasName) return 'name_url';
  if (url && !hasName) return 'url';
  if (hasName && !url && !hasDescription) return 'name';
  if (hasDescription && !hasName && !url) return 'description';
  if (hasName || url || hasDescription) return 'mixed';
  return 'insufficient';
}

/**
 * @param {{ name?: string | null; website?: string | null; location?: string | null; category?: string | null; phone?: string | null; email?: string | null }} draft
 * @param {string} [userMessage]
 */
export function resolveDraftResearchFields(draft, userMessage = '') {
  const website = draft?.website || extractFirstUrlFromText(userMessage) || null;
  const category =
    draft?.category && String(draft.category).toLowerCase() !== 'other' ? draft.category : null;
  return {
    businessName: draft?.name || null,
    website,
    location: draft?.location || null,
    phone: draft?.phone || null,
    email: draft?.email || null,
    category,
    ocrText: null,
    socialLinks: null,
  };
}

/**
 * @param {object} draft
 * @param {string} [userMessage]
 */
export function isStoreCreationResearchEligible(draft, userMessage = '') {
  const fields = resolveDraftResearchFields(draft, userMessage);
  return shouldRunStoreCreationResearchFromFields(
    {
      businessName: fields.businessName,
      website: fields.website,
      location: fields.location,
      phone: fields.phone,
      email: fields.email,
      businessType: fields.category,
    },
    fields,
  );
}

/**
 * @param {object} draft
 * @param {string} [userMessage]
 */
export function isNameOnlyIntakeEligible(draft, userMessage = '') {
  const name = String(draft?.name ?? '').trim();
  if (name.length < 2) return false;
  const mode = classifyStoreCreationInputMode(userMessage, draft);
  if (mode !== 'name' && mode !== 'mixed') return false;
  return name.split(/\s+/).filter(Boolean).length >= 2 || name.length >= 8;
}

/**
 * @param {'name' | 'location' | 'category'} field
 * @param {object} draft
 * @param {string} userMessage
 * @param {{ inputMode?: StoreCreationInputMode; provisionalConcept?: boolean; inferredCategory?: boolean }} [ctx]
 */
export function isFieldInferableAtIntake(field, draft, userMessage = '', ctx = {}) {
  const inputMode = ctx.inputMode ?? classifyStoreCreationInputMode(userMessage, draft);
  const provisionalConcept = Boolean(ctx.provisionalConcept);
  const website = draft?.website || extractFirstUrlFromText(userMessage) || null;

  if (field === 'name') {
    if (String(draft?.name ?? '').trim().length >= 2) return false;
    if (website) return true;
    if (provisionalConcept) return true;
    return false;
  }

  if (field === 'location') {
    const location = String(draft?.location ?? '').trim();
    if (location.length >= 2 && !isVagueLocationPhrase(location)) return false;
    if (website) return true;
    if (isStoreCreationResearchEligible(draft, userMessage)) return true;
    if (isNameOnlyIntakeEligible(draft, userMessage)) return true;
    if (inputMode === 'description' && /\b(?:in|customers in)\s+[A-Za-z]/i.test(userMessage)) return true;
    return false;
  }

  if (field === 'category') {
    const category = String(draft?.category ?? '').trim();
    if (category && category.toLowerCase() !== 'other') return false;
    if (website && String(draft?.name ?? '').trim().length >= 2) return true;
    if (isStoreCreationResearchEligible(draft, userMessage)) return true;
    if (isNameOnlyIntakeEligible(draft, userMessage)) return true;
    if (inputMode === 'description' && ctx.inferredCategory) return true;
    if (provisionalConcept && category && category.toLowerCase() !== 'other') return true;
    return false;
  }

  return false;
}

/**
 * @param {Array<{ name?: string; label?: string }>} candidates
 */
export function buildAmbiguousEntityClarification(candidates = []) {
  const labels = candidates
    .map((c) => String(c?.name ?? c?.label ?? '').trim())
    .filter(Boolean)
    .slice(0, 3);
  if (labels.length >= 2) {
    return `We found multiple businesses that could match. Which one is yours?\n\n${labels.map((l) => `• ${l}`).join('\n')}`;
  }
  return 'We found multiple businesses that could match. Which one is yours?';
}

/**
 * @param {import('./storeCreationDraft.js').StoreCreationDraftBundle} bundle
 */
export function buildSingleClarificationMessage(bundle) {
  const assessment = bundle?.intakeAssessment;
  if (assessment?.ambiguousEntityCandidates?.length) {
    return buildAmbiguousEntityClarification(assessment.ambiguousEntityCandidates);
  }
  if (assessment?.clarificationReason === 'insufficient_input') {
    return 'What kind of business do you want to create? A name, website, or short description is enough to get started.';
  }
  const missing = bundle?.missingFields ?? [];
  if (missing.length === 1 && missing[0] === 'name') {
    return 'What should we call this business?';
  }
  if (missing.length === 1 && missing[0] === 'location') {
    const name = String(bundle?.draft?.name ?? '').trim();
    return name
      ? `Where is ${name} located?`
      : 'Where is this business located?';
  }
  if (missing.length === 1 && missing[0] === 'category') {
    const name = String(bundle?.draft?.name ?? '').trim();
    return name ? `What type of business is ${name}?` : 'What type of business is this?';
  }
  return "Tell me a bit more about the business — a name, website, or short description is enough to start.";
}

/**
 * @param {import('./storeCreationDraft.js').StoreCreationDraft} draft
 * @param {string} [userMessage]
 * @param {{ ambiguousEntity?: boolean; ambiguousEntityCandidates?: object[]; intelligenceFirst?: boolean }} [options]
 */
export function assessStoreCreationIntake(draft, userMessage = '', options = {}) {
  const intelligenceFirst = options.intelligenceFirst !== false;
  const inputMode = classifyStoreCreationInputMode(userMessage, draft);
  const provisionalConcept = isProvisionalDescriptionInput(userMessage) && !String(draft?.name ?? '').trim();
  const inferredCategory = Boolean(
    draft?.category && String(draft.category).trim() && String(draft.category).toLowerCase() !== 'other',
  );
  const ctx = { inputMode, provisionalConcept, inferredCategory };

  /** @type {import('./storeCreationDraft.js').StoreCreationDraftField[]} */
  const missingFields = [];
  const inferableFields = /** @type {import('./storeCreationDraft.js').StoreCreationDraftField[]} */ ([]);

  const name = String(draft?.name ?? '').trim();
  const location = String(draft?.location ?? '').trim();
  const category = String(draft?.category ?? '').trim();

  const fields = ['name', 'location', 'category'];
  for (const field of fields) {
    const inferable = intelligenceFirst && isFieldInferableAtIntake(field, draft, userMessage, ctx);
    if (inferable) {
      inferableFields.push(field);
      continue;
    }
    if (field === 'name') {
      if (!name || name.length < 2) {
        if (!provisionalConcept) missingFields.push('name');
      }
    } else if (field === 'location') {
      if (!location || location.length < 2 || isVagueLocationPhrase(location)) missingFields.push('location');
    } else if (field === 'category') {
      if (!category || category.toLowerCase() === 'other') missingFields.push('category');
    }
  }

  const researchEligible =
    isStoreCreationResearchEligible(draft, userMessage) || isNameOnlyIntakeEligible(draft, userMessage);
  const insufficient = inputMode === 'insufficient' && !researchEligible && !provisionalConcept;
  const ambiguousEntity = Boolean(options.ambiguousEntity);
  const clarificationRequired = insufficient || ambiguousEntity || missingFields.length > 0;
  const clarificationReason = insufficient
    ? 'insufficient_input'
    : ambiguousEntity
      ? 'ambiguous_entity'
      : missingFields[0] ?? null;
  const canProceedToCheckpoint =
    !insufficient && !ambiguousEntity && missingFields.length === 0 && (researchEligible || provisionalConcept || name.length >= 2);

  const fieldsSuppliedByUser = [];
  if (name) fieldsSuppliedByUser.push('name');
  if (location) fieldsSuppliedByUser.push('location');
  if (category && category.toLowerCase() !== 'other') fieldsSuppliedByUser.push('category');
  if (draft?.website) fieldsSuppliedByUser.push('website');

  return {
    inputMode,
    missingFields,
    inferableFields,
    hardBlockers: [
      ...(insufficient ? ['insufficient_input'] : []),
      ...(ambiguousEntity ? ['ambiguous_entity'] : []),
      ...missingFields,
    ],
    clarificationRequired,
    clarificationReason,
    researchEligible,
    canProceedToCheckpoint,
    provisionalConcept,
    ambiguousEntityCandidates: options.ambiguousEntityCandidates ?? [],
    telemetry: {
      inputMode,
      fieldsSuppliedByUser,
      fieldsInferredByResearch: inferableFields,
      fieldsStillUnknown: missingFields,
      clarificationRequired,
      clarificationReason,
      researchEligible,
    },
  };
}
