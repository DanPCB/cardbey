/**
 * Preflight + execute Business resolution for publishDraft (no in-tx recovery after failed writes).
 */

import { generateUniqueStoreSlug, slugify } from '../../utils/slug.js';
import {
  isExplicitStoreId,
  isLegacyBusinessUserIdUniqueEnabled,
  isMultiStoreIdentityV1Enabled,
  logStoreIdentity,
} from '../store/storeIdentity.js';
import {
  isAbortedTransactionError,
  isSlugUniqueViolation,
  isUserIdUniqueViolation,
} from './commitDraftBusinessResolve.js';

export function logPublishDraftStructured(event, fields = {}) {
  console.log('[publishDraft]', JSON.stringify({ event, ...fields }));
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{
 *   ownerId: string;
 *   targetDraft: { id: string; committedStoreId?: string | null };
 *   expectedStoreId?: string | null;
 *   storeName: string;
 *   storeType: string;
 *   storeDescription?: string | null;
 *   storeTagline?: string | null;
 *   isTempStore: boolean;
 *   existingStoreId?: string | null;
 *   preflightOptions?: { preferOwnedBusiness?: boolean; forceRegenerateSlug?: boolean };
 * }} ctx
 */
export async function preflightPublishBusinessPlan(prisma, ctx) {
  const {
    ownerId,
    targetDraft,
    expectedStoreId,
    storeName,
    isTempStore,
    existingStoreId,
    preflightOptions = {},
  } = ctx;

  const intendedSlug = slugify(storeName) || 'store';
  const logBase = {
    userId: ownerId,
    draftStoreId: targetDraft.id,
    intendedSlug,
    path: null,
  };

  if (!isTempStore || existingStoreId) {
    return {
      action: 'skip',
      path: 'existing_store_shell',
      intendedSlug,
      finalSlug: null,
      businessId: existingStoreId ?? null,
    };
  }

  if (!ownerId) {
    throw new Error('AUTH_REQUIRED');
  }

  const multiStoreV1 = isMultiStoreIdentityV1Enabled();
  const legacyUserIdUnique = isLegacyBusinessUserIdUniqueEnabled();
  const explicitExpected =
    expectedStoreId && isExplicitStoreId(expectedStoreId) ? String(expectedStoreId).trim() : null;

  if (explicitExpected) {
    const row = await prisma.business.findFirst({
      where: { id: explicitExpected, userId: ownerId },
      select: { id: true, slug: true, name: true, userId: true },
    });
    if (!row) {
      const err = new Error(
        'This draft is not linked to the expected store. Choose the correct store or create a new one.',
      );
      err.code = 'publish_store_mismatch';
      throw err;
    }
    logPublishDraftStructured('preflight', {
      ...logBase,
      path: 'expected_store_id',
      businessId: row.id,
      finalSlug: row.slug,
    });
    return {
      action: 'update',
      path: 'expected_store_id',
      businessId: row.id,
      intendedSlug,
      finalSlug: row.slug,
    };
  }

  const draftCommitted =
    targetDraft.committedStoreId != null && String(targetDraft.committedStoreId).trim()
      ? String(targetDraft.committedStoreId).trim()
      : null;
  if (draftCommitted) {
    const row = await prisma.business.findFirst({
      where: { id: draftCommitted, userId: ownerId },
      select: { id: true, slug: true, name: true, userId: true },
    });
    if (row) {
      logPublishDraftStructured('preflight', {
        ...logBase,
        path: 'draft_committed_store_id',
        businessId: row.id,
        finalSlug: row.slug,
      });
      return {
        action: 'update',
        path: 'draft_committed_store_id',
        businessId: row.id,
        intendedSlug,
        finalSlug: row.slug,
      };
    }
  }

  if (!multiStoreV1 && intendedSlug) {
    const row = await prisma.business.findFirst({
      where: { userId: ownerId, slug: intendedSlug },
      select: { id: true, slug: true, name: true, userId: true },
    });
    if (row) {
      logPublishDraftStructured('preflight', {
        ...logBase,
        path: 'tenant_slug_legacy',
        businessId: row.id,
        finalSlug: row.slug,
      });
      return {
        action: 'update',
        path: 'tenant_slug_legacy',
        businessId: row.id,
        intendedSlug,
        finalSlug: row.slug,
      };
    }
  }

  const slugOwner = intendedSlug
    ? await prisma.business.findUnique({
        where: { slug: intendedSlug },
        select: { id: true, userId: true, slug: true },
      })
    : null;
  if (slugOwner?.userId === ownerId) {
    logPublishDraftStructured('preflight', {
      ...logBase,
      path: 'reuse_owned_slug',
      businessId: slugOwner.id,
      finalSlug: slugOwner.slug,
    });
    return {
      action: 'update',
      path: 'reuse_owned_slug',
      businessId: slugOwner.id,
      intendedSlug,
      finalSlug: slugOwner.slug,
    };
  }

  let finalSlug = intendedSlug;
  if (slugOwner || preflightOptions.forceRegenerateSlug) {
    finalSlug = await generateUniqueStoreSlug(prisma, storeName);
  } else {
    const taken = await prisma.business.findUnique({ where: { slug: finalSlug }, select: { id: true } });
    if (taken) {
      finalSlug = await generateUniqueStoreSlug(prisma, storeName);
    }
  }

  const owned = await prisma.business.findFirst({
    where: { userId: ownerId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, slug: true },
  });

  if (owned && (preflightOptions.preferOwnedBusiness || legacyUserIdUnique || !multiStoreV1)) {
    logPublishDraftStructured('preflight', {
      ...logBase,
      path: legacyUserIdUnique ? 'legacy_user_id_unique_reuse' : 'reuse_owned_singleton',
      businessId: owned.id,
      finalSlug: owned.slug,
    });
    return {
      action: 'update',
      path: legacyUserIdUnique ? 'legacy_user_id_unique_reuse' : 'reuse_owned_singleton',
      businessId: owned.id,
      intendedSlug,
      finalSlug: owned.slug,
    };
  }

  logPublishDraftStructured('preflight', {
    ...logBase,
    path: 'create_new_business',
    finalSlug,
  });
  return {
    action: 'create',
    path: 'create_new_business',
    intendedSlug,
    finalSlug,
  };
}

/**
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {Awaited<ReturnType<typeof preflightPublishBusinessPlan>>} plan
 * @param {Parameters<typeof preflightPublishBusinessPlan>[1]} ctx
 */
export async function executePublishBusinessPlan(tx, plan, ctx) {
  const { ownerId, targetDraft, storeName, storeType, storeDescription, storeTagline } = ctx;

  if (plan.action === 'skip') {
    return {
      effectiveStoreId: plan.businessId,
      newSlug: plan.finalSlug,
    };
  }

  if (plan.action === 'update' && plan.businessId) {
    logPublishDraftStructured('business_update', {
      userId: ownerId,
      draftStoreId: targetDraft.id,
      intendedSlug: plan.intendedSlug,
      finalSlug: plan.finalSlug,
      businessId: plan.businessId,
      path: plan.path,
    });
    logStoreIdentity('STORE_IDENTITY_PUBLISH_UPDATE', {
      draftId: targetDraft.id,
      storeId: plan.businessId,
      mode: 'update',
      reason: plan.path,
      ownerId,
    });
    return {
      effectiveStoreId: plan.businessId,
      newSlug: plan.finalSlug ?? plan.intendedSlug,
    };
  }

  if (plan.action === 'create') {
    const slug = plan.finalSlug ?? (await generateUniqueStoreSlug(tx, storeName));
    const created = await tx.business.create({
      data: {
        userId: ownerId,
        name: storeName,
        type: storeType,
        slug,
        description: storeDescription ?? null,
        tagline: storeTagline ?? null,
        isActive: false,
      },
    });
    logPublishDraftStructured('business_create', {
      userId: ownerId,
      draftStoreId: targetDraft.id,
      intendedSlug: plan.intendedSlug,
      finalSlug: slug,
      businessId: created.id,
      path: plan.path,
    });
    logStoreIdentity('STORE_IDENTITY_PUBLISH_CREATE', {
      draftId: targetDraft.id,
      storeId: created.id,
      mode: 'create',
      reason: plan.path,
      ownerId,
    });
    return {
      effectiveStoreId: created.id,
      newSlug: created.slug,
    };
  }

  throw new Error('publish_business_plan_invalid');
}

export function isPublishBusinessRetryableError(err) {
  return (
    isUserIdUniqueViolation(err) ||
    isSlugUniqueViolation(err) ||
    isAbortedTransactionError(err)
  );
}

export function friendlyPublishIdentityError(err) {
  if (isSlugUniqueViolation(err)) {
    return {
      code: 'STORE_SLUG_TAKEN',
      message:
        "We couldn't publish because this store address is already taken. We generated a new address — please try again.",
      statusCode: 409,
    };
  }
  if (isUserIdUniqueViolation(err)) {
    return {
      code: 'STORE_BUSINESS_CONFLICT',
      message:
        'We updated your existing store instead of creating a duplicate. Please try publishing again.',
      statusCode: 409,
    };
  }
  if (isAbortedTransactionError(err)) {
    return {
      code: 'STORE_PUBLISH_RETRY',
      message: 'Publish was interrupted. Please try again.',
      statusCode: 409,
    };
  }
  return null;
}
