/**
 * Stable actor + tenant keys for Intake V2 preview scoping (user or guest).
 */

import { getTenantId } from '../missionAccess.js';

/** @param {import('express').Request} req */
export function resolveIntakeV2ActorKey(req) {
  if (req.user?.id) return `u:${req.user.id}`;
  const gid = req.guestId ?? (req.isGuest ? req.userId : null);
  if (gid) return `g:${gid}`;
  return null;
}

/** @param {import('express').Request} req */
export function resolveIntakeV2TenantKey(req) {
  const tid = getTenantId(req.user);
  if (tid) return `t:${tid}`;
  const gid = req.guestId ?? (req.isGuest ? req.userId : null);
  if (gid) return `g:${gid}`;
  return 'unknown';
}
