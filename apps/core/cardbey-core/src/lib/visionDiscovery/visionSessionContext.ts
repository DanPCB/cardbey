/**
 * User session context for vision intent policies.
 */

import type { UserSessionContext } from '../intentGraph/types.js';

export function buildUserSessionContext(input: {
  userId?: string | null;
  sessionId?: string | null;
  ownsMatchedStore?: boolean;
}): UserSessionContext {
  const userId = input.userId ?? null;
  return {
    userId,
    sessionId: input.sessionId ?? null,
    isAuthenticated: Boolean(userId && !String(userId).startsWith('guest')),
    isBusinessOwner: input.ownsMatchedStore === true,
    ownsMatchedStore: input.ownsMatchedStore === true,
  };
}
