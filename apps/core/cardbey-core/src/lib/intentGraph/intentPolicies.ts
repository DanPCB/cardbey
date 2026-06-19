/**
 * Intent policies — permissions, confirmation gates, field requirements.
 */

import type { EntityContext, IntentNode, UserSessionContext } from './types.js';

export function entityHasField(entity: EntityContext, field: string): boolean {
  switch (field) {
    case 'resolvedUrl':
      return Boolean(entity.resolvedUrl);
    case 'phone':
      return Boolean(entity.phone);
    case 'email':
      return Boolean(entity.email);
    case 'entityName':
      return Boolean(entity.entityName);
    case 'imageAssetUrl':
      return Boolean(entity.imageAssetUrl);
    case 'cardbeyMatch':
      return Boolean(entity.cardbeyMatch?.storeId);
    case 'coordinates':
      return Boolean(entity.coordinates?.latitude != null && entity.coordinates?.longitude != null);
    default:
      return false;
  }
}

export function sessionHasPermission(
  session: UserSessionContext,
  permission: string,
): boolean {
  switch (permission) {
    case 'authenticated':
      return session.isAuthenticated;
    case 'business_owner':
      return session.isBusinessOwner;
    default:
      return true;
  }
}

export function evaluateIntentAvailability(
  node: IntentNode,
  entity: EntityContext,
  session: UserSessionContext,
): { available: boolean; disabledReason: string | null } {
  if (entity.entityType === 'sensitive_private' && !node.id.startsWith('explain') && node.id !== 'do_not_store' && node.id !== 'block_acquisition') {
    return { available: false, disabledReason: 'Sensitive content — acquisition blocked' };
  }

  for (const field of node.requiredFields) {
    if (!entityHasField(entity, field)) {
      return { available: false, disabledReason: `Requires ${field}` };
    }
  }

  for (const perm of node.requiredPermissions) {
    if (perm === 'business_owner' && entity.cardbeyMatch?.storeId && session.ownsMatchedStore) {
      continue;
    }
    if (!sessionHasPermission(session, perm)) {
      return {
        available: false,
        disabledReason: perm === 'authenticated' ? 'Sign in required' : 'Business owner access required',
      };
    }
  }

  if (node.id === 'create_prestore_candidate' && entity.cardbeyMatch?.storeId) {
    return { available: false, disabledReason: 'Already on Cardbey' };
  }

  if (node.id === 'order_now' && !entity.cardbeyMatch?.storeId) {
    return { available: false, disabledReason: 'Store not matched' };
  }

  return { available: true, disabledReason: null };
}

export function intentRequiresConfirmation(
  node: IntentNode,
  confirmed?: boolean,
): boolean {
  if (!node.confirmationRequired) return false;
  return confirmed !== true;
}
