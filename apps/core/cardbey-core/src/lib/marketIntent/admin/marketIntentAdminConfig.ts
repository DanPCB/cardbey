/**
 * Market Intent admin test UI — server-side config.
 */

export const MARKET_INTENT_ADMIN_MAX_RAW_TEXT = 12_000;

export function isMarketIntentAdminTestUiEnabled(): boolean {
  const raw = String(process.env.ENABLE_MARKET_INTENT_ADMIN_TEST_UI_V1 ?? '').trim().toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'off' || raw === 'no') return false;
  if (raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes') return true;
  return process.env.NODE_ENV !== 'production';
}
