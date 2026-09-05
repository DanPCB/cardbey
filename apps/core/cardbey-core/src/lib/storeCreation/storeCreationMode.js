/**
 * Store creation mode: NEW vs EXISTING vs AMBIGUOUS.
 * Research enriches EXISTING; NEW gets AI starter content without requiring public evidence.
 */

export const STORE_CREATION_MODES = Object.freeze({
  EXISTING_BUSINESS: 'EXISTING_BUSINESS',
  NEW_BUSINESS: 'NEW_BUSINESS',
  AMBIGUOUS_BUSINESS: 'AMBIGUOUS_BUSINESS',
});

/**
 * @param {object} input
 * @param {{ found?: boolean, researchRan?: boolean, fallbackToGenerated?: boolean, itemCount?: number }|null} [research]
 * @param {{ slug?: string, confidence?: number, matchedKeywords?: string[], insufficientUnderstanding?: boolean }|null} [vertical]
 */
export function resolveStoreCreationMode(input = {}, research = null, vertical = null) {
  const website = String(input.websiteUrl ?? input.website ?? '').trim();
  const hasWebsite = Boolean(website);
  const hasUploads = Boolean(
    input.cardImageDataUrl ||
      input.hasOwnerMedia ||
      (Array.isArray(input.uploads) && input.uploads.length > 0) ||
      input.documentText ||
      input.ocrRawText,
  );
  const researchFound =
    research?.found === true ||
    (research?.researchRan === true &&
      research?.fallbackToGenerated !== true &&
      Number(research?.itemCount ?? 0) > 0);

  if (researchFound || (hasWebsite && research?.researchRan === true && research?.fallbackToGenerated !== true)) {
    return {
      creationMode: STORE_CREATION_MODES.EXISTING_BUSINESS,
      reason: researchFound ? 'research_evidence' : 'website_research',
      needsClarification: false,
    };
  }

  const name = String(input.businessName ?? input.storeName ?? input.name ?? '').trim();
  const category = String(input.category ?? input.businessType ?? input.storeType ?? '').trim();
  const confidence = Number(vertical?.confidence ?? 0);
  const insufficient = vertical?.insufficientUnderstanding === true;
  const slug = String(vertical?.slug ?? '').toLowerCase();
  const hasSemanticLock =
    Boolean(slug) &&
    slug !== 'services.generic' &&
    !insufficient &&
    (confidence > 0 || (Array.isArray(vertical?.matchedKeywords) && vertical.matchedKeywords.length > 0));

  // Broad category + no name semantic signal → one clarification.
  if (
    !hasWebsite &&
    !hasUploads &&
    !researchFound &&
    category &&
    name &&
    (insufficient || slug === 'services.generic' || confidence <= 0) &&
    !hasSemanticLock
  ) {
    return {
      creationMode: STORE_CREATION_MODES.AMBIGUOUS_BUSINESS,
      reason: 'weak_semantics',
      needsClarification: true,
      clarificationPrompt: `What will ${name} mainly offer?`,
      clarificationOptions: [
        'Products / retail',
        'Food & drink',
        'Services',
        'Something else',
      ],
    };
  }

  return {
    creationMode: STORE_CREATION_MODES.NEW_BUSINESS,
    reason: hasUploads ? 'owner_intent_with_uploads' : hasWebsite ? 'no_research_match' : 'no_external_evidence',
    needsClarification: false,
  };
}

/**
 * Provenance stamp for AI starter offerings (never claim researched fact).
 */
export function newBusinessStarterProvenance() {
  return {
    source: 'AI_GENERATED_STARTER',
    evidenceStatus: 'UNVERIFIED_NEW_BUSINESS',
    editable: true,
    offeringProvenance: 'AI_GENERATED_STARTER',
  };
}
