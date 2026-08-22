/**
 * In-memory OTP helpers retained for discovery claim tests + generateOtp.
 * Durable claim ownership OTP uses lib/claim/claimOtpService.js (Prisma ClaimOtp).
 */

const OTP_TTL_MS = 10 * 60 * 1000;
/** @type {Map<string, { otp: string, userId: string, expiresAt: number }>} */
const store = new Map();

export function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** @deprecated Prefer claimOtpService.initiateClaimOtp for seed claims */
export function setClaimOtp(unclaimedStoreId, userId, otp) {
  store.set(unclaimedStoreId, {
    otp,
    userId,
    expiresAt: Date.now() + OTP_TTL_MS,
  });
}

/** @deprecated Prefer claimOtpService.verifyClaimOtpCode for seed claims */
export function verifyClaimOtp(unclaimedStoreId, userId, otp) {
  const entry = store.get(unclaimedStoreId);
  if (!entry) return false;
  if (entry.userId !== userId) return false;
  if (Date.now() > entry.expiresAt) {
    store.delete(unclaimedStoreId);
    return false;
  }
  if (entry.otp !== otp) return false;
  store.delete(unclaimedStoreId);
  return true;
}

export function clearClaimOtp(unclaimedStoreId) {
  store.delete(unclaimedStoreId);
}
