/**
 * Single source of truth for custom request headers the dashboard may send cross-origin.
 * Core CORS must allow every header listed here or browser preflight will fail.
 *
 * Monorepo reference copy — also mirrored in:
 * - apps/core/cardbey-core/src/config/dashboardCorsHeaders.mjs
 * - apps/dashboard/cardbey-marketing-dashboard/src/lib/corsHeadersAllowlist.ts
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
  // Performer / intake
  'X-Session-ID',
  'x-session-id',
  'x-maintenance-token',
  'X-Maintenance-Token',
  'x-performer-role',
  'X-Performer-Role',
  'x-performer-mode',
  'X-Performer-Mode',
  'x-cardbey-runtime-authority',
  'X-Cardbey-Runtime-Authority',
  // App context
  'x-cardbey-context',
  'x-cardbey-viewer-key',
  'X-Cardbey-Viewer-Key',
  'x-user-key',
  'X-User-Key',
  'x-guest-session',
  'X-Guest-Session',
  // Locale (apiFetch; stripped on prod cross-origin when possible)
  'x-locale',
  'X-Locale',
  'x-local',
  'X-Local',
  // SSE / streaming
  'Last-Event-ID',
  // Assistant / legacy auth helpers
  'x-assistant-token',
  'X-Assistant-Token',
  'x-request-id',
  'X-Request-ID',
  'X-Creator-Source',
];

export const DASHBOARD_CORS_REQUEST_HEADERS_VALUE =
  DASHBOARD_CORS_REQUEST_HEADERS.join(', ');
