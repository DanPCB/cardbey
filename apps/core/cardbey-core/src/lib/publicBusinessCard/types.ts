/**
 * Public business card foundation for pre-claim visibility.
 * These records only expose grounded public business facts.
 */

export type PublicCardStatus =
  | 'NOT_CREATED'
  | 'CARD_ELIGIBLE'
  | 'PUBLISHED_UNCLAIMED'
  | 'CORRECTION_PENDING'
  | 'WITHDRAWN'
  | 'SUPERSEDED_BY_CLAIMED_STORE';

export interface PublicCardClaimEligibility {
  eligible: boolean;
  reason: 'qa_approved' | 'verified_claimable' | 'withdrawn' | 'superseded' | 'not_eligible';
}

export interface PublicCardCoordinates {
  lat: number;
  lng: number;
}

export interface PublicSocialLink {
  platform: string;
  url: string;
}

export const PUBLIC_CARD_DISCLOSURE =
  'Public business information. This page has not yet been claimed or verified by the business.';

export interface PublicBusinessCardRecord {
  id: string;
  slug: string;
  candidateId: string;
  seedId?: string | null;
  status: PublicCardStatus;
  businessName: string;
  category: string | null;
  address: string | null;
  locality: string | null;
  countryCode: string | null;
  coordinates?: PublicCardCoordinates | null;
  publicPhone?: string | null;
  officialWebsite?: string | null;
  officialSocialLinks?: PublicSocialLink[];
  openingHours?: string | null;
  imageUrl?: string | null;
  imageSource?: string | null;
  disclosure: typeof PUBLIC_CARD_DISCLOSURE;
  claimEligibility: PublicCardClaimEligibility;
  publishedAt?: string | null;
  withdrawnAt?: string | null;
  supersededStoreId?: string | null;
  noindex: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CorrectionReportStatus = 'OPEN' | 'REVIEWED' | 'RESOLVED' | 'REJECTED';

export interface CorrectionReport {
  id: string;
  cardId: string;
  message: string;
  reporterContactRedacted: string | null;
  status: CorrectionReportStatus;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  resolutionNote?: string | null;
}

export interface PublicBusinessCardDto {
  slug: string;
  status: PublicCardStatus;
  businessName: string;
  category: string | null;
  address: string | null;
  locality: string | null;
  countryCode: string | null;
  coordinates?: PublicCardCoordinates | null;
  publicPhone?: string | null;
  officialWebsite?: string | null;
  officialSocialLinks?: PublicSocialLink[];
  openingHours?: string | null;
  imageUrl?: string | null;
  imageSource?: string | null;
  disclosure: typeof PUBLIC_CARD_DISCLOSURE;
  claimEligibility: PublicCardClaimEligibility;
  publishedAt?: string | null;
}
