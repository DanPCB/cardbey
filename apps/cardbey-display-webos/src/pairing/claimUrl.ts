/**
 * Real dashboard claim deep-link (verified in DevicesPageTable):
 * `/devices?pairCode=<code>&pairSessionId=<sessionId>`
 *
 * Also accepted on `/devices/screens`.
 * Dashboard JWT claim uses POST /api/device/complete-pairing — never from TV.
 */
export function buildDashboardClaimUrl(input: {
  dashboardBaseUrl: string;
  code: string;
  sessionId: string;
}): string {
  const base = input.dashboardBaseUrl.replace(/\/+$/, '');
  const url = new URL('/devices', `${base}/`);
  url.searchParams.set('pairCode', input.code);
  url.searchParams.set('pairSessionId', input.sessionId);
  return url.toString();
}
