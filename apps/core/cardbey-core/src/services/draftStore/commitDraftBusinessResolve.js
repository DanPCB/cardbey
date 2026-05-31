/**
 * Idempotent Business row resolution for commitDraft (parallel missions / legacy userId unique).
 * Preflight reads run outside the interactive transaction; recovery never queries inside an aborted tx.
 */

import { isMultiStoreIdentityV1Enabled, logStoreIdentity } from '../store/storeIdentity.js';

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

export function isAbortedTransactionError(err) {
  const code = err?.code || err?.meta?.code;
  return code === '25P02' || /current transaction is aborted/i.test(String(err?.message ?? ''));
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
 * Resolve which business row to use — all reads on prisma, safe before/after transactions.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {Parameters<typeof resolveBusinessForDraftCommit>[1]} ctx
 * @returns {Promise<{ action: 'update' | 'create'; businessId?: string; path: string }>}
 */
export async function preflightBusinessCommitPlan(prisma, ctx) {
  const { user, draft, businessFields = {}, writeMode } = ctx;
  const uid = user.id;
  const logBase = {
    ...resolveCommitLogContext(businessFields, draft),
    userId: uid,
    draftStoreId: draft.id,
    writeMode: writeMode.mode,
    writeReason: writeMode.reason ?? null,
  };

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
    logCommitDraftStructured('preflight', { ...logBase, path: 'explicit_update', businessId: existingRow.id });
    return { action: 'update', businessId: existingRow.id, path: 'explicit_update' };
  }

  const draftCommitted = str(draft.committedStoreId);
  if (draftCommitted) {
    const row = await prisma.business.findFirst({
      where: { id: draftCommitted, userId: uid },
      select: { id: true },
    });
    if (row) {
      logCommitDraftStructured('preflight', { ...logBase, path: 'draft_committed_store_id', businessId: row.id });
      return { action: 'update', businessId: row.id, path: 'draft_committed_store_id' };
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
      logCommitDraftStructured('preflight', { ...logBase, path: 'explicit_target_store', businessId: row.id });
      return { action: 'update', businessId: row.id, path: 'explicit_target_store' };
    }
  }

  const multiStore = isMultiStoreIdentityV1Enabled();
  if (!multiStore) {
    const owned = await prisma.business.findFirst({
      where: { userId: uid },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    if (owned) {
      logCommitDraftStructured('preflight', { ...logBase, path: 'reuse_owned_singleton', businessId: owned.id });
      return { action: 'update', businessId: owned.id, path: 'reuse_owned_singleton' };
    }
  }

  logCommitDraftStructured('preflight', { ...logBase, path: multiStore ? 'create_multi_store' : 'create_first_business' });
  return { action: 'create', path: multiStore ? 'create_multi_store' : 'create_first_business' };
}

/**
 * Apply preflight plan inside a clean transaction (no in-tx recovery after failed writes).
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {{ action: 'update' | 'create'; businessId?: string; path: string }} plan
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
  };

  if (plan.action === 'update' && plan.businessId) {
    const slug = await generateUniqueStoreSlugForTx(tx, businessName, plan.businessId);
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
    logCommitDraftStructured('business_commit', { ...logBase, businessId: business.id, slug });
    return business;
  }

  const slug = await generateUniqueStoreSlugForTx(tx, businessName);
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
  logCommitDraftStructured('business_commit', { ...logBase, businessId: business.id, slug });
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
