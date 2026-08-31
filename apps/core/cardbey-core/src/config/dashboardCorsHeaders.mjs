/**
 * Dashboard cross-origin request headers Core CORS must allow.
 * Keep in sync with:
 * - apps/dashboard/cardbey-marketing-dashboard/src/lib/corsHeadersAllowlist.ts
 * - packages/cors-headers/index.mjs (monorepo reference)
 */
export const DASHBOARD_CORS_REQUEST_HEADERS = [
  'Content-Type',
  'Authorization',
  'Accept',
  'Accept-Language',
  'Origin',
  'Content-Length',
  'Pragma',
  'Cache-Control',
  'X-Requested-With',
  'X-Session-ID',
  'x-session-id',
  'x-maintenance-token',
  'X-Maintenance-Token',
  'x-performer-role',
  'X-Performer-Role',
  'x-performer-mode',
  'X-Performer-Mode',
  'x-cardbey-context',
  'x-cardbey-viewer-key',
  'X-Cardbey-Viewer-Key',
  'x-user-key',
  'X-User-Key',
  'x-guest-session',
  'X-Guest-Session',
  'x-locale',
  'X-Locale',
  'x-local',
  'X-Local',
  'Last-Event-ID',
  'x-assistant-token',
  'X-Assistant-Token',
  'x-request-id',
  'X-Request-ID',
  'X-Creator-Source',
];

export const DASHBOARD_CORS_REQUEST_HEADERS_VALUE =
  DASHBOARD_CORS_REQUEST_HEADERS.join(', ');
