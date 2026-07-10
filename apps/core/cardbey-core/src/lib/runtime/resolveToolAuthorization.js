/**
 * Separate authentication from store authorization for governed tool execution.
 */

import { assertStoreOwnership } from '../toolExecutors/loyalty/loyaltyProgramDraft.js';
import { getToolEntry } from '../intake/intakeToolRegistry.js';

/**
 * @typedef {'checking' | 'authorized' | 'sign_in_required' | 'store_selection_required' | 'store_access_denied'} AuthorizationState
 */

/**
 * @typedef {{
 *   kind: 'authenticated';
 *   userId: string;
 *   accountId?: string;
 * }} AuthenticatedPrincipal
 *
 * @typedef {{
 *   kind: 'anonymous';
 *   anonymousSessionId?: string;
 * }} AnonymousPrincipal
 */

/**
 * @param {{
 *   principal: AuthenticatedPrincipal | AnonymousPrincipal | null | undefined;
 *   storeId?: string | null;
 *   tool?: string | null;
 * }} args
 * @returns {Promise<{
 *   state: AuthorizationState;
 *   userId?: string | null;
 *   storeId?: string | null;
 *   canExecute: boolean;
 *   message?: string | null;
 *   code?: string | null;
 * }>}
 */
export async function resolveToolAuthorization({ principal, storeId, tool }) {
  const toolName = typeof tool === 'string' ? tool.trim() : '';
  const entry = toolName ? getToolEntry(toolName) : null;
  const requiresStore = entry?.requiresStore === true || toolName.includes('loyalty');
  const resolvedStoreId = typeof storeId === 'string' && storeId.trim() ? storeId.trim() : null;

  if (!principal || principal.kind !== 'authenticated') {
    return {
      state: 'sign_in_required',
      userId: null,
      storeId: resolvedStoreId,
      canExecute: false,
      code: 'AUTH_REQUIRED',
      message: loyaltyAuthMessage(toolName) ?? 'Sign in to continue.',
    };
  }

  if (requiresStore && !resolvedStoreId) {
    return {
      state: 'store_selection_required',
      userId: principal.userId,
      storeId: null,
      canExecute: false,
      code: 'STORE_REQUIRED',
      message: 'Choose a store before setting up a loyalty program.',
    };
  }

  if (!resolvedStoreId) {
    return {
      state: 'authorized',
      userId: principal.userId,
      storeId: null,
      canExecute: true,
      code: null,
      message: null,
    };
  }

  const access = await assertStoreOwnership({
    storeId: resolvedStoreId,
    userId: principal.userId,
  });

  if (!access.ok) {
    const code = access.blocker?.code ?? 'BLOCKED';
    if (code === 'AUTH_REQUIRED') {
      return {
        state: 'sign_in_required',
        userId: null,
        storeId: resolvedStoreId,
        canExecute: false,
        code,
        message: access.blocker?.message ?? loyaltyAuthMessage(toolName),
      };
    }
    if (code === 'STORE_REQUIRED') {
      return {
        state: 'store_selection_required',
        userId: principal.userId,
        storeId: null,
        canExecute: false,
        code,
        message: access.blocker?.message ?? 'Choose a store before continuing.',
      };
    }
    if (code === 'STORE_ACCESS_DENIED') {
      return {
        state: 'store_access_denied',
        userId: principal.userId,
        storeId: resolvedStoreId,
        canExecute: false,
        code,
        message: access.blocker?.message ?? 'You do not have permission to update this store.',
      };
    }
    return {
      state: 'store_access_denied',
      userId: principal.userId,
      storeId: resolvedStoreId,
      canExecute: false,
      code,
      message: access.blocker?.message ?? 'This action is blocked for the current store.',
    };
  }

  return {
    state: 'authorized',
    userId: principal.userId,
    storeId: resolvedStoreId,
    canExecute: true,
    code: null,
    message: null,
  };
}

function loyaltyAuthMessage(tool) {
  const t = String(tool ?? '').trim();
  if (t === 'setup_loyalty_program' || t === 'create_loyalty_program' || t.includes('loyalty')) {
    return 'Sign in to set up a loyalty program.';
  }
  return null;
}

/**
 * Map authorization onto execution-plan payload shape (no credentials).
 * @param {Awaited<ReturnType<typeof resolveToolAuthorization>>} authorization
 * @param {Record<string, unknown>} [extra]
 */
export function buildExecutionPlanAuthorizationFields(authorization, extra = {}) {
  return {
    requiresAuthentication: true,
    authorizationState: authorization.state,
    canExecute: authorization.canExecute,
    authorizationMessage: authorization.message ?? null,
    userId: authorization.userId ?? null,
    storeId: authorization.storeId ?? extra.storeId ?? null,
    ...extra,
  };
}
