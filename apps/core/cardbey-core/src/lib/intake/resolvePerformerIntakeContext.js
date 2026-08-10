/**
 * Unified performer intake context — account stores, space, auto-bind, last-used.
 */

import { loadAccountStoreContext } from './accountStoreIntakeGate.js';
import { resolveIntakeStoreId, resolveIntakeDraftId } from './intakeMemoryContext.js';
import { validateUserStoreId } from './resolveStoreAmbiguity.js';
import { resolveLatestStoreTargetForUser } from '../runtime/runtimeSessionService.js';
import { getPrismaClient } from '../prisma.js';

/**
 * @param {Record<string, unknown> | null | undefined} intentSourceContext
 */
function pickPerformeeContext(intentSourceContext) {
  if (!intentSourceContext || typeof intentSourceContext !== 'object') return null;
  const pc = intentSourceContext.performeeContext;
  return pc && typeof pc === 'object' ? pc : null;
}

/**
 * @param {{
 *   currentContext?: Record<string, unknown>;
 *   performeeContext?: Record<string, unknown> | null;
 * }}
 */
function resolveSpaceFromSources({ currentContext = {}, performeeContext = null }) {
  const ctxSpaceType =
    typeof currentContext.spaceType === 'string' ? currentContext.spaceType.trim() : '';
  const ctxSpaceId = typeof currentContext.spaceId === 'string' ? currentContext.spaceId.trim() : '';

  if (ctxSpaceType === 'personal' || ctxSpaceType === 'business') {
    return {
      spaceType: ctxSpaceType,
      spaceId: ctxSpaceId || (ctxSpaceType === 'personal' ? 'personal' : ''),
    };
  }

  if (performeeContext) {
    const spaceId = String(performeeContext.spaceId ?? '').trim();
    const rawType = String(performeeContext.spaceType ?? '').trim();
    const spaceType =
      rawType === 'business' || rawType === 'personal'
        ? rawType
        : spaceId === 'personal' || spaceId === 'me'
          ? 'personal'
          : spaceId
            ? 'business'
            : null;
    return { spaceType, spaceId };
  }

  return { spaceType: null, spaceId: '' };
}

/**
 * @param {string} userId
 * @param {string | null | undefined} storeId
 */
async function tryValidateStore(userId, storeId) {
  const sid = String(storeId ?? '').trim();
  if (!sid || sid === 'personal' || sid === 'me') return null;
  if (!(await validateUserStoreId(userId, sid))) return null;
  return sid;
}

const EMPTY_CONTEXT = {
  activeStoreId: null,
  activeDraftId: null,
  spaceType: 'personal',
  spaceId: 'personal',
  accountHasStores: false,
  accountStoreCount: 0,
  accountStores: [],
  hasActiveStoreContext: false,
  selectionMethod: null,
};

/**
 * Resolve performer intake store + space context before classification.
 *
 * Priority: intake selection → client context (non-personal) → performee business space
 * → last-used store/draft → single owned store.
 *
 * @param {{
 *   userId?: string | null;
 *   tenantId?: string | null;
 *   currentContext?: Record<string, unknown>;
 *   intentSourceContext?: Record<string, unknown> | null;
 *   selectionStoreId?: string | null;
 * }} opts
 */
export async function resolvePerformerIntakeContext(opts = {}) {
  const userId = String(opts.userId ?? '').trim();
  if (!userId || userId.startsWith('guest_')) return { ...EMPTY_CONTEXT };

  const currentContext =
    opts.currentContext && typeof opts.currentContext === 'object' ? opts.currentContext : {};
  const performeeContext = pickPerformeeContext(opts.intentSourceContext);
  const space = resolveSpaceFromSources({ currentContext, performeeContext });

  const account = await loadAccountStoreContext(userId);

  let activeStoreId = null;
  let activeDraftId = resolveIntakeDraftId(currentContext);
  let selectionMethod = null;

  const selectionId = String(opts.selectionStoreId ?? '').trim();
  if (selectionId) {
    const validated = await tryValidateStore(userId, selectionId);
    if (validated) {
      activeStoreId = validated;
      selectionMethod = 'intake_selection';
    }
  }

  if (!activeStoreId) {
    const clientStoreId = resolveIntakeStoreId(currentContext);
    // Honor an explicit client activeStoreId even if spaceType was wrongly marked personal
    // (dashboard Space switcher historically set storeId while entryContext only read spaceId).
    if (clientStoreId) {
      const validated = await tryValidateStore(userId, clientStoreId);
      if (validated) {
        activeStoreId = validated;
        selectionMethod = 'client_context';
      }
    }
  }

  if (!activeStoreId && space.spaceType === 'business' && space.spaceId) {
    const validated = await tryValidateStore(userId, space.spaceId);
    if (validated) {
      activeStoreId = validated;
      selectionMethod = 'performee_space';
    }
  }

  if (!activeStoreId && account.accountHasStores) {
    try {
      const prisma = getPrismaClient();
      const latest = await resolveLatestStoreTargetForUser(
        prisma,
        userId,
        String(opts.tenantId ?? userId).trim() || userId,
      );
      if (latest.storeId) {
        const validated = await tryValidateStore(userId, latest.storeId);
        if (validated) {
          activeStoreId = validated;
          activeDraftId = activeDraftId || latest.draftId || null;
          selectionMethod = latest.source || 'last_used';
        }
      }
    } catch {
      // non-fatal
    }
  }

  if (!activeStoreId && account.storeCount === 1) {
    const onlyId = String(account.stores[0]?.id ?? '').trim();
    const validated = await tryValidateStore(userId, onlyId);
    if (validated) {
      activeStoreId = validated;
      selectionMethod = 'single_owned_store';
    }
  }

  const hasActiveStoreContext = Boolean(activeStoreId || activeDraftId);
  const resolvedSpaceType =
    space.spaceType || (activeStoreId ? 'business' : 'personal');
  const resolvedSpaceId =
    space.spaceId || (resolvedSpaceType === 'business' && activeStoreId ? activeStoreId : 'personal');

  return {
    activeStoreId,
    activeDraftId: activeDraftId || null,
    spaceType: resolvedSpaceType,
    spaceId: resolvedSpaceId,
    accountHasStores: account.accountHasStores,
    accountStoreCount: account.storeCount,
    accountStores: account.stores,
    hasActiveStoreContext,
    selectionMethod,
  };
}

/**
 * @param {Record<string, unknown> | null | undefined} currentContext
 * @param {Record<string, unknown> | null | undefined} performerIntakeContext
 */
export function mergePerformerIntakeContextIntoCurrentContext(currentContext, performerIntakeContext) {
  if (!performerIntakeContext || typeof performerIntakeContext !== 'object') {
    return currentContext && typeof currentContext === 'object' ? currentContext : {};
  }
  const base = currentContext && typeof currentContext === 'object' ? { ...currentContext } : {};
  const next = {
    ...base,
    performerIntakeContext,
    spaceType: performerIntakeContext.spaceType ?? base.spaceType,
    spaceId: performerIntakeContext.spaceId ?? base.spaceId,
  };
  if (performerIntakeContext.activeStoreId) {
    next.activeStoreId = performerIntakeContext.activeStoreId;
    next.storeId = performerIntakeContext.activeStoreId;
  }
  if (performerIntakeContext.activeDraftId && !resolveIntakeDraftId(base)) {
    next.activeDraftId = performerIntakeContext.activeDraftId;
    next.draftId = performerIntakeContext.activeDraftId;
  }
  return next;
}
