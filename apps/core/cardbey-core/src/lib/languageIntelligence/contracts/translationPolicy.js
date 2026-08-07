/**
 * TranslationPolicy — when translations may publish, require review, or stream immediately.
 *
 * Core rule: translation is view-layer only. Canonical fields are never overwritten.
 */

import { requiresOwnerReviewForConfidence } from './translationRecord.js';

export const CONTENT_CLASSES = Object.freeze([
  'conversation',
  'product',
  'category',
  'policy',
  'terms',
  'marketing',
  'invoice',
  'contract',
  'notification',
  'ai_response',
  'review',
  'document',
]);

/** Content classes that may translate immediately without owner publish gate. */
export const IMMEDIATE_TRANSLATE_CLASSES = Object.freeze([
  'conversation',
  'ai_response',
  'notification',
]);

/** Content classes that typically require AI draft → owner review → publish. */
export const REVIEW_REQUIRED_CLASSES = Object.freeze([
  'product',
  'policy',
  'terms',
  'marketing',
  'invoice',
  'contract',
  'document',
]);

/**
 * @typedef {Object} TranslationPolicyDecision
 * @property {boolean} mayOverwriteCanonical  Always false
 * @property {boolean} writeToTranslationsLayer
 * @property {boolean} requiresOwnerReview
 * @property {boolean} cacheable
 * @property {string} contentClass
 * @property {string} reason
 */

/**
 * @param {string} contentClass
 * @param {{ confidence?: 'high'|'medium'|'low' }} [opts]
 * @returns {TranslationPolicyDecision}
 */
export function decideTranslationPolicy(contentClass, opts = {}) {
  const cls = CONTENT_CLASSES.includes(contentClass) ? contentClass : 'document';
  const confidence = opts.confidence ?? 'medium';
  const immediate = IMMEDIATE_TRANSLATE_CLASSES.includes(cls);
  const classRequiresReview = REVIEW_REQUIRED_CLASSES.includes(cls);
  const lowConfidence = requiresOwnerReviewForConfidence(confidence);

  return Object.freeze({
    mayOverwriteCanonical: false,
    writeToTranslationsLayer: true,
    requiresOwnerReview: immediate ? lowConfidence && cls !== 'conversation' : classRequiresReview || lowConfidence,
    cacheable: !immediate || cls === 'ai_response',
    contentClass: cls,
    reason: immediate
      ? 'Immediate view-layer translation; canonical message body preserved'
      : 'Published content uses translations layer; owner review when required',
  });
}

/**
 * Cache key: entity × field × target language × source revision.
 * @param {{ entityType: string, entityId: string, field: string, targetLanguage: string, revision: string|number }} parts
 * @returns {string}
 */
export function buildTranslationCacheKey(parts) {
  return [
    String(parts.entityType ?? ''),
    String(parts.entityId ?? ''),
    String(parts.field ?? ''),
    String(parts.targetLanguage ?? ''),
    String(parts.revision ?? ''),
  ].join('::');
}
