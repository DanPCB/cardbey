/**
 * UI Write Authority Guard — Sprint 2.
 * State-changing UI mutations must arrive via Performer Runtime (ui-action) or carry authority context.
 * Storage-only uploads (POST /api/uploads/create) are exempt.
 */

import {
  assertRuntimeAuthorityContext,
  recordRuntimeAuthorityBypass,
  recordRuntimeAuthorityPathUsed,
} from './runtimeAuthorityGuard.js';

export const UI_RUNTIME_AUTHORITY_HEADER = 'x-cardbey-runtime-authority';
export const UI_RUNTIME_INTERNAL_BYPASS = Symbol.for('cardbey.uiRuntimeInternalBypass');

/**
 * @param {import('express').Request} req
 * @returns {boolean}
 */
export function hasUiRuntimeAuthorityContext(req) {
  if (!req || typeof req !== 'object') return false;
  if (req[UI_RUNTIME_INTERNAL_BYPASS] === true) return true;

  const header = req.headers?.[UI_RUNTIME_AUTHORITY_HEADER];
  if (header === '1' || header === 'true') return true;

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const ctx = body.runtimeAuthorityContext ?? body.runtimeContext;
  if (ctx && typeof ctx === 'object') {
    const missionId = ctx.missionId ?? ctx.activeMissionId;
    if (missionId && String(missionId).trim()) return true;
  }

  return false;
}

/**
 * Mark request as internal adapter call (ui-runtime-action handler → legacy route).
 *
 * @param {import('express').Request} req
 */
export function markUiRuntimeInternalBypass(req) {
  if (req && typeof req === 'object') {
    req[UI_RUNTIME_INTERNAL_BYPASS] = true;
  }
}

/**
 * @param {import('express').Request} req
 * @param {{
 *   mutationType: string;
 *   route: string;
 *   userId?: string|null;
 *   missionId?: string|null;
 *   source?: string|null;
 * }} meta
 */
export function assertUiWriteAuthority(req, meta = {}) {
  const mutationType = meta.mutationType ?? 'unknown';
  const route = meta.route ?? req?.originalUrl ?? 'unknown';

  if (hasUiRuntimeAuthorityContext(req)) {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const ctx = body.runtimeAuthorityContext ?? body.runtimeContext ?? {};
    const missionId =
      meta.missionId ??
      (typeof ctx.missionId === 'string' ? ctx.missionId : null) ??
      (typeof ctx.activeMissionId === 'string' ? ctx.activeMissionId : null);

    recordRuntimeAuthorityPathUsed({
      route,
      toolName: mutationType,
      userId: meta.userId ?? req.userId ?? req.user?.id ?? null,
      missionId,
      source: meta.source ?? 'ui_runtime',
    });
    return { ok: true, authorized: true };
  }

  recordRuntimeAuthorityBypass({
    caller: 'ui_direct_write',
    toolName: mutationType,
    route,
    userId: meta.userId ?? req.userId ?? req.user?.id ?? null,
    missionId: meta.missionId ?? null,
  });

  const message = `RUNTIME_AUTHORITY_BYPASS: UI direct write (${mutationType}) without runtime authority`;

  if (process.env.NODE_ENV === 'development') {
    const err = new Error(message);
    err.code = 'RUNTIME_AUTHORITY_BYPASS';
    throw err;
  }

  if (process.env.NODE_ENV !== 'test') {
    console.warn(`[UiWriteAuthorityGuard] ${message}`, { route, mutationType });
  }

  return { ok: false, warned: true, authorized: false };
}

/**
 * Storage intake only — no state mutation after upload.
 *
 * @param {string} path
 * @returns {boolean}
 */
export function isStorageOnlyUploadPath(path) {
  const p = String(path ?? '').toLowerCase();
  if (p.includes('/api/uploads/create')) return true;
  if (p.includes('/api/upload') && !p.includes('/upload/hero') && !p.includes('/upload/logo') && !p.includes('/upload/avatar')) {
    return true;
  }
  return false;
}

/**
 * State-changing upload — requires runtime authority when attached to hero/playlist/campaign.
 *
 * @param {string} path
 * @returns {boolean}
 */
export function isStateChangingUploadPath(path) {
  const p = String(path ?? '').toLowerCase();
  return (
    p.includes('/upload/hero') ||
    p.includes('/upload/logo') ||
    p.includes('/upload/avatar') ||
    p.includes('/draft/hero') ||
    p.includes('/contents/video/render') ||
    p.includes('/signage') && p.includes('/publish')
  );
}

export { assertRuntimeAuthorityContext };
