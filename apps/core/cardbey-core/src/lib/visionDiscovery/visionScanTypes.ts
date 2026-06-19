/**
 * Vision → Discovery pipeline types.
 * Vision may only create scan events and governed seeds — never live stores.
 */

export type VisionScanType =
  | 'qr'
  | 'camera_photo'
  | 'storefront_photo'
  | 'business_card'
  | 'menu_photo'
  | 'product_packaging'
  | 'poster_flyer'
  | 'website_screenshot'
  | 'uploaded_image'
  | 'social_profile'
  | 'receipt_invoice'
  | 'unknown';

export type VisionEntityType =
  | 'cardbey_store'
  | 'external_business'
  | 'service_organisation'
  | 'product'
  | 'event'
  | 'personal_contact'
  | 'unknown_link'
  | 'non_business_content';

export type VisionScanEventStatus =
  | 'scanned'
  | 'matched_existing_cardbey_store'
  | 'candidate_created'
  | 'candidate_duplicate'
  | 'candidate_needs_review'
  | 'ignored_non_business'
  | 'blocked_sensitive'
  | 'failed_extraction';

export type VisionScanEvent = {
  id: string;
  userId: string | null;
  sessionId: string | null;
  scanType: VisionScanType;
  rawPayload: string | null;
  imageAssetUrl: string | null;
  detectedText: string | null;
  detectedUrl: string | null;
  resolvedUrl: string | null;
  domain: string | null;
  entityName: string | null;
  entityType: VisionEntityType;
  category: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  confidence: number;
  cardbeyMatchId: string | null;
  discoveryCandidateId: string | null;
  businessSeedId: string | null;
  userFacingSummary: string | null;
  status: VisionScanEventStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type VisionProcessEntityInput = {
  userId?: string | null;
  sessionId?: string | null;
  scanType?: VisionScanType;
  rawPayload?: string | null;
  imageAssetUrl?: string | null;
  detectedText?: string | null;
  detectedUrl?: string | null;
  imageMetadata?: Record<string, unknown> | null;
  clientClassification?: {
    type?: string;
    title?: string;
    subtitle?: string;
    summary?: string;
    openUrl?: string | null;
    domain?: string | null;
    pageLabel?: string | null;
    isHealthRelated?: boolean;
  };
  latitude?: number | null;
  longitude?: number | null;
  autoPromote?: boolean;
};

export type VisionUserResult = {
  title: string;
  subtitle: string;
  summary: string;
  entityType: VisionEntityType;
  openUrl: string | null;
  isCardbeyStore: boolean;
  notOnCardbeyNote: string | null;
  healthDisclaimer: string | null;
  discoveryStatus: VisionScanEventStatus;
  scanEventId: string | null;
  cardbeyMatchId: string | null;
  businessSeedId: string | null;
  canSuggestToCardbey: boolean;
  discoveryMessage: string | null;
};

export type VisionScanListFilters = {
  status?: VisionScanEventStatus;
  scanType?: VisionScanType;
  limit?: number;
  since?: string;
};

/** Re-exported shape for API responses — full types in intentGraph/types.ts */
export type VisionIntentSuggestionDto = {
  intentId: string;
  label: string;
  description: string;
  confidence: number;
  riskLevel: string;
  requiresConfirmation: boolean;
  requiresAuth: boolean;
  targetRuntime: string;
  suggestedAgent: string;
  disabledReason?: string | null;
};

export type VisionProcessEntityResult = {
  ok: true;
  userResult: VisionUserResult;
  event: VisionScanEvent | null;
  entityContext: Record<string, unknown>;
  intentSuggestions: VisionIntentSuggestionDto[];
};
