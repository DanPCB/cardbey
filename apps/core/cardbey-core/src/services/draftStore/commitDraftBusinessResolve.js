/**
 * Idempotent Business row resolution for commitDraft (parallel missions / legacy userId unique).
 */

import { isMultiStoreIdentityV1Enabled, logStoreIdentity } from '../store/storeIdentity.js';

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function p2002Targets(err) {
  const t = err?.meta?.target;
  return Array.isArray(t) ? t.map((x) => String(x)) : [];
}

function isUserIdUniqueViolation(err) {
  if (err?.code !== 'P2002') return false;
  const targets = p2002Targets(err);
  return targets.includes('userId') || targets.some((t) => /userId/i.test(t));
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

/**
 * Create or update Business for draft commit without failing on parallel same-user commits.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {{
 *   user: { id: string };
 *   draft: { id: string; committedStoreId?: string | null; input?: unknown };
 *   businessPayload: object;
 *   businessName: string;
 *   businessFields?: object;
 *   writeMode: { mode: string; storeId?: string | null; reason?: string };
 *   generateUniqueStoreSlugForTx: (tx: unknown, name: string, excludeId?: string) => Promise<string>;
 * }} ctx
 */
export async function resolveBusinessForDraftCommit(tx, ctx) {
  const { user, draft, businessPayload, businessName, businessFields = {}, writeMode, generateUniqueStoreSlugForTx } =
    ctx;
  const uid = user.id;
  const logBase = {
    ...resolveCommitLogContext(businessFields, draft),
    userId: uid,
    draftStoreId: draft.id,
    writeMode: writeMode.mode,
    writeReason: writeMode.reason ?? null,
  };

  if (writeMode.mode === 'update' && writeMode.storeId) {
    const existingRow = await tx.business.findFirst({
      where: { id: writeMode.storeId, userId: uid },
    });
    if (!existingRow) {
      throw new Error(
        `COMMIT_DRAFT_FAILED: Cannot update store ${writeMode.storeId} — not found or not owned by user`,
      );
    }
    const slugForUpdate = await generateUniqueStoreSlugForTx(tx, businessName, existingRow.id);
    const business = await tx.business.update({
      where: { id: existingRow.id },
      data: { ...businessPayload, slug: slugForUpdate },
    });
    logStoreIdentity('STORE_IDENTITY_COMMIT_UPDATE', {
      draftId: draft.id,
      storeId: business.id,
      mode: 'update',
      reason: writeMode.reason,
      ownerId: uid,
    });
    console.log('[commitDraft] business_commit', { ...logBase, path: 'explicit_update', storeId: business.id, slug: slugForUpdate });
    return business;
  }

  const draftCommitted = str(draft.committedStoreId);
  if (draftCommitted) {
    const row = await tx.business.findFirst({
      where: { id: draftCommitted, userId: uid },
    });
    if (row) {
      const slug = await generateUniqueStoreSlugForTx(tx, businessName, row.id);
      const business = await tx.business.update({
        where: { id: row.id },
        data: { ...businessPayload, slug },
      });
      console.log('[commitDraft] business_commit', {
        ...logBase,
        path: 'draft_committed_store_id',
        storeId: business.id,
        slug,
      });
      return business;
    }
  }

  const explicitTarget =
    str(businessFields?.targetStoreId) || str(businessFields?.existingStoreId) || null;
  if (explicitTarget) {
    const row = await tx.business.findFirst({
      where: { id: explicitTarget, userId: uid },
    });
    if (row) {
      const slug = await generateUniqueStoreSlugForTx(tx, businessName, row.id);
      const business = await tx.business.update({
        where: { id: row.id },
        data: { ...businessPayload, slug },
      });
      console.log('[commitDraft] business_commit', {
        ...logBase,
        path: 'explicit_target_store',
        storeId: business.id,
        slug,
      });
      return business;
    }
  }

  const multiStore = isMultiStoreIdentityV1Enabled();
  if (multiStore) {
    try {
      const slug = await generateUniqueStoreSlugForTx(tx, businessName);
      const business = await tx.business.create({
        data: { userId: uid, slug, ...businessPayload },
      });
      logStoreIdentity('STORE_IDENTITY_COMMIT_CREATE', {
        draftId: draft.id,
        storeId: business.id,
        mode: 'create',
        reason: writeMode.reason ?? 'greenfield',
        ownerId: uid,
      });
      console.log('[commitDraft] business_commit', { ...logBase, path: 'create_multi_store', storeId: business.id, slug });
      return business;
    } catch (err) {
      if (!isUserIdUniqueViolation(err)) throw err;
      console.warn('[commitDraft] business_conflict_recovery', {
        ...logBase,
        path: 'p2002_userId_fallback_multi_store',
        constraint: p2002Targets(err).join(','),
      });
    }
  }

  const owned = await tx.business.findFirst({
    where: { userId: uid },
    orderBy: { updatedAt: 'desc' },
  });

  if (owned) {
    const slug = await generateUniqueStoreSlugForTx(tx, businessName, owned.id);
    const business = await tx.business.update({
      where: { id: owned.id },
      data: { ...businessPayload, slug },
    });
    console.log('[commitDraft] business_conflict_recovery', {
      ...logBase,
      path: multiStore ? 'reuse_owned_after_p2002' : 'reuse_owned_singleton',
      storeId: business.id,
      slug,
      constraint: 'userId',
    });
    logStoreIdentity('STORE_IDENTITY_COMMIT_UPDATE', {
      draftId: draft.id,
      storeId: business.id,
      mode: 'update',
      reason: 'same_user_recovery',
      ownerId: uid,
    });
    return business;
  }

  try {
    const slug = await generateUniqueStoreSlugForTx(tx, businessName);
    const business = await tx.business.create({
      data: { userId: uid, slug, ...businessPayload },
    });
    logStoreIdentity('STORE_IDENTITY_COMMIT_CREATE', {
      draftId: draft.id,
      storeId: business.id,
      mode: 'create',
      reason: writeMode.reason ?? 'greenfield',
      ownerId: uid,
    });
    console.log('[commitDraft] business_commit', { ...logBase, path: 'create_first_business', storeId: business.id, slug });
    return business;
  } catch (err) {
    if (!isUserIdUniqueViolation(err)) throw err;
    const recovered = await tx.business.findFirst({
      where: { userId: uid },
      orderBy: { updatedAt: 'desc' },
    });
    if (!recovered) throw err;
    const slug = await generateUniqueStoreSlugForTx(tx, businessName, recovered.id);
    const business = await tx.business.update({
      where: { id: recovered.id },
      data: { ...businessPayload, slug },
    });
    console.log('[commitDraft] business_conflict_recovery', {
      ...logBase,
      path: 'p2002_userId_reuse',
      storeId: business.id,
      slug,
      constraint: p2002Targets(err).join(','),
    });
    return business;
  }
}
