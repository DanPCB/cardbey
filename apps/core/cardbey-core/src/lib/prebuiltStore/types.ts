/**
 * Prebuilt store draft contracts for unclaimed public business cards.
 * Drafts remain private until claim verification completes.
 */

export type EvidenceClass =
  | 'SOURCE_CONFIRMED'
  | 'SOURCE_INCOMPLETE'
  | 'AI_SUGGESTED'
  | 'CONFLICTING'
  | 'BLOCKED';

export type PrebuiltDraftStatus =
  | 'GENERATING'
  | 'READY_FOR_REVIEW'
  | 'BLOCKED'
  | 'CLAIM_STARTED'
  | 'CLAIM_VERIFIED'
  | 'CONVERTED'
  | 'EXPIRED'
  | 'WITHDRAWN';

export interface PrebuiltFieldEvidence {
  id: string;
  fieldPath: string;
  evidenceClass: EvidenceClass;
  source: string;
  valueSummary: string | null;
  ownerAccepted?: boolean;
  blockedReason?: string | null;
  conflictSummary?: string | null;
  updatedAt: string;
}

export interface PrebuiltOfferingDraft {
  id: string;
  title: string;
  description?: string | null;
  priceText?: string | null;
  evidenceClass: EvidenceClass;
  ownerAccepted?: boolean;
  source: string;
  included: boolean;
}

export interface PrebuiltAssetDraft {
  id: string;
  kind: 'hero' | 'logo' | 'gallery' | 'social';
  url: string;
  source: string;
  evidenceClass: EvidenceClass;
  ownerAccepted?: boolean;
  altText?: string | null;
  isPrimary?: boolean;
}

export interface PrebuiltStoreDraft {
  id: string;
  candidateId: string;
  cardId?: string | null;
  seedId?: string | null;
  status: PrebuiltDraftStatus;
  businessName: string;
  slug: string;
  category: string | null;
  address: string | null;
  locality: string | null;
  countryCode: string | null;
  publicPhone?: string | null;
  officialWebsite?: string | null;
  officialSocialLinks?: Array<{ platform: string; url: string }>;
  openingHours?: string | null;
  description?: string | null;
  offerings: PrebuiltOfferingDraft[];
  assets: PrebuiltAssetDraft[];
  fieldEvidence: PrebuiltFieldEvidence[];
  publicFeedExcluded: boolean;
  claimStartedAt?: string | null;
  claimVerifiedAt?: string | null;
  convertedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PreviewTokenRecord {
  id: string;
  draftId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ClaimAuthorityProofType = 'email_domain' | 'dns' | 'document' | 'manual_review';

export interface ClaimConversionRecord {
  id: string;
  candidateId: string | null;
  cardId: string | null;
  draftId: string | null;
  claimTokenHash: string;
  claimantId: string | null;
  proofType: ClaimAuthorityProofType | null;
  verified: boolean;
  verifiedAt?: string | null;
  convertedAt?: string | null;
  status: 'INITIATED' | 'VERIFIED' | 'CONVERTED' | 'REJECTED';
  conversionPlan?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversionPlan {
  mode: 'stub';
  draftId: string;
  candidateId: string;
  slug: string;
  businessName: string;
  category: string | null;
  claimVerified: true;
  acceptedFields: Record<string, unknown>;
  acceptedOfferings: Array<{
    id: string;
    title: string;
    description?: string | null;
    priceText?: string | null;
    source: string;
  }>;
  acceptedAssets: Array<{
    id: string;
    kind: string;
    url: string;
    source: string;
  }>;
  createdAt: string;
}
