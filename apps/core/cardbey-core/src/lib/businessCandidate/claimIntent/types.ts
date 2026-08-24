/**
 * ClaimIntent — tracks conversion from discovery surfaces.
 */

export type ClaimIntentSource =
  | 'CLAIM_BUTTON'
  | 'BI_BRIEF_DOWNLOAD'
  | 'BI_REPORT_DOWNLOAD'
  | 'OPEN_BUSINESS_SPACE'
  | 'FEED_MODAL'
  | 'QR_SCAN'
  | 'SHARE_LINK'
  | 'ACTIVATE_BUSINESS_LEGACY_REDIRECT';

export type ClaimIntentStatus =
  | 'started'
  | 'registered'
  | 'verification_pending'
  | 'verified'
  | 'abandoned'
  | 'abandoned_rollback';

export interface ClaimIntentRecord {
  id: string;
  candidateId: string | null;
  seedId: string | null;
  businessSlug?: string | null;
  evaluationId?: string | null;
  graphId?: string | null;
  userId: string | null;
  email: string | null;
  source: ClaimIntentSource;
  status: ClaimIntentStatus;
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
}
