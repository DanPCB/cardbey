/**
 * Mission 001 Gate 2 — bounded name-only business resolution before research.
 */

import { resolveStoreResearchInputFields } from '../storeCreationResearch/researchInputFields.js';
import { resolveBusinessEntity } from '../storeResearch/businessEntityResolver.js';
import {
  scoreBusinessIdentityMatch,
  identityMatchAllowsImport,
} from '../performerGrounding/businessIdentityMatcher.js';
import Mission001Flags from './mission001Flags.js';

/**
 * @param {object} [params]
 * @param {object} [input]
 */
export function isNameOnlyResearchInput(params = {}, input = {}) {
  const fields = resolveStoreResearchInputFields(params, input);
  if (!fields.businessName || fields.businessName.length < 2) return false;
  return !(
    fields.website ||
    fields.location ||
    fields.phone ||
    fields.email ||
    fields.category ||
    fields.ocrText ||
    (fields.socialLinks && Object.keys(fields.socialLinks).length)
  );
}

/**
 * @param {object} [params]
 * @param {object} [input]
 */
export async function resolveNameOnlyInputForResearch(params = {}, input = {}) {
  if (!Mission001Flags.nameResolution || !isNameOnlyResearchInput(params, input)) {
    return {
      params,
      input,
      enriched: false,
      sparseMode: false,
      resolution: null,
    };
  }

  const fields = resolveStoreResearchInputFields(params, input);
  const resolution = await resolveBusinessEntity({
    businessName: fields.businessName,
    location: fields.location,
    websiteHint: fields.website,
    phoneHint: fields.phone,
  });

  const candidate = resolution.selectedCandidate;
  if (!candidate) {
    return {
      params,
      input,
      enriched: false,
      sparseMode: true,
      resolution,
      resolutionConfidence: resolution.confidence ?? 0,
    };
  }

  const match = scoreBusinessIdentityMatch(
    {
      businessName: fields.businessName,
      phone: fields.phone,
      website: fields.website,
      location: fields.location,
      category: fields.category,
    },
    candidate,
  );

  const ambiguousCandidates =
    (resolution.candidates?.length ?? 0) > 1 &&
    resolution.requiresOwnerConfirmation === true;

  const strongEntitySingleton =
    !ambiguousCandidates &&
    resolution.requiresOwnerConfirmation === false &&
    Number(candidate.confidence ?? resolution.confidence ?? 0) >= 0.72;

  const identityTrusted =
    strongEntitySingleton ||
    (identityMatchAllowsImport(match) &&
      match.status !== 'AMBIGUOUS' &&
      !ambiguousCandidates);

  if (!identityTrusted) {
    return {
      params,
      input,
      enriched: false,
      sparseMode: true,
      resolution,
      identityMatch: match,
      resolutionConfidence: match.score,
    };
  }

  const nextParams = { ...params };
  const nextInput = { ...(input && typeof input === 'object' ? input : {}) };

  if (candidate.location && !fields.location) {
    nextParams.location = candidate.location;
    nextInput.location = candidate.location;
  }
  if (candidate.website && !fields.website) {
    nextParams.website = candidate.website;
    nextInput.website = candidate.website;
    nextInput.websiteUrl = candidate.website;
  }
  if (candidate.phone && !fields.phone) {
    nextParams.phone = candidate.phone;
    nextInput.phone = candidate.phone;
  }
  if (candidate.category && !fields.category) {
    nextParams.businessType = candidate.category;
    nextInput.businessType = candidate.category;
  }

  return {
    params: nextParams,
    input: nextInput,
    enriched: true,
    sparseMode: false,
    resolution,
    identityMatch: match,
    resolutionConfidence: match.score,
  };
}
