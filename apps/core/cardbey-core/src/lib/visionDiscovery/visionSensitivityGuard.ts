/**
 * Block sensitive/private content from entering discovery pipeline.
 */

import type { VisionEntityType, VisionScanType } from './visionScanTypes.js';

const SENSITIVE_PATTERNS = [
  /\bpassport\b/i,
  /\bdriver'?s?\s*licen[cs]e\b/i,
  /\bnational\s+id\b/i,
  /\bmedicare\b/i,
  /\bsocial\s+security\b/i,
  /\btax\s+file\s+number\b/i,
  /\btfn\b/i,
  /\bbank\s+statement\b/i,
  /\bcredit\s+card\b/i,
  /\baccount\s+number\b/i,
  /\bmedical\s+record\b/i,
  /\bpatient\s+id\b/i,
  /\bdiagnosis\b/i,
  /\bprescription\b/i,
  /\binsurance\s+claim\b/i,
  /\bprivate\s+message\b/i,
  /\bwhatsapp\s+chat\b/i,
];

const PRIVATE_CONTACT_ONLY = new Set<VisionEntityType>(['personal_contact']);

const NON_BUSINESS_TYPES = new Set<VisionEntityType>([
  'personal_contact',
  'non_business_content',
]);

const PIPELINE_ELIGIBLE_TYPES = new Set<VisionEntityType>([
  'external_business',
  'service_organisation',
  'unknown_link',
]);

export type SensitivityResult = {
  blocked: boolean;
  ignored: boolean;
  pipelineEligible: boolean;
  reason: string | null;
};

export function assessVisionSensitivity(input: {
  entityType: VisionEntityType;
  scanType: VisionScanType;
  rawPayload?: string | null;
  detectedText?: string | null;
  isHealthRelated?: boolean;
}): SensitivityResult {
  const haystack = `${input.rawPayload ?? ''}\n${input.detectedText ?? ''}`.trim();

  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(haystack)) {
      return {
        blocked: true,
        ignored: true,
        pipelineEligible: false,
        reason: 'sensitive_document_or_private_data',
      };
    }
  }

  if (PRIVATE_CONTACT_ONLY.has(input.entityType)) {
    return {
      blocked: false,
      ignored: true,
      pipelineEligible: false,
      reason: 'personal_contact',
    };
  }

  if (NON_BUSINESS_TYPES.has(input.entityType)) {
    return {
      blocked: false,
      ignored: true,
      pipelineEligible: false,
      reason: 'non_business_content',
    };
  }

  if (input.entityType === 'product' && !haystack.match(/\b(store|shop|cafe|restaurant|brand|company|pty|ltd)\b/i)) {
    return {
      blocked: false,
      ignored: true,
      pipelineEligible: false,
      reason: 'product_without_seller_identity',
    };
  }

  if (input.scanType === 'receipt_invoice' && !input.detectedText?.includes('@')) {
    // Receipts allowed only when user explicitly uploads — still need business name signal
    const hasBusinessSignal = /\b(abn|pty|ltd|inc|store|cafe|restaurant|shop)\b/i.test(haystack);
    if (!hasBusinessSignal) {
      return {
        blocked: false,
        ignored: true,
        pipelineEligible: false,
        reason: 'receipt_without_business_context',
      };
    }
  }

  const pipelineEligible =
    PIPELINE_ELIGIBLE_TYPES.has(input.entityType) ||
    input.entityType === 'event' ||
    (input.entityType === 'product' && haystack.length > 0);

  return {
    blocked: false,
    ignored: !pipelineEligible,
    pipelineEligible,
    reason: pipelineEligible ? null : 'not_public_commercial_entity',
  };
}
