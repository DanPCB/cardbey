export type PairSessionStatus = "showing_code" | "claimed" | "bound" | "expired";

export interface PairSessionClaimant {
  fingerprint: string;
  model?: string;
  name?: string;
}

export interface PairSession {
  sessionId: string;
  code: string;
  status: PairSessionStatus;
  expiresAt: Date;
  claimedBy?: PairSessionClaimant;
  screenId?: string;
  ttlLeftMs?: number;
  deviceJwt?: string | null;
}

export interface CreatePairSessionOptions {
  fingerprint?: string;
  model?: string;
  name?: string;
  screenId?: string;
  ttlMs?: number;
}

export interface UpdatePairSessionOptions {
  status?: PairSessionStatus;
  expiresAt?: Date;
  claimedBy?: PairSessionClaimant | null;
  screenId?: string | null;
  deviceJwt?: string | null;
}

