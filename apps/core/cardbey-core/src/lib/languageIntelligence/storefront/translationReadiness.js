/**
 * Deterministic translation readiness evaluator (Stage 5A).
 */

import { normalizeLanguageCode } from '../contracts/languageCode.js';
import { getTranslatedField } from '../../../services/i18n/translationUtils.js';
import { expandPilotRequiredFields } from './translationFieldPolicy.js';
import { fingerprintSourceText, translationMetaKey } from './translationMetaStore.js';
import { isPubliclyConsumableQualityStatus } from './translationQualityStatus.js';

/**
 * @param {object} input
 * @param {string} input.storeId
 * @param {string} input.canonicalLanguage
 * @param {string} input.targetLanguage
 * @param {object} input.business
 * @param {object[]} [input.products]
 * @param {Record<string, object>} [input.metaMap]
 */
export function evaluateTranslationReadiness(input) {
  const targetLanguage = normalizeLanguageCode(input.targetLanguage);
  const canonicalLanguage = normalizeLanguageCode(input.canonicalLanguage) || 'en';
  const metaMap = input.metaMap && typeof input.metaMap === 'object' ? input.metaMap : {};
  const products = Array.isArray(input.products) ? input.products : [];
  const fields = expandPilotRequiredFields({ storeId: input.storeId, products });

  let required = 0;
  let translated = 0;
  let approved = 0;
  let stale = 0;
  let invalid = 0;
  let missing = 0;
  const reasonCodes = [];

  if (!targetLanguage || targetLanguage === canonicalLanguage) {
    return Object.freeze({
      targetLanguage: targetLanguage || canonicalLanguage,
      status: 'not_started',
      completionPercent: 0,
      counts: Object.freeze({
        required: 0,
        translated: 0,
        approved: 0,
        stale: 0,
        invalid: 0,
        missing: 0,
      }),
      publishable: false,
      reasonCodes: Object.freeze(['READINESS_SAME_AS_CANONICAL']),
    });
  }

  for (const desc of fields) {
    if (desc.translationNotRequired) continue;
    required += 1;
    const entity =
      desc.entityType === 'store'
        ? input.business
        : products.find((p) => String(p.id) === String(desc.entityId));
    if (!entity) {
      missing += 1;
      reasonCodes.push('TRANSLATION_SOURCE_MISSING');
      continue;
    }
    const sourceText = entity[desc.field];
    if (sourceText == null || String(sourceText).trim() === '') {
      // Empty canonical → not required for readiness
      required -= 1;
      continue;
    }
    const loc = getTranslatedField(entity, desc.field, targetLanguage);
    const key = translationMetaKey({
      entityType: desc.entityType,
      entityId: desc.entityType === 'store' ? null : desc.entityId,
      lang: targetLanguage,
      field: desc.field,
    });
    const meta = metaMap[key];
    const fp = fingerprintSourceText(sourceText);
    const hasText = loc != null && String(loc).trim() !== '' && String(loc) !== String(sourceText);

    if (!hasText) {
      missing += 1;
      reasonCodes.push('TRANSLATION_MISSING');
      continue;
    }
    translated += 1;

    let status = meta?.status || 'generated';
    if (meta?.sourceFingerprint && meta.sourceFingerprint !== fp) {
      status = 'stale';
      stale += 1;
      reasonCodes.push('TRANSLATION_SOURCE_CHANGED');
    } else if (status === 'stale') {
      stale += 1;
      reasonCodes.push('TRANSLATION_SOURCE_CHANGED');
    } else if (status === 'invalid') {
      invalid += 1;
      reasonCodes.push('TRANSLATION_INVALID');
    } else if (status === 'rejected' || status === 'suppressed') {
      invalid += 1;
      reasonCodes.push('TRANSLATION_BLOCKED');
    } else if (isPubliclyConsumableQualityStatus(status)) {
      approved += 1;
    }
  }

  const completionPercent =
    required === 0 ? 0 : Math.round((translated / required) * 100);

  let status = 'not_started';
  if (required === 0) status = 'not_started';
  else if (translated === 0) status = 'not_started';
  else if (stale > 0 || invalid > 0) status = stale > 0 ? 'stale' : 'blocked';
  else if (approved >= required && missing === 0) status = 'approved';
  else if (translated >= required && missing === 0) status = 'ready_for_review';
  else status = 'partial';

  const publishable =
    status === 'approved' && stale === 0 && invalid === 0 && missing === 0 && required > 0;

  return Object.freeze({
    targetLanguage,
    status,
    completionPercent,
    counts: Object.freeze({
      required,
      translated,
      approved,
      stale,
      invalid,
      missing,
    }),
    publishable,
    reasonCodes: Object.freeze([...new Set(reasonCodes)]),
  });
}

/**
 * Full language settings view for owners.
 */
export function buildStorefrontLanguageSettingsView({
  policy,
  pilot,
  business,
  products,
  metaMap,
}) {
  const langs = (policy.supportedDisplayLanguages || []).filter(
    (l) => l !== policy.canonicalLanguage,
  );
  const languageStatuses = langs.map((language) => {
    const r = evaluateTranslationReadiness({
      storeId: business.id,
      canonicalLanguage: policy.canonicalLanguage,
      targetLanguage: language,
      business,
      products,
      metaMap,
    });
    return Object.freeze({
      language,
      status: r.status,
      translatedFieldCount: r.counts.translated,
      requiredFieldCount: r.counts.required,
      approvedFieldCount: r.counts.approved,
      staleFieldCount: r.counts.stale,
      fallbackFieldCount: r.counts.missing,
      completionPercent: r.completionPercent,
      lastUpdatedAt: null,
      lastApprovedAt: null,
      publishable: r.publishable,
      reasonCodes: r.reasonCodes,
    });
  });

  return Object.freeze({
    canonicalLanguage: policy.canonicalLanguage,
    publicLocalizationEnabled: policy.publicLocalizationEnabled,
    supportedDisplayLanguages: policy.supportedDisplayLanguages,
    defaultDisplayMode: policy.defaultDisplayMode,
    translationPolicy: policy.translationPolicy,
    pilot,
    languageStatuses: Object.freeze(languageStatuses),
  });
}
