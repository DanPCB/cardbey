/**
 * Grow Your Business V1 — user-facing HAS/WANT opportunity surface.
 * Fail-closed in production unless explicitly enabled.
 */

export const GROW_YOUR_BUSINESS_MAX_RAW_TEXT = 12_000;

export function isGrowYourBusinessV1Enabled(): boolean {
  const raw = String(process.env.ENABLE_GROW_YOUR_BUSINESS_V1 ?? '').trim().toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'off' || raw === 'no') return false;
  if (raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes') return true;
  return process.env.NODE_ENV !== 'production';
}
