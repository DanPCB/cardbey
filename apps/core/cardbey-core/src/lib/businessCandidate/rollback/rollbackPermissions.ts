/**
 * Discovery rollback permission guards.
 */

import { isPlatformAdmin } from '../../authorization.js';

export const PERM_ROLLBACK_DISCOVERY = 'control_center.rollback.discovery';
export const PERM_ROLLBACK_FORCE = 'control_center.rollback.force';

export type RollbackActor = {
  id: string;
  role?: string | null;
  permissions?: string[] | null;
};

export function hasRollbackDiscoveryPermission(actor: RollbackActor | null | undefined): boolean {
  if (!actor?.id) return false;
  if (isPlatformAdmin(actor)) return true;
  return Boolean(actor.permissions?.includes(PERM_ROLLBACK_DISCOVERY));
}

export function hasRollbackForcePermission(actor: RollbackActor | null | undefined): boolean {
  if (!actor?.id) return false;
  if (isPlatformAdmin(actor)) return true;
  return Boolean(actor.permissions?.includes(PERM_ROLLBACK_FORCE));
}

export function requiredPermissionsForPlan(opts: {
  needsConfirmation: boolean;
  needsForce: boolean;
}): string[] {
  const perms = [PERM_ROLLBACK_DISCOVERY];
  if (opts.needsForce) perms.push(PERM_ROLLBACK_FORCE);
  return perms;
}
