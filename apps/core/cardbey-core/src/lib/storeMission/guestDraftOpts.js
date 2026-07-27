/**
 * Guest draft path for build_store — ownerUserId must stay null (no User FK).
 */

export function isGuestActorId(userId) {
  return userId != null && typeof userId === 'string' && userId.trim().toLowerCase().startsWith('guest_');
}

/**
 * @param {object | null | undefined} user
 * @param {string | null | undefined} [userId]
 */
export function isGuestActor(user, userId) {
  if (user?.role === 'guest') return true;
  const uid = userId ?? user?.id;
  return isGuestActorId(uid);
}

/**
 * Spread onto createBuildStoreJob params when actor is a guest session.
 * @param {object | null | undefined} user
 * @param {string | null | undefined} [userId]
 * @returns {{ guestDraft?: { guest: true } }}
 */
export function guestDraftOptsForActor(user, userId) {
  if (!isGuestActor(user, userId)) return {};
  return { guestDraft: { guest: true } };
}
