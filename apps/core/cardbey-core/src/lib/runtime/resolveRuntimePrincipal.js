/**
 * Canonical runtime principal from authenticated middleware — never trust client body fields.
 */

import { getTenantId } from '../missionAccess.js';

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/**
 * @param {import('express').Request} req
 * @returns {{
 *   kind: 'authenticated';
 *   userId: string;
 *   accountId?: string;
 *   authSource: 'cookie' | 'bearer' | 'dev';
 *   authenticated: true;
 * } | {
 *   kind: 'anonymous';
 *   anonymousSessionId: string;
 *   authenticated: false;
 * }}
 */
export function resolveRuntimePrincipal(req) {
  const userId = pickString(req.user?.id, req.userId);
  const isGuest =
    req.isGuest === true ||
    req.user?.role === 'guest' ||
    req.user?.auth === 'guest' ||
    req.user?.isGuest === true;

  if (userId && !isGuest) {
    const authSource = req.cookies?.accessToken
      ? 'cookie'
      : req.user?.isDevAdmin
        ? 'dev'
        : 'bearer';
    return {
      kind: 'authenticated',
      userId,
      accountId: pickString(req.user?.tenantId, getTenantId(req.user), userId) || undefined,
      authSource,
      authenticated: true,
    };
  }

  const anonymousSessionId = pickString(
    req.guestId,
    req.guest?.id,
    isGuest ? userId : null,
    req.guestSessionId ? `guest_${req.guestSessionId}` : null,
  );

  return {
    kind: 'anonymous',
    anonymousSessionId: anonymousSessionId || 'anonymous',
    authenticated: false,
  };
}

/**
 * @param {import('express').Request} req
 */
export function isAuthenticatedRuntimePrincipal(req) {
  return resolveRuntimePrincipal(req).kind === 'authenticated';
}

/**
 * Structured diagnostics — never log tokens or cookies.
 * @param {import('express').Request} req
 * @param {Record<string, unknown>} [extra]
 */
export function buildRuntimeAuthDiagnostics(req, extra = {}) {
  const principal = resolveRuntimePrincipal(req);
  return {
    userIdPresent: principal.kind === 'authenticated' ? Boolean(principal.userId) : false,
    authenticated: principal.kind === 'authenticated',
    authSource: principal.kind === 'authenticated' ? principal.authSource : 'anonymous',
    accountId: principal.kind === 'authenticated' ? principal.accountId ?? null : null,
    principalKind: principal.kind,
    ...extra,
  };
}
