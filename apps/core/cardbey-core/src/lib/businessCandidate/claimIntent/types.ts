/**
 * ClaimIntent — tracks conversion from discovery surfaces.
 */

export type ClaimIntentSource =
  | 'CLAIM_BUTTON'
  | 'BI_BRIEF_DOWNLOAD'
  | 'OPEN_BUSINESS_SPACE'
  | 'QR_SCAN'
  | 'SHARE_LINK';

export type ClaimIntentStatus =
  | 'started'
  | 'registered'
  | 'verification_pending'
  | 'verified'
  | 'abandoned';

export interface ClaimIntentRecord {
  id: string;
  candidateId: string | null;
  seedId: string | null;
  userId: string | null;
  email: string | null;
  source: ClaimIntentSource;
  status: ClaimIntentStatus;
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
}
