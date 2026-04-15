/**
 * Draft ownership checks for store creation flow.
 * Uses OrchestratorTask (task.request.generationRunId + task.userId) to infer ownership;
 * DraftStore has no userId column, so we infer via the job that created the draft.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Find OrchestratorTask whose request.generationRunId matches the given runId.
 * @param {string} generationRunId
 * @returns {Promise<{ userId: string, tenantId: string } | null>}
 */
export async function getTaskOwnerByGenerationRunId(generationRunId) {
  if (!generationRunId || typeof generationRunId !== 'string') return null;
  try {
    const tasks = await prisma.orchestratorTask.findMany({
      where: { status: { in: ['queued', 'running', 'completed', 'failed'] } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const task = tasks.find(
      (t) => t.request && typeof t.request === 'object' && t.request.generationRunId === generationRunId
    ) || null;
    if (!task) return null;
    return { userId: task.userId, tenantId: task.tenantId };
  } catch (_) {
    return null;
  }
}

/**
 * Assert the draft identified by generationRunId is owned by the given userId (or tenant).
 * Used for GET /api/stores/temp/draft, PATCH /api/draft-store/:id, POST /api/store/publish.
 * When the task was created by a guest (userId starts with 'guest_'), any authenticated user
 * is allowed (so the user can continue and publish after signing in).
 * @param {string} generationRunId
 * @param {string} userId - req.userId (or tenant id in single-tenant)
 * @returns {Promise<boolean>} true if owned or no task (legacy) or guest-owned draft; false if task exists and different real user
 */
export async function isDraftOwnedByUser(generationRunId, userId) {
  if (!userId) return false;
  const owner = await getTaskOwnerByGenerationRunId(generationRunId);
  if (!owner) return true; // No task: allow (legacy draft or not yet created)
  if (owner.userId === userId) return true; // Same user
  // Draft created by guest: allow any authenticated user (continue after login)
  if (typeof owner.userId === 'string' && owner.userId.startsWith('guest_')) return true;
  return false;
}

/**
 * Single authorization helper for DraftStore. Use for GET summary, POST generate, GET/PATCH :draftId, repair-catalog.
 * Allows access if: super_admin, or draft.ownerUserId === userId, or draft tenant matches (draft.input.tenantId === tenantKey),
 * or OrchestratorTask (generationRunId) ownership, or store ownership (draft's storeId → Business.userId === userId).
 * ownerUserId must be actual user id; tenantKey = getTenantId(user) (business id or user id).
 * @param {object} draft - DraftStore row (id, ownerUserId, generationRunId, input, preview, committedStoreId)
 * @param {{ userId?: string | null, tenantKey?: string | null, isSuperAdmin?: boolean }} context
 * @returns {Promise<boolean>}
 */
const DEV = process.env.NODE_ENV !== 'production';

export async function canAccessDraftStore(draft, context = {}) {
  const userId = context.userId ?? context.user?.id ?? null;
  const tenantKey = context.tenantKey ?? null;
  if (context.isSuperAdmin) {
    if (DEV) console.log('[canAccessDraftStore] ALLOW_SUPER', { draftId: draft.id });
    return true;
  }
  if (!userId) {
    if (DEV) console.log('[canAccessDraftStore] DENY', { draftId: draft.id, reason: 'no userId' });
    return false;
  }
  if (draft.ownerUserId && draft.ownerUserId === userId) {
    if (DEV) console.log('[canAccessDraftStore] ALLOW_OWNER', { draftId: draft.id });
    return true;
  }
  if (tenantKey) {
    const draftTenant = (draft.input && typeof draft.input === 'object' ? draft.input.tenantId : undefined) ?? null;
    if (draftTenant && draftTenant === tenantKey) {
      if (DEV) console.log('[canAccessDraftStore] ALLOW_TENANT', { draftId: draft.id });
      return true;
    }
  }
  const runId =
    draft.generationRunId ??
    (draft.input && typeof draft.input === 'object' ? draft.input.generationRunId : undefined) ??
    null;
  if (runId) {
    const ok = await isDraftOwnedByUser(runId, userId);
    if (ok) {
      if (DEV) console.log('[canAccessDraftStore] ALLOW_TASK', { draftId: draft.id });
      return true;
    }
  }
  const previewObj =
    typeof draft.preview === 'object'
      ? draft.preview
      : typeof draft.preview === 'string'
        ? (() => {
            try {
              return JSON.parse(draft.preview || '{}');
            } catch {
              return {};
            }
          })()
        : {};
  const storeId =
    previewObj?.meta?.storeId ??
    (draft.input && typeof draft.input === 'object' ? draft.input.storeId : undefined) ??
    draft.committedStoreId ??
    null;
  if (storeId) {
    const business = await prisma.business.findUnique({
      where: { id: storeId },
      select: { userId: true },
    });
    if (business && business.userId === userId) {
      if (DEV) console.log('[canAccessDraftStore] ALLOW_STORE', { draftId: draft.id });
      return true;
    }
  }
  if (DEV) console.log('[canAccessDraftStore] DENY', { draftId: draft.id });
  return false;
}

/** Dev-only: return ownership-related fields for denial logging (no secrets). */
export function draftOwnershipFieldsForLog(draft) {
  const previewObj =
    typeof draft.preview === 'object'
      ? draft.preview
      : typeof draft.preview === 'string'
        ? (() => {
            try {
              return JSON.parse(draft.preview || '{}');
            } catch {
              return {};
            }
          })()
        : {};
  const storeId =
    previewObj?.meta?.storeId ??
    (draft.input && typeof draft.input === 'object' ? draft.input.storeId : undefined) ??
    draft.committedStoreId ??
    null;
  const generationRunId =
    draft.generationRunId ?? (draft.input && typeof draft.input === 'object' ? draft.input.generationRunId : undefined) ?? null;
  const draftTenantKey = (draft.input && typeof draft.input === 'object' ? draft.input.tenantId : undefined) ?? null;
  return {
    draftOwnerUserId: draft.ownerUserId ?? null,
    draftTenantKey: draftTenantKey ?? null,
    draftStoreId: draft.id ?? null,
    generationRunId: generationRunId ?? null,
    storeId: storeId ?? null,
  };
}
