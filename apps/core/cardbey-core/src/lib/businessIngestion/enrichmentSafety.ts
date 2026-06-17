/**
 * Business Enrichment Agent V2.2 — safety gates for factual suggestions only.
 */

import type { EnrichmentCandidateField, EnrichmentPermissionType } from './types.js';

const BLOCKED_FIELD_PATTERNS = [
  /review/i,
  /rating/i,
  /competitor/i,
  /copyright/i,
  /testimonial/i,
  /ugc/i,
];

const ALLOWED_FIELDS = new Set<EnrichmentCandidateField>([
  'description',
  'hero_image',
  'logo',
  'category',
  'opening_hours',
  'social_links',
  'services',
]);

const MAX_DESCRIPTION_LENGTH = 500;

export function isAllowedEnrichmentField(field: string): field is EnrichmentCandidateField {
  return ALLOWED_FIELDS.has(field as EnrichmentCandidateField);
}

export function isUnsafeEnrichmentField(field: string): boolean {
  return BLOCKED_FIELD_PATTERNS.some((re) => re.test(field));
}

export function sanitizeEnrichmentText(value: string, maxLen = MAX_DESCRIPTION_LENGTH): string | null {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;
  if (BLOCKED_FIELD_PATTERNS.some((re) => re.test(trimmed))) return null;
  return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen - 1)}…` : trimmed;
}

export function validateEnrichmentCandidateInput(input: {
  field: string;
  value: string;
  sourceUrl: string;
  confidence: number;
  permissionType: EnrichmentPermissionType;
}): { ok: boolean; message: string } {
  if (!isAllowedEnrichmentField(input.field)) {
    return { ok: false, message: `Field not allowed for enrichment: ${input.field}` };
  }
  if (isUnsafeEnrichmentField(input.field)) {
    return { ok: false, message: 'Unsafe enrichment field rejected.' };
  }
  if (!input.sourceUrl?.trim()) {
    return { ok: false, message: 'sourceUrl is required for provenance.' };
  }
  if (!input.value?.trim()) {
    return { ok: false, message: 'value is required.' };
  }
  if (input.confidence < 0 || input.confidence > 1) {
    return { ok: false, message: 'confidence must be between 0 and 1.' };
  }
  if (input.field === 'description') {
    const safe = sanitizeEnrichmentText(input.value);
    if (!safe) return { ok: false, message: 'Description failed safety checks.' };
  }
  return { ok: true, message: 'OK' };
}

export const LOW_CONFIDENCE_THRESHOLD = 0.55;
