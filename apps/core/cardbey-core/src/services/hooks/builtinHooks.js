/**
 * Built-in lifecycle hooks — validation, rate limits, metrics, error logging, rollback.
 */

import hookRegistry from './hookRegistry.js';
import { HOOK_TYPES, HOOK_PRIORITIES } from './hookTypes.js';
import {
  checkRateLimit,
  getSkillMetrics,
  popRollbackSnapshot,
  recordSkillExecution,
  stashRollbackSnapshot,
} from './hookMetrics.js';
import { getPrismaClient } from '../../lib/prisma.js';
import {
  shouldBypassPermissionValidation,
  syntheticBypassStore,
} from './permissionBypass.js';

hookRegistry.register({
  id: 'validate_permissions',
  type: HOOK_TYPES.PRE_EXECUTION,
  name: 'Validate Permissions',
  priority: HOOK_PRIORITIES.CRITICAL,
  skillId: 'analyze_store',
  handler: async (context) => {
    const userId = String(context?.userId ?? '').trim();
    const storeId = String(context?.storeId ?? '').trim();
    if (!userId) throw new Error('User ID required');
    if (!storeId) throw new Error('Store ID required');

    if (shouldBypassPermissionValidation({ userId, storeId, source: context?.source })) {
      return { validated: true, bypass: true, store: syntheticBypassStore(storeId, userId) };
    }

    const prisma = getPrismaClient();
    if (prisma?.business?.findFirst) {
      const business = await prisma.business.findFirst({
        where: { id: storeId, userId },
        select: { id: true, name: true },
      });
      if (!business) {
        throw new Error(`User ${userId} does not have access to store ${storeId}`);
      }
      return { validated: true, store: business };
    }

    return { validated: true, storeId, userId };
  },
});

hookRegistry.register({
  id: 'check_rate_limit',
  type: HOOK_TYPES.PRE_EXECUTION,
  name: 'Check Rate Limit',
  priority: HOOK_PRIORITIES.HIGH,
  handler: async (context) => {
    const userId = String(context?.userId ?? 'anonymous').trim() || 'anonymous';
    const limit = checkRateLimit(userId, { windowMs: 60_000, maxExecutions: 30 });
    if (limit.limited) {
      throw new Error('Rate limit exceeded. Please wait.');
    }
    return { rateLimited: false, count: limit.count };
  },
});

hookRegistry.register({
  id: 'load_store_data',
  type: HOOK_TYPES.PRE_EXECUTION,
  name: 'Load Store Data',
  priority: HOOK_PRIORITIES.NORMAL,
  skillId: 'analyze_store',
  handler: async (context) => {
    const storeId = String(context?.storeId ?? '').trim();
    if (!storeId) return { skipped: true, reason: 'no_store_id' };

    const userId = String(context?.userId ?? '').trim();
    if (shouldBypassPermissionValidation({ userId, storeId, source: context?.source })) {
      return { storeData: syntheticBypassStore(storeId, userId) };
    }

    const prisma = getPrismaClient();
    if (!prisma?.business?.findUnique) {
      return { storeData: { id: storeId } };
    }

    const store = await prisma.business.findUnique({
      where: { id: storeId },
      select: { id: true, name: true, userId: true, isActive: true },
    });

    if (!store) {
      throw new Error(`Store ${storeId} not found`);
    }

    return { storeData: store };
  },
});

hookRegistry.register({
  id: 'stash_rollback_snapshot',
  type: HOOK_TYPES.PRE_EXECUTION,
  name: 'Stash Rollback Snapshot',
  priority: HOOK_PRIORITIES.NORMAL,
  condition: (ctx) => Boolean(ctx?.storeId && ctx?.preSnapshot),
  handler: async (context) => {
    const storeId = String(context.storeId).trim();
    stashRollbackSnapshot(`store:${storeId}`, context.preSnapshot);
    return { stashed: true, storeId };
  },
});

hookRegistry.register({
  id: 'update_metrics',
  type: HOOK_TYPES.POST_EXECUTION,
  name: 'Update Metrics',
  priority: HOOK_PRIORITIES.HIGH,
  handler: async (context) => {
    const skillId = String(context?.skillId ?? 'unknown');
    const userId = String(context?.userId ?? 'anonymous');
    const duration = Number(context?.result?.duration) || 0;
    recordSkillExecution(skillId, userId, duration);
    return { metricsUpdated: true, metrics: getSkillMetrics(skillId, userId) };
  },
});

hookRegistry.register({
  id: 'notify_completion',
  type: HOOK_TYPES.POST_EXECUTION,
  name: 'Notify Completion',
  priority: HOOK_PRIORITIES.LOW,
  handler: async (context) => {
    const skillId = String(context?.skillId ?? 'unknown');
    console.log(`[Hook] Skill ${skillId} completed`);
    return { notified: true };
  },
});

hookRegistry.register({
  id: 'log_error',
  type: HOOK_TYPES.ON_ERROR,
  name: 'Log Error',
  priority: HOOK_PRIORITIES.CRITICAL,
  handler: async (context) => {
    const skillId = String(context?.skillId ?? 'unknown');
    const userId = String(context?.userId ?? 'anonymous');
    const error = context?.error;
    console.error(`[Hook] Error in ${skillId} (user=${userId}):`, error?.message || error);
    return { logged: true };
  },
});

hookRegistry.register({
  id: 'retry_backoff_hint',
  type: HOOK_TYPES.ON_RETRY,
  name: 'Retry Backoff Hint',
  priority: HOOK_PRIORITIES.NORMAL,
  handler: async (context) => {
    const attempt = Number(context?.attempt) || 1;
    return { retrying: true, attempt, backoffMs: Math.min(5000, 250 * 2 ** (attempt - 1)) };
  },
});

hookRegistry.register({
  id: 'timeout_notify',
  type: HOOK_TYPES.ON_TIMEOUT,
  name: 'Timeout Notify',
  priority: HOOK_PRIORITIES.HIGH,
  handler: async (context) => {
    console.warn(`[Hook] Timeout for skill ${context?.skillId ?? 'unknown'}`);
    return { timeoutHandled: true };
  },
});

hookRegistry.register({
  id: 'rollback_changes',
  type: HOOK_TYPES.ON_ROLLBACK,
  name: 'Rollback Changes',
  priority: HOOK_PRIORITIES.HIGH,
  handler: async (context) => {
    const storeId = String(context?.storeId ?? '').trim();
    const originalState =
      context?.originalState ?? popRollbackSnapshot(storeId ? `store:${storeId}` : '');

    if (!storeId || !originalState || typeof originalState !== 'object') {
      return { reverted: false, reason: 'no_snapshot' };
    }

    const prisma = getPrismaClient();
    if (prisma?.business?.update && originalState.name != null) {
      await prisma.business.update({
        where: { id: storeId },
        data: {
          name: originalState.name,
          ...(originalState.isActive != null ? { isActive: originalState.isActive } : {}),
        },
      });
      return { reverted: true, storeId };
    }

    return { reverted: false, reason: 'no_prisma_or_data' };
  },
});

hookRegistry.register({
  id: 'complete_audit',
  type: HOOK_TYPES.ON_COMPLETE,
  name: 'Complete Audit',
  priority: HOOK_PRIORITIES.OPTIONAL,
  handler: async (context) => {
    return {
      skillId: context?.skillId ?? null,
      success: !context?.error,
      duration: context?.result?.duration ?? null,
    };
  },
});

console.log('[BuiltinHooks] Registered built-in lifecycle hooks');
