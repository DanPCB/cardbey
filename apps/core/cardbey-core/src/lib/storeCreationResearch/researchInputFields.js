/**
 * Normalize store-creation research inputs from draft params / mission run body.
 * Mission run and draft rows often use `websiteUrl`; research modules expect `website`.
 */

import { cleanString, normalizeWebsite } from '../businessDiscovery/businessDataNormalizer.js';

/**
 * @param {object} [params]
 * @param {object} [input]
 */
export function resolveStoreResearchInputFields(params = {}, input = {}) {
  const websiteRaw =
    params.website ??
    input.website ??
    input.websiteUrl ??
    params.websiteUrl ??
    input.metadata?.websiteUrl ??
    null;
  const website = normalizeWebsite(
    typeof websiteRaw === 'string' ? websiteRaw : websiteRaw != null ? String(websiteRaw) : null,
  );

  const businessName = cleanString(
    params.businessName ?? input.businessName ?? input.storeName ?? input.name,
  );
  const location = cleanString(params.location ?? input.location);
  const phone = cleanString(params.phone ?? input.phone);
  const email = cleanString(params.email ?? input.email);
  const category = cleanString(
    params.businessType ??
      params.category ??
      input.businessType ??
      input.category ??
      input.storeType,
  );

  return {
    businessName,
    location,
    website,
    phone,
    email,
    category,
    socialLinks:
      input.socialLinks && typeof input.socialLinks === 'object'
        ? input.socialLinks
        : params.socialLinks && typeof params.socialLinks === 'object'
          ? params.socialLinks
          : null,
    ocrText: input.ocrRawText ?? input.ocrText ?? null,
    draftId: params.draftId ?? input.draftId ?? null,
    missionId: params.missionId ?? input.missionId ?? null,
  };
}

/**
 * @param {object} [params]
 * @param {object} [input]
 */
export function shouldRunStoreCreationResearchFromFields(params = {}, input = {}) {
  const fields = resolveStoreResearchInputFields(params, input);
  if (!fields.businessName || fields.businessName.length < 2) return false;
  return Boolean(
    fields.website ||
      fields.location ||
      fields.phone ||
      fields.email ||
      fields.category ||
      fields.ocrText ||
      (fields.socialLinks && Object.keys(fields.socialLinks).length),
  );
}
