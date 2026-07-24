export type PairingControllerStatus =
  | 'idle'
  | 'requesting'
  | 'polling'
  | 'completing'
  | 'approved'
  | 'expired'
  | 'failed'
  | 'cancelled';

export type PairStatusNormalized = 'pending' | 'claimed' | 'expired';

export type PairingSnapshot = {
  status: PairingControllerStatus;
  sessionId?: string;
  code?: string;
  expiresAt?: string;
  deviceId?: string;
  errorCode?: string;
  errorMessage?: string;
  lastRequestAt?: string;
  lastPollAt?: string;
  lastPollStatus?: PairStatusNormalized | 'unknown';
  completionInFlight?: boolean;
};

export function normalizePairStatus(raw: string | undefined): PairStatusNormalized | 'unknown' {
  const status = (raw || '').trim().toLowerCase();
  if (status === 'pending' || status === 'claimed' || status === 'expired') return status;
  return 'unknown';
}
