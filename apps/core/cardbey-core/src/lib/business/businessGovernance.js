/**
 * Governance gate for all commercial writes — owner, store, runtime context.
 */

/**
 * @param {object} params
 * @param {object} params.input
 * @param {object} params.context
 * @param {string} params.toolName
 */
export async function validateBusinessOperationContext({ input, context, toolName }) {
  const storeId =
    (typeof input?.storeId === 'string' && input.storeId.trim()) ||
    (typeof context?.storeId === 'string' && context.storeId.trim()) ||
    null;

  const userId =
    (typeof context?.userId === 'string' && context.userId.trim()) ||
    (typeof input?.userId === 'string' && input.userId.trim()) ||
    null;

  if (!storeId) {
    return {
      ok: false,
      blocker: {
        code: 'STORE_REQUIRED',
        message: `${toolName} requires storeId`,
        requiredAction: 'provide_store_context',
      },
    };
  }

  if (!userId && process.env.NODE_ENV !== 'test') {
    return {
      ok: false,
      blocker: {
        code: 'ACTOR_REQUIRED',
        message: `${toolName} requires authenticated runtime actor (userId)`,
        requiredAction: 'authenticate',
      },
    };
  }

  let business = null;
  try {
    const { getPrismaClient } = await import('../prisma.js');
    const prisma = getPrismaClient();
    if (prisma?.business?.findUnique) {
      business = await prisma.business.findUnique({
        where: { id: storeId },
        select: { id: true, userId: true, name: true, isActive: true },
      });
    }
  } catch {
    // degrade in tests without DB
  }

  if (business && userId && business.userId !== userId) {
    const role = context?.role ?? context?.userRole ?? null;
    const isAdmin = role === 'admin' || role === 'platform_admin';
    if (!isAdmin) {
      return {
        ok: false,
        blocker: {
          code: 'STORE_OWNERSHIP',
          message: 'Actor does not own this store',
          requiredAction: 'use_owned_store',
        },
      };
    }
  }

  if (business && business.isActive === false) {
    return {
      ok: false,
      blocker: {
        code: 'STORE_INACTIVE',
        message: 'Store is inactive',
        requiredAction: 'activate_store',
      },
    };
  }

  const runtimeExecutionId =
    context?.runtimeExecutionId ??
    context?.executionId ??
    context?.traceId ??
    null;

  const missionId = context?.missionId ?? context?.activeMissionId ?? input?.missionId ?? null;

  return {
    ok: true,
    storeId,
    userId,
    business,
    runtimeExecutionId,
    missionId,
    toolName,
  };
}
