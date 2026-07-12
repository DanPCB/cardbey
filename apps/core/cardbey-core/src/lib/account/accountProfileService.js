/**
 * AccountProfile persistence and ensure-on-read.
 */

import { getPrismaClient } from '../prisma.js';
import { inferCapabilities, toPublicAccountProfile } from './accountProfileResolver.js';
import { ACCOUNT_CAPABILITY, ACCOUNT_STATUS } from './accountProfileTypes.js';
import { appendUserAccountEvent } from './userAccountEventService.js';

const USER_INCLUDE = {
  accountProfile: true,
  creator: true,
  businesses: { select: { id: true, name: true, slug: true, isActive: true } },
};

/**
 * @param {string} userId
 */
export async function ensureAccountProfile(userId) {
  const prisma = getPrismaClient();
  let user = await prisma.user.findUnique({
    where: { id: userId },
    include: USER_INCLUDE,
  });
  if (!user) return null;

  if (!user.accountProfile) {
    const capabilities = inferCapabilities(user);
    const profile = await prisma.accountProfile.create({
      data: {
        userId,
        capabilities,
        accountStatus: ACCOUNT_STATUS.ACTIVE,
        primaryCapability: capabilities.includes(ACCOUNT_CAPABILITY.CREATOR)
          ? ACCOUNT_CAPABILITY.CREATOR
          : capabilities.includes(ACCOUNT_CAPABILITY.BUSINESS_OWNER)
            ? ACCOUNT_CAPABILITY.BUSINESS_OWNER
            : ACCOUNT_CAPABILITY.PERSONAL,
      },
    });
    user = { ...user, accountProfile: profile };
    await appendUserAccountEvent({
      userId,
      eventType: 'ACCOUNT_PROFILE_ENSURED',
      actorType: 'system',
      nextState: { capabilities, accountStatus: ACCOUNT_STATUS.ACTIVE },
    });
  }

  return toPublicAccountProfile(user, user.accountProfile);
}

/**
 * @param {string} userId
 */
export async function getAccountProfileForUser(userId) {
  const prisma = getPrismaClient();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: USER_INCLUDE,
  });
  if (!user) return null;
  if (!user.accountProfile) return ensureAccountProfile(userId);
  const syncedCaps = inferCapabilities(user);
  return toPublicAccountProfile(user, {
    ...user.accountProfile,
    capabilities: syncedCaps,
  });
}

/**
 * @param {string} userId
 * @param {string} capability
 * @param {object} context
 */
export async function addAccountCapability(userId, capability, context = {}) {
  const prisma = getPrismaClient();
  await ensureAccountProfile(userId);
  const profile = await prisma.accountProfile.findUnique({ where: { userId } });
  const current = Array.isArray(profile?.capabilities) ? [...profile.capabilities] : [];
  if (!current.includes(capability)) current.push(capability);

  const updated = await prisma.accountProfile.update({
    where: { userId },
    data: { capabilities: current },
  });

  await appendUserAccountEvent({
    userId,
    eventType: 'CAPABILITY_ADDED',
    actorUserId: context.actorUserId ?? null,
    actorRole: context.actorRole ?? null,
    reasonCode: context.reasonCode ?? null,
    internalNote: context.internalNote ?? null,
    previousState: { capabilities: profile?.capabilities },
    nextState: { capabilities: current },
  });

  return updated;
}

/**
 * @param {string} userId
 * @param {string} capability
 * @param {object} context
 */
export async function removeAccountCapability(userId, capability, context = {}) {
  const prisma = getPrismaClient();
  const profile = await prisma.accountProfile.findUnique({ where: { userId } });
  if (!profile) return null;
  const current = (Array.isArray(profile.capabilities) ? profile.capabilities : []).filter(
    (c) => c !== capability,
  );
  const updated = await prisma.accountProfile.update({
    where: { userId },
    data: { capabilities: current },
  });
  await appendUserAccountEvent({
    userId,
    eventType: 'CAPABILITY_REMOVED',
    actorUserId: context.actorUserId ?? null,
    previousState: { capabilities: profile.capabilities },
    nextState: { capabilities: current },
    internalNote: context.internalNote ?? null,
  });
  return updated;
}

export default {
  ensureAccountProfile,
  getAccountProfileForUser,
  addAccountCapability,
  removeAccountCapability,
};
