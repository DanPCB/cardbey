/**
 * Store creation mode classifier — Research (Path A) vs Generative (Path B).
 * Pure: no DB, no async. Decide BEFORE web research runs.
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * @param {object|null|undefined} input
 * @returns {{
 *   website: string,
 *   phone: string,
 *   email: string,
 *   location: string,
 *   ocrText: string,
 *   businessName: string,
 *   category: string,
 *   hasAttachmentAnalysis: boolean,
 * }}
 */
export function normalizeModeClassifierInput(input) {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const website = asTrimmedString(src.website ?? src.websiteUrl ?? src.url);
  const phone = asTrimmedString(src.phone ?? src.phoneNumber);
  const email = asTrimmedString(src.email);
  const location = asTrimmedString(src.location ?? src.suburb ?? src.city);
  const ocrText = asTrimmedString(src.ocrText ?? src.ocrRawText);
  const businessName = asTrimmedString(src.businessName ?? src.storeName ?? src.name);
  const category = asTrimmedString(
    src.businessType ?? src.storeType ?? src.category ?? src.verticalSlug ?? src.vertical,
  );
  const hasAttachmentAnalysis =
    src.attachmentAnalysis != null &&
    typeof src.attachmentAnalysis === 'object' &&
    !Array.isArray(src.attachmentAnalysis) &&
    Object.keys(src.attachmentAnalysis).length > 0;

  return {
    website,
    phone,
    email,
    location,
    ocrText,
    businessName,
    category,
    hasAttachmentAnalysis,
  };
}

/**
 * Classify whether store creation should research a real business or generate a concept mock-up.
 *
 * @param {object|null|undefined} input - draft / mission input fields
 * @param {object|null|undefined} intakeAssessment - optional assessStoreCreationIntake result
 * @returns {{ mode: 'research' | 'generative', reason: string, confidence: number }}
 */
export function classifyStoreCreationMode(input, intakeAssessment = null) {
  const fields = normalizeModeClassifierInput(input);
  const assessment =
    intakeAssessment && typeof intakeAssessment === 'object' && !Array.isArray(intakeAssessment)
      ? intakeAssessment
      : {};

  const websiteHttp =
    fields.website.length > 0 && /^https?:\/\//i.test(fields.website);
  if (websiteHttp) {
    return { mode: 'research', reason: 'has_website', confidence: 0.9 };
  }

  if (fields.ocrText.length > 20) {
    return { mode: 'research', reason: 'has_ocr_evidence', confidence: 0.85 };
  }

  if (fields.hasAttachmentAnalysis) {
    return { mode: 'research', reason: 'has_evidence', confidence: 0.85 };
  }

  if (fields.phone && fields.location) {
    return { mode: 'research', reason: 'has_phone_location', confidence: 0.8 };
  }

  const researchEligible = assessment.researchEligible === true;
  const provisionalConcept = assessment.provisionalConcept === true;
  const hasContactEvidence = Boolean(fields.website || fields.phone || fields.email || fields.ocrText);

  if (researchEligible && !provisionalConcept && hasContactEvidence) {
    return { mode: 'research', reason: 'intake_research_eligible', confidence: 0.7 };
  }

  // Path B — generative
  if (provisionalConcept) {
    return { mode: 'generative', reason: 'provisional_concept', confidence: 0.75 };
  }

  if (fields.businessName && !fields.website && !fields.phone && !fields.email && !fields.ocrText) {
    if (!fields.location && !fields.category) {
      return { mode: 'generative', reason: 'name_only', confidence: 0.8 };
    }
    // name + category and/or location without contact evidence → generative
    return { mode: 'generative', reason: 'concept_name_category_location', confidence: 0.75 };
  }

  if (!fields.website && !fields.phone && !fields.email && !fields.ocrText && !fields.hasAttachmentAnalysis) {
    return { mode: 'generative', reason: 'no_research_signals', confidence: 0.7 };
  }

  // Phone without location (or other weak contact) — still generative per "phone+location" rule
  return { mode: 'generative', reason: 'insufficient_research_signals', confidence: 0.65 };
}
