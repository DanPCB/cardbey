/**
 * Platform admin account hygiene — duplicate stores and suspicious accounts.
 */

import { isPlatformAdmin } from '../authorization.js';
import { isRetiredLiveTestStore } from '../../utils/liveTestStoreDenylist.js';
import { isAbandonedGuestOwnedBusiness } from '../../utils/publicStoreVisibility.js';
import {
  normalizePublicStoreIdentityKey,
} from '../../services/publishedArtifactProjection/resolvePublicStoreList.js';

async function deleteManyIfAvailable(tx, modelName, args = {}) {
  const delegate = tx?.[modelName];
  if (!delegate?.deleteMany) return 0;
  const result = await delegate.deleteMany(args);
  return result?.count ?? 0;
}

/**
 * Remove mission/chat rows that block User delete (Mission.createdByUserId is Restrict).
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {string} userId
 */
async function purgeUserAccountDependencies(tx, userId) {
  const missions = await tx.mission.findMany({
    where: { createdByUserId: userId },
    select: { id: true },
  });
  const missionIds = missions.map((m) => m.id);

  if (missionIds.length) {
    const agentTasks = await tx.agentTask.findMany({
      where: { missionId: { in: missionIds } },
      select: { id: true },
    });
    const agentTaskIds = agentTasks.map((t) => t.id);

    if (agentTaskIds.length) {
      await deleteManyIfAvailable(tx, 'interactionFeedback', {
        where: { assignment: { taskId: { in: agentTaskIds } } },
      });
      await deleteManyIfAvailable(tx, 'assignment', { where: { taskId: { in: agentTaskIds } } });
      await deleteManyIfAvailable(tx, 'bid', { where: { taskId: { in: agentTaskIds } } });
      await deleteManyIfAvailable(tx, 'agentTask', { where: { id: { in: agentTaskIds } } });
    }

    const agentRuns = await tx.agentRun.findMany({
      where: { missionId: { in: missionIds } },
      select: { id: true },
    });
    const agentRunIds = agentRuns.map((r) => r.id);
    if (agentRunIds.length) {
      await deleteManyIfAvailable(tx, 'assignment', { where: { agentRunId: { in: agentRunIds } } });
      await deleteManyIfAvailable(tx, 'agentRun', { where: { id: { in: agentRunIds } } });
    }

    await deleteManyIfAvailable(tx, 'interactionFeedback', { where: { missionId: { in: missionIds } } });
    await deleteManyIfAvailable(tx, 'agentMessage', { where: { missionId: { in: missionIds } } });
    await deleteManyIfAvailable(tx, 'agentChatConfig', { where: { missionId: { in: missionIds } } });
    await deleteManyIfAvailable(tx, 'missionEvent', { where: { missionId: { in: missionIds } } });
    await deleteManyIfAvailable(tx, 'missionOperatorRun', { where: { missionId: { in: missionIds } } });
    await deleteManyIfAvailable(tx, 'missionContext', { where: { missionId: { in: missionIds } } });
    await deleteManyIfAvailable(tx, 'intentRequest', { where: { missionId: { in: missionIds } } });
    await deleteManyIfAvailable(tx, 'missionBlackboard', { where: { missionId: { in: missionIds } } });

    const orchestratorTasks = await tx.orchestratorTask.findMany({
      where: { OR: [{ missionId: { in: missionIds } }, { userId }] },
      select: { id: true },
    });
    const orchestratorTaskIds = orchestratorTasks.map((t) => t.id);
    if (orchestratorTaskIds.length) {
      await deleteManyIfAvailable(tx, 'agentMessage', { where: { taskId: { in: orchestratorTaskIds } } });
      await deleteManyIfAvailable(tx, 'orchestratorTask', { where: { id: { in: orchestratorTaskIds } } });
    }

    await deleteManyIfAvailable(tx, 'mission', { where: { id: { in: missionIds } } });
  }

  await deleteManyIfAvailable(tx, 'missionOperatorRun', { where: { userId } });

  const missionRuns = await tx.missionRun.findMany({
    where: { userId },
    select: { id: true },
  });
  const missionRunIds = missionRuns.map((r) => r.id);
  if (missionRunIds.length) {
    await deleteManyIfAvailable(tx, 'agentMessage', { where: { missionRunId: { in: missionRunIds } } });
    await deleteManyIfAvailable(tx, 'missionRun', { where: { id: { in: missionRunIds } } });
  }

  await deleteManyIfAvailable(tx, 'missionPipeline', { where: { createdBy: userId } });
  await deleteManyIfAvailable(tx, 'orchestratorTask', { where: { userId } });
  await deleteManyIfAvailable(tx, 'paidAiJob', { where: { userId } });
  await deleteManyIfAvailable(tx, 'draftStore', { where: { ownerUserId: userId } });
  await deleteManyIfAvailable(tx, 'chatThread', { where: { createdByUserId: userId } });
  await deleteManyIfAvailable(tx, 'conversationThread', { where: { createdByUserId: userId } });
  await deleteManyIfAvailable(tx, 'conversationSession', { where: { userId } });
  await deleteManyIfAvailable(tx, 'userIdentifier', { where: { userId } });
  await deleteManyIfAvailable(tx, 'passwordResetToken', { where: { userId } });
  await deleteManyIfAvailable(tx, 'personalMedia', { where: { userId } });
  await deleteManyIfAvailable(tx, 'demand', { where: { userId } });
  await deleteManyIfAvailable(tx, 'content', { where: { userId } });
  await deleteManyIfAvailable(tx, 'greetingCard', { where: { ownerId: userId } });
  await deleteManyIfAvailable(tx, 'card', { where: { userId } });
  await deleteManyIfAvailable(tx, 'suitcaseItem', { where: { ownerId: userId } });
  await deleteManyIfAvailable(tx, 'smartDocument', { where: { userId } });
}

const GENERIC_STORE_NAMES = new Set([
  'my business',
  'my store',
  'my cafe',
  'my shop',
  'untitled store',
  'new store',
]);

const STORE_SELECT = {
  id: true,
  name: true,
  slug: true,
  userId: true,
  isActive: true,
  publishedAt: true,
  isGuestDraft: true,
  expiresAt: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      emailVerified: true,
    },
  },
};

function isCanonicalPublicStoreSlug(slug) {
  const normalized = String(slug ?? '').toLowerCase();
  return normalized.length > 0 && !normalized.includes('-and-') && !/-\d+$/.test(normalized);
}

function pickPreferredStore(candidates) {
  if (candidates.length === 1) return candidates[0];
  const canonical = candidates.find((s) => isCanonicalPublicStoreSlug(s.slug));
  if (canonical) return canonical;
  const withoutAndSlug = candidates.find((s) => {
    const slug = String(s.slug ?? '').toLowerCase();
    return slug.length > 0 && !slug.includes('-and-');
  });
  if (withoutAndSlug) return withoutAndSlug;
  const published = candidates.find((s) => s.publishedAt != null && s.isActive !== false);
  if (published) return published;
  return candidates[0];
}

function toStoreRow(business, { recommendedKeep = false } = {}) {
  return {
    id: business.id,
    name: business.name,
    slug: business.slug,
    userId: business.userId,
    ownerEmail: business.user?.email ?? null,
    ownerDisplayName: business.user?.displayName ?? null,
    isActive: business.isActive,
    publishedAt: business.publishedAt?.toISOString?.() ?? business.publishedAt ?? null,
    isGuestDraft: business.isGuestDraft === true,
    expiresAt: business.expiresAt?.toISOString?.() ?? business.expiresAt ?? null,
    isCanonicalSlug: isCanonicalPublicStoreSlug(business.slug),
    isRetiredTestStore: isRetiredLiveTestStore(business),
    recommendedKeep,
    createdAt: business.createdAt?.toISOString?.() ?? business.createdAt ?? null,
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function listDuplicateStoreGroups(prisma) {
  const businesses = await prisma.business.findMany({
    select: STORE_SELECT,
    orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }],
  });

  const byKey = new Map();
  for (const business of businesses) {
    const key = normalizePublicStoreIdentityKey(business);
    const list = byKey.get(key) ?? [];
    list.push(business);
    byKey.set(key, list);
  }

  const groups = [];
  let duplicateStoreCount = 0;

  for (const [identityKey, members] of byKey.entries()) {
    if (members.length < 2) continue;
    const preferred = pickPreferredStore(members);
    const stores = members.map((b) =>
      toStoreRow(b, { recommendedKeep: b.id === preferred.id }),
    );
    duplicateStoreCount += members.length;
    groups.push({
      identityKey,
      storeCount: members.length,
      recommendedKeepId: preferred.id,
      stores,
    });
  }

  groups.sort((a, b) => b.storeCount - a.storeCount || a.identityKey.localeCompare(b.identityKey));

  return {
    groups,
    summary: {
      groupCount: groups.length,
      duplicateStoreCount,
      totalStoresScanned: businesses.length,
    },
  };
}

function isGuestUserId(id) {
  return typeof id === 'string' && id.trim().toLowerCase().startsWith('guest_');
}

function isGuestLocalEmail(email) {
  return typeof email === 'string' && email.toLowerCase().endsWith('@cardbey.local');
}

function collectSuspiciousReasons(user, businesses) {
  const reasons = new Set();
  const isGuest = isGuestUserId(user.id) || user.role === 'guest' || isGuestLocalEmail(user.email);

  if (isGuestUserId(user.id)) reasons.add('guest_session');
  if (user.role === 'guest') reasons.add('guest_role');
  if (isGuestLocalEmail(user.email)) reasons.add('guest_email');

  for (const biz of businesses) {
    if (isRetiredLiveTestStore(biz)) reasons.add('retired_test_store');
    if (isAbandonedGuestOwnedBusiness(biz)) reasons.add('abandoned_guest_draft');
    if (biz.isGuestDraft === true) reasons.add('guest_draft_store');
    const name = String(biz.name ?? '').trim().toLowerCase();
    if (GENERIC_STORE_NAMES.has(name)) reasons.add('generic_store_name');
  }

  if (businesses.length === 0 && isGuest && !user.emailVerified) {
    reasons.add('no_stores_unverified');
  }

  return [...reasons];
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function listSuspiciousAccounts(prisma) {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      emailVerified: true,
      createdAt: true,
      businesses: {
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
          publishedAt: true,
          isGuestDraft: true,
          expiresAt: true,
          userId: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const duplicatePayload = await listDuplicateStoreGroups(prisma);
  const nonCanonicalStoreIds = new Set();
  for (const group of duplicatePayload.groups) {
    for (const store of group.stores) {
      if (!store.recommendedKeep) nonCanonicalStoreIds.add(store.id);
    }
  }

  const accounts = [];

  for (const user of users) {
    if (isPlatformAdmin(user)) continue;

    const reasons = collectSuspiciousReasons(user, user.businesses);
    const ownsDuplicate = user.businesses.some((b) => nonCanonicalStoreIds.has(b.id));
    if (ownsDuplicate) reasons.push('duplicate_store_owner');

    if (reasons.length === 0) continue;

    accounts.push({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt?.toISOString?.() ?? user.createdAt ?? null,
      businessCount: user.businesses.length,
      reasons: [...new Set(reasons)],
      stores: user.businesses.map((b) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        isActive: b.isActive,
        publishedAt: b.publishedAt?.toISOString?.() ?? b.publishedAt ?? null,
        isGuestDraft: b.isGuestDraft === true,
        isRetiredTestStore: isRetiredLiveTestStore(b),
        isDuplicateCandidate: nonCanonicalStoreIds.has(b.id),
      })),
    });
  }

  accounts.sort((a, b) => b.reasons.length - a.reasons.length || a.email.localeCompare(b.email));

  const byReason = {};
  for (const account of accounts) {
    for (const reason of account.reasons) {
      byReason[reason] = (byReason[reason] ?? 0) + 1;
    }
  }

  return {
    accounts,
    summary: {
      total: accounts.length,
      byReason,
      usersScanned: users.length,
    },
  };
}

/**
 * Hard-delete a store and dependent rows (admin).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} storeId
 */
export async function adminDeleteStore(prisma, storeId) {
  const store = await prisma.business.findUnique({
    where: { id: storeId },
    select: { id: true, name: true, slug: true },
  });
  if (!store) {
    const err = new Error('Store not found');
    err.status = 404;
    err.code = 'not_found';
    throw err;
  }

  await prisma.$transaction(async (tx) => {
    await tx.promotionPlacement.deleteMany({ where: { storeId } }).catch(() => {});
    await tx.promotion.deleteMany({ where: { storeId } }).catch(() => {});
    await tx.smartObject.deleteMany({ where: { storeId } }).catch(() => {});
    await tx.intentOpportunity.deleteMany({ where: { storeId } }).catch(() => {});
    await tx.intentSignal.deleteMany({ where: { storeId } }).catch(() => {});
    await tx.storeOffer.deleteMany({ where: { storeId } }).catch(() => {});
    await tx.storePromo.deleteMany({ where: { storeId } }).catch(() => {});
    await tx.product.deleteMany({ where: { businessId: storeId } }).catch(() => {});
    await tx.business.delete({ where: { id: storeId } });
  });

  return store;
}

/**
 * Hard-delete a user after cleaning up stores (admin).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 * @param {{ actorUserId?: string | null }} [opts]
 */
export async function adminDeleteUser(prisma, userId, opts = {}) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      roles: true,
      businesses: { select: { id: true } },
    },
  });

  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    err.code = 'not_found';
    throw err;
  }

  if (isPlatformAdmin(user)) {
    const err = new Error('Cannot delete platform admin accounts');
    err.status = 403;
    err.code = 'forbidden_admin';
    throw err;
  }

  if (opts.actorUserId && opts.actorUserId === userId) {
    const err = new Error('Cannot delete your own account from admin console');
    err.status = 403;
    err.code = 'forbidden_self';
    throw err;
  }

  for (const biz of user.businesses) {
    await adminDeleteStore(prisma, biz.id);
  }

  await prisma.$transaction(async (tx) => {
    await purgeUserAccountDependencies(tx, userId);
    await tx.user.delete({ where: { id: userId } });
  });

  return { id: user.id, email: user.email, deletedStoreCount: user.businesses.length };
}
