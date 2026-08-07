import { createMarketplaceError } from '../errors.js';
import { MARKETPLACE_LISTING_STATUS } from '../types.js';

const CREATOR_TRANSITIONS = Object.freeze({
  [MARKETPLACE_LISTING_STATUS.DRAFT]: new Set([
    MARKETPLACE_LISTING_STATUS.SUBMITTED,
    MARKETPLACE_LISTING_STATUS.ARCHIVED,
  ]),
  [MARKETPLACE_LISTING_STATUS.CHANGES_REQUESTED]: new Set([MARKETPLACE_LISTING_STATUS.SUBMITTED]),
  [MARKETPLACE_LISTING_STATUS.REJECTED]: new Set([
    MARKETPLACE_LISTING_STATUS.SUBMITTED,
    MARKETPLACE_LISTING_STATUS.ARCHIVED,
  ]),
  [MARKETPLACE_LISTING_STATUS.PUBLISHED]: new Set([MARKETPLACE_LISTING_STATUS.UNPUBLISHED]),
  [MARKETPLACE_LISTING_STATUS.UNPUBLISHED]: new Set([
    MARKETPLACE_LISTING_STATUS.ARCHIVED,
  ]),
});

const ADMIN_TRANSITIONS = Object.freeze({
  [MARKETPLACE_LISTING_STATUS.SUBMITTED]: new Set([
    MARKETPLACE_LISTING_STATUS.APPROVED,
    MARKETPLACE_LISTING_STATUS.CHANGES_REQUESTED,
    MARKETPLACE_LISTING_STATUS.REJECTED,
    MARKETPLACE_LISTING_STATUS.SUSPENDED,
  ]),
  [MARKETPLACE_LISTING_STATUS.APPROVED]: new Set([
    MARKETPLACE_LISTING_STATUS.PUBLISHED,
    MARKETPLACE_LISTING_STATUS.CHANGES_REQUESTED,
    MARKETPLACE_LISTING_STATUS.REJECTED,
    MARKETPLACE_LISTING_STATUS.SUSPENDED,
  ]),
  [MARKETPLACE_LISTING_STATUS.PUBLISHED]: new Set([
    MARKETPLACE_LISTING_STATUS.UNPUBLISHED,
    MARKETPLACE_LISTING_STATUS.SUSPENDED,
  ]),
  [MARKETPLACE_LISTING_STATUS.CHANGES_REQUESTED]: new Set([
    MARKETPLACE_LISTING_STATUS.SUSPENDED,
  ]),
  [MARKETPLACE_LISTING_STATUS.UNPUBLISHED]: new Set([
    MARKETPLACE_LISTING_STATUS.PUBLISHED,
    MARKETPLACE_LISTING_STATUS.SUSPENDED,
  ]),
  [MARKETPLACE_LISTING_STATUS.SUSPENDED]: new Set([
    MARKETPLACE_LISTING_STATUS.APPROVED,
    MARKETPLACE_LISTING_STATUS.PUBLISHED,
    MARKETPLACE_LISTING_STATUS.UNPUBLISHED,
  ]),
});

const SYSTEM_TRANSITIONS = Object.freeze({
  [MARKETPLACE_LISTING_STATUS.APPROVED]: new Set([MARKETPLACE_LISTING_STATUS.SUBMITTED]),
  [MARKETPLACE_LISTING_STATUS.PUBLISHED]: new Set([MARKETPLACE_LISTING_STATUS.SUBMITTED]),
});

function getTransitionMap(actorRole) {
  const normalized = String(actorRole || '').trim().toLowerCase();
  if (normalized === 'creator') return CREATOR_TRANSITIONS;
  if (normalized === 'admin') return ADMIN_TRANSITIONS;
  if (normalized === 'system') return SYSTEM_TRANSITIONS;
  return null;
}

export function assertTransition(fromStatus, toStatus, actorRole) {
  const from = String(fromStatus || '').trim().toUpperCase();
  const to = String(toStatus || '').trim().toUpperCase();
  const transitions = getTransitionMap(actorRole);
  if (!transitions) {
    throw createMarketplaceError('invalid_transition', 'Unknown marketplace actor role.', 422);
  }
  if (from === to) return true;
  if (transitions[from]?.has(to)) return true;
  throw createMarketplaceError(
    'invalid_transition',
    `Marketplace listing transition ${from} -> ${to} is not allowed for ${actorRole}.`,
    422,
  );
}
