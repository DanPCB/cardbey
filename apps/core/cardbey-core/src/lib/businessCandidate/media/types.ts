/**
 * Media evidence for BusinessCandidate — provenance and license tracking.
 */

export type MediaAssetType =
  | 'logo'
  | 'hero'
  | 'product'
  | 'service'
  | 'storefront'
  | 'interior'
  | 'representative';

export type MediaSourceType =
  | 'owner_uploaded'
  | 'official_site'
  | 'provider_photo'
  | 'social'
  | 'storefront'
  | 'category_stock'
  | 'ai_generated';

export type MediaLicenseStatus = 'owner' | 'allowed' | 'needs_review' | 'unknown' | 'prohibited';

export type MediaUsageStatus = 'approved' | 'needs_review' | 'blocked';

export interface CandidateMediaAsset {
  id: string;
  candidateId: string;
  seedId: string | null;
  assetType: MediaAssetType;
  url: string;
  thumbnailUrl: string | null;
  sourceProvider: string | null;
  sourceUrl: string | null;
  sourceLabel: string | null;
  sourceType: MediaSourceType;
  matchConfidence: number;
  categoryMatchConfidence: number;
  businessSpecificConfidence: number;
  isRepresentative: boolean;
  licenseStatus: MediaLicenseStatus;
  usageStatus: MediaUsageStatus;
  evidenceJson: Record<string, unknown>;
  createdAt: string;
}

export interface SelectedCandidateMedia {
  heroImage: CandidateMediaAsset | null;
  logoImage: CandidateMediaAsset | null;
  galleryImages: CandidateMediaAsset[];
  confidenceSummary: string;
  missingMediaReasons: string[];
  representativeDisclosureRequired: boolean;
}
