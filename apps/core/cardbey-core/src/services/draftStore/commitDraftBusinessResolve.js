/**
 * Idempotent Business row resolution for commitDraft (parallel missions / legacy userId unique).
 * Preflight reads run outside the interactive transaction; recovery never queries inside an aborted tx.
 */

import { generateUniqueStoreSlug, slugify } from '../../utils/slug.js';
import {
  isLegacyBusinessUserIdUniqueEnabled,
  isMultiStoreIdentityV1Enabled,
  logStoreIdentity,
} from '../store/storeIdentity.js';

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function p2002Targets(err) {
  const t = err?.meta?.target;
  return Array.isArray(t) ? t.map((x) => String(x)) : [];
}

export function isUserIdUniqueViolation(err) {
  if (err?.code !== 'P2002') return false;
  const targets = p2002Targets(err);
  return targets.includes('userId') || targets.some((t) => /userId/i.test(t));
}

export function isSlugUniqueViolation(err) {
  if (err?.code !== 'P2002') return false;
  const targets = p2002Targets(err);
  return targets.includes('slug') || targets.some((t) => /slug/i.test(t));
}

export function isAbortedTransactionError(err) {
  const code = err?.code || err?.meta?.code;
  return code === '25P02' || /current transaction is aborted/i.test(String(err?.message ?? ''));
}

export function isCommitBusinessRetryableError(err) {
  return (
    isUserIdUniqueViolation(err) ||
    isSlugUniqueViolation(err) ||
    isAbortedTransactionError(err)
  );
}

/**
 * @param {object} businessFields
 * @param {{ id?: string, committedStoreId?: string | null, input?: unknown }} draft
 */
export function resolveCommitLogContext(businessFields, draft) {
  const input =
    draft?.input && typeof draft.input === 'object'
      ? draft.input
      : typeof draft.input === 'string'
        ? (() => {
            try {
              return JSON.parse(draft.input);
            } catch {
              return {};
            }
          })()
        : {};
  const missionId =
    str(businessFields?.missionId) ||
    str(businessFields?.pipelineMissionId) ||
    str(input?.missionId) ||
    str(input?.pipelineMissionId) ||
    null;
  return {
    missionId,
    draftStoreId: str(draft?.id) || null,
    userId: str(businessFields?.userId) || null,
  };
}

export function logCommitDraftStructured(event, fields = {}) {
  console.log('[commitDraft]', JSON.stringify({ event, transactionPath: 'phase_b_catalog_shell', ...fields }));
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} businessName
 * @param {string} userId
 * @param {string | null} excludeBusinessId
 * @param {boolean} forceRegenerate
 */
async function resolvePlannedSlugForCommit(prisma, businessName, userId, excludeBusinessId, forceRegenerate) {
  const intendedSlug = slugify(businessName) || 'store';
  if (forceRegenerate) {
    const finalSlug = await generateUniqueStoreSlug(prisma, businessName);
    return { intendedSlug, finalSlug };
  }
  const bySlug = await prisma.business.findUnique({
    where: { slug: intendedSlug },
    select: { id: true, userId: true },
  });
  if (bySlug) {
    if (bySlug.userId === userId && (!excludeBusinessId || bySlug.id === excludeBusinessId)) {
      return { intendedSlug, finalSlug: intendedSlug };
    }
    const finalSlug = await generateUniqueStoreSlug(prisma, businessName);
    return { intendedSlug, finalSlug };
  }
  return { intendedSlug, finalSlug: intendedSlug };
}

/**
 * Resolve which business row to use — all reads on prisma, safe before/after transactions.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {Parameters<typeof resolveBusinessForDraftCommit>[1]} ctx
 * @returns {Promise<{ action: 'update' | 'create'; businessId?: string; path: string; intendedSlug?: string; finalSlug?: string }>}
 */
export async function preflightBusinessCommitPlan(prisma, ctx) {
  const { user, draft, businessFields = {}, writeMode, preflightOptions = {} } = ctx;
  const uid = user.id;
  const businessName = ctx.businessName || businessFields?.name || 'Store';
  const logBase = {
    ...resolveCommitLogContext(businessFields, draft),
    userId: uid,
    draftStoreId: draft.id,
    writeMode: writeMode.mode,
    writeReason: writeMode.reason ?? null,
  };

  const multiStore = isMultiStoreIdentityV1Enabled();
  const legacyUserIdUnique = isLegacyBusinessUserIdUniqueEnabled();

  if (writeMode.mode === 'update' && writeMode.storeId) {
    const existingRow = await prisma.business.findFirst({
      where: { id: writeMode.storeId, userId: uid },
      select: { id: true },
    });
    if (!existingRow) {
      throw new Error(
        `COMMIT_DRAFT_FAILED: Cannot update store ${writeMode.storeId} — not found or not owned by user`,
      );
    }
    const { intendedSlug, finalSlug } = await resolvePlannedSlugForCommit(
      prisma,
      businessName,
      uid,
      existingRow.id,
      preflightOptions.forceRegenerateSlug,
    );
    logCommitDraftStructured('preflight', {
      ...logBase,
      path: 'explicit_update',
      businessId: existingRow.id,
      intendedSlug,
      finalSlug,
    });
    return { action: 'update', businessId: existingRow.id, path: 'explicit_update', intendedSlug, finalSlug };
  }

  const draftCommitted = str(draft.committedStoreId);
  if (draftCommitted) {
    const row = await prisma.business.findFirst({
      where: { id: draftCommitted, userId: uid },
      select: { id: true },
    });
    if (row) {
      const { intendedSlug, finalSlug } = await resolvePlannedSlugForCommit(
        prisma,
        businessName,
        uid,
        row.id,
        preflightOptions.forceRegenerateSlug,
      );
      logCommitDraftStructured('preflight', {
        ...logBase,
        path: 'draft_committed_store_id',
        businessId: row.id,
        intendedSlug,
        finalSlug,
      });
      return { action: 'update', businessId: row.id, path: 'draft_committed_store_id', intendedSlug, finalSlug };
    }
  }

  const explicitTarget =
    str(businessFields?.targetStoreId) || str(businessFields?.existingStoreId) || null;
  if (explicitTarget) {
    const row = await prisma.business.findFirst({
      where: { id: explicitTarget, userId: uid },
      select: { id: true },
    });
    if (row) {
      const { intendedSlug, finalSlug } = await resolvePlannedSlugForCommit(
        prisma,
        businessName,
        uid,
        row.id,
        preflightOptions.forceRegenerateSlug,
      );
      logCommitDraftStructured('preflight', {
        ...logBase,
        path: 'explicit_target_store',
        businessId: row.id,
        intendedSlug,
        finalSlug,
      });
      return { action: 'update', businessId: row.id, path: 'explicit_target_store', intendedSlug, finalSlug };
    }
  }

  const owned = await prisma.business.findFirst({
    where: { userId: uid },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, slug: true },
  });

  if (owned && (preflightOptions.preferOwnedBusiness || legacyUserIdUnique || !multiStore)) {
    logCommitDraftStructured('preflight', {
      ...logBase,
      path: legacyUserIdUnique ? 'legacy_user_id_unique_reuse' : 'reuse_owned_singleton',
      businessId: owned.id,
      intendedSlug: owned.slug,
      finalSlug: owned.slug,
    });
    return {
      action: 'update',
      businessId: owned.id,
      path: legacyUserIdUnique ? 'legacy_user_id_unique_reuse' : 'reuse_owned_singleton',
      intendedSlug: owned.slug,
      finalSlug: owned.slug,
    };
  }

  const { intendedSlug, finalSlug } = await resolvePlannedSlugForCommit(
    prisma,
    businessName,
    uid,
    null,
    preflightOptions.forceRegenerateSlug,
  );

  logCommitDraftStructured('preflight', {
    ...logBase,
    path: multiStore ? 'create_multi_store' : 'create_first_business',
    intendedSlug,
    finalSlug,
  });
  return {
    action: 'create',
    path: multiStore ? 'create_multi_store' : 'create_first_business',
    intendedSlug,
    finalSlug,
  };
}

/**
 * Apply preflight plan inside a clean transaction (no in-tx recovery after failed writes).
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {{ action: 'update' | 'create'; businessId?: string; path: string; finalSlug?: string }} plan
 * @param {Parameters<typeof resolveBusinessForDraftCommit>[1]} ctx
 */
export async function executeBusinessCommitPlan(tx, plan, ctx) {
  const { user, draft, businessPayload, businessName, businessFields = {}, generateUniqueStoreSlugForTx } = ctx;
  const uid = user.id;
  const logBase = {
    ...resolveCommitLogContext(businessFields, draft),
    userId: uid,
    draftStoreId: draft.id,
    path: plan.path,
    intendedSlug: plan.intendedSlug ?? null,
    finalSlug: plan.finalSlug ?? null,
  };

  if (plan.action === 'update' && plan.businessId) {
    const slug =
      plan.finalSlug ??
      (await generateUniqueStoreSlugForTx(tx, businessName, plan.businessId));
    const business = await tx.business.update({
      where: { id: plan.businessId },
      data: { ...businessPayload, slug },
    });
    logStoreIdentity('STORE_IDENTITY_COMMIT_UPDATE', {
      draftId: draft.id,
      storeId: business.id,
      mode: 'update',
      reason: plan.path,
      ownerId: uid,
    });
    logCommitDraftStructured('business_commit', { ...logBase, businessId: business.id, slug: business.slug });
    return business;
  }

  const slug =
    plan.finalSlug ?? (await generateUniqueStoreSlugForTx(tx, businessName));
  const business = await tx.business.create({
    data: { userId: uid, slug, ...businessPayload },
  });
  logStoreIdentity('STORE_IDENTITY_COMMIT_CREATE', {
    draftId: draft.id,
    storeId: business.id,
    mode: 'create',
    reason: plan.path,
    ownerId: uid,
  });
  logCommitDraftStructured('business_commit', { ...logBase, businessId: business.id, slug: business.slug });
  return business;
}

/**
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {Parameters<typeof preflightBusinessCommitPlan>[1] & { prismaClient: import('@prisma/client').PrismaClient }} ctx
 */
export async function resolveBusinessForDraftCommit(tx, ctx) {
  if (!ctx.prismaClient) {
    throw new Error('COMMIT_DRAFT_FAILED: prismaClient required for business preflight');
  }
  const plan = await preflightBusinessCommitPlan(ctx.prismaClient, ctx);
  return executeBusinessCommitPlan(tx, plan, ctx);
}
