/**
 * Resolve canonical identity from User with Creator fallback.
 */

import {
  ACCOUNT_CAPABILITY,
  ACCOUNT_STATUS,
  ADMIN_PLATFORM_ROLES,
} from './accountProfileTypes.js';

/**
 * @param {object|null} user
 * @param {object|null} creator
 */
export function resolveCanonicalIdentity(user, creator = null) {
  if (!user) return null;
  return {
    userId: user.id,
    displayName: user.displayName ?? user.fullName ?? creator?.displayName ?? null,
    username: user.handle ?? null,
    creatorHandle: creator?.username ?? null,
    avatarUrl: user.profilePhoto ?? user.avatarUrl ?? creator?.avatar ?? null,
    bannerUrl: creator?.banner ?? null,
    bio: user.bio ?? user.tagline ?? creator?.bio ?? null,
    country: user.country ?? creator?.country ?? null,
    languages: Array.isArray(user.accountProfile?.languages)
      ? user.accountProfile.languages
      : Array.isArray(creator?.languages)
        ? creator.languages
        : [],
  };
}

/**
 * @param {object} user - with businesses, creator, role, accountProfile
 */
export function inferCapabilities(user) {
  const caps = new Set([ACCOUNT_CAPABILITY.PERSONAL]);
  if (ADMIN_PLATFORM_ROLES.has(user.role) || String(user.roles || '').includes('admin')) {
    caps.add(ACCOUNT_CAPABILITY.ADMIN);
  }
  if (user.role === 'staff') caps.add(ACCOUNT_CAPABILITY.BUSINESS_STAFF);
  const businessCount = Array.isArray(user.businesses) ? user.businesses.length : 0;
  if (businessCount > 0 || user.hasBusiness) caps.add(ACCOUNT_CAPABILITY.BUSINESS_OWNER);
  if (user.creator && user.creator.creatorStatus !== 'deleted') {
    caps.add(ACCOUNT_CAPABILITY.CREATOR);
    if (user.creator.isQualified) caps.add('CREATOR_QUALIFIED');
  }
  const stored = user.accountProfile?.capabilities;
  if (Array.isArray(stored)) {
    for (const cap of stored) caps.add(String(cap));
  }
  return [...caps];
}

/**
 * @param {object} user
 * @param {object|null} profile
 */
export function toPublicAccountProfile(user, profile = null) {
  const identity = resolveCanonicalIdentity(user, user.creator ?? null);
  const capabilities = inferCapabilities({ ...user, accountProfile: profile ?? user.accountProfile });
  let primaryCapability = profile?.primaryCapability ?? null;
  if (!primaryCapability) {
    if (capabilities.includes(ACCOUNT_CAPABILITY.ADMIN)) primaryCapability = ACCOUNT_CAPABILITY.ADMIN;
    else if (
      capabilities.includes(ACCOUNT_CAPABILITY.BUSINESS_OWNER) &&
      capabilities.includes(ACCOUNT_CAPABILITY.CREATOR)
    ) {
      primaryCapability = ACCOUNT_CAPABILITY.CREATOR;
    } else if (capabilities.includes(ACCOUNT_CAPABILITY.BUSINESS_OWNER)) {
      primaryCapability = ACCOUNT_CAPABILITY.BUSINESS_OWNER;
    } else if (capabilities.includes(ACCOUNT_CAPABILITY.CREATOR)) {
      primaryCapability = ACCOUNT_CAPABILITY.CREATOR;
    } else {
      primaryCapability = ACCOUNT_CAPABILITY.PERSONAL;
    }
  }
  return {
    id: profile?.id ?? `user:${user.id}`,
    userId: user.id,
    email: user.email,
    emailVerified: Boolean(user.emailVerified),
    ...identity,
    capabilities,
    primaryCapability,
    accountStatus: profile?.accountStatus ?? ACCOUNT_STATUS.ACTIVE,
    creatorPublishingRestricted: Boolean(profile?.creatorPublishingRestricted),
    businessManagementRestricted: Boolean(profile?.businessManagementRestricted),
    businessSpaceCount: Array.isArray(user.businesses) ? user.businesses.length : 0,
    creator: user.creator
      ? {
          creatorId: user.creator.id,
          username: user.creator.username,
          status: user.creator.creatorStatus,
          isQualified: user.creator.isQualified,
          totalPublishedMinutes: user.creator.totalPublishedMinutes,
        }
      : null,
    joinedAt: user.createdAt,
    lastActiveAt: profile?.lastActiveAt ?? user.updatedAt,
    createdAt: profile?.createdAt ?? user.createdAt,
    updatedAt: profile?.updatedAt ?? user.updatedAt,
  };
}

export default { resolveCanonicalIdentity, inferCapabilities, toPublicAccountProfile };
