/**
 * Shared authority check for legacy direct upload routes.
 */

import { assertUiWriteAuthority } from './uiWriteAuthorityGuard.js';
import { isUploadBypassEnabled, logUploadBypassWarning } from '../runtimeUploadRollback.js';

/**
 * @param {import('express').Request} req
 * @param {{
 *   mutationType: string;
 *   route: string;
 *   userId?: string|null;
 *   missionId?: string|null;
 *   source?: string|null;
 *   deprecatedHint?: string;
 * }} meta
 */
export function assertLegacyUploadAuthority(req, meta) {
  if (meta.deprecatedHint && process.env.NODE_ENV !== 'production') {
    console.warn(`[DEPRECATED] ${meta.deprecatedHint}`);
  }
  if (isUploadBypassEnabled()) {
    logUploadBypassWarning(meta.route);
    return { ok: true, bypass: true };
  }
  return assertUiWriteAuthority(req, meta);
}
