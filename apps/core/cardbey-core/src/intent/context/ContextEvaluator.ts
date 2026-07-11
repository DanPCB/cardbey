/**
 * Conditional context evaluation — only when intent.requiresBusiness === true.
 */

import { loadAccountStoreContext } from '../../lib/intake/accountStoreIntakeGate.js';
import type { ContextResult, Intent, IntentEngineInput } from '../intent.types.js';

const INTENT_TOOL_MAP: Record<string, string> = {
  create_store: 'create_store',
  create_campaign: 'create_campaign',
  analytics: 'get_store_analytics',
  manage_catalog: 'replace_store_catalog',
};

function isGuestActorId(userId: string | null | undefined): boolean {
  const id = String(userId ?? '').trim().toLowerCase();
  return !id || id.startsWith('guest_');
}

/**
 * Resolve the authenticated account owner for business table lookups.
 * Guest actor ids must not be used — stores are keyed by User.id on Business.userId.
 */
export function resolveStoreOwnerUserId(input: IntentEngineInput): string | null {
  const owner = String(input.ownerUserId ?? '').trim();
  if (owner && !isGuestActorId(owner)) return owner;

  const userId = String(input.userId ?? '').trim();
  if (userId && !isGuestActorId(userId)) return userId;

  return null;
}

function lockedToolForIntent(intent: Intent): string {
  return INTENT_TOOL_MAP[intent.type] ?? 'general_chat';
}

/**
 * Evaluate business context only when the intent requires it.
 */
export async function evaluateContext(intent: Intent, input: IntentEngineInput): Promise<ContextResult> {
  if (!intent.requiresBusiness) {
    return { status: 'not_required', storeCount: 0 };
  }

  const activeStoreId = String(input.activeStoreId ?? '').trim() || null;
  const ownerUserId = resolveStoreOwnerUserId(input);

  if (activeStoreId && ownerUserId) {
    const account = await loadAccountStoreContext(ownerUserId);
    const owned = Array.isArray(account.stores) ? account.stores : [];
    const ownsActive = owned.some(
      (s) => String(s?.id ?? s?.storeId ?? '').trim() === activeStoreId,
    );
    if (ownsActive || owned.length === 0) {
      return {
        status: 'ready',
        storeId: activeStoreId,
        storeCount: Math.max(owned.length, 1),
        stores: owned.length > 0 ? owned : undefined,
      };
    }
  } else if (activeStoreId && !ownerUserId) {
    return {
      status: 'ready',
      storeId: activeStoreId,
      storeCount: 1,
    };
  }

  if (!ownerUserId) {
    if (intent.type === 'create_store') {
      return {
        status: 'ready',
        storeCount: 0,
        message: 'Ready to create a new business.',
      };
    }
    return {
      status: 'needs_store_creation',
      storeCount: 0,
      message: "You'll need a business first. Let's create one, then we can continue.",
      lockedTool: lockedToolForIntent(intent),
    };
  }

  console.log('[ContextEvaluator] loading stores for ownerUserId:', ownerUserId);
  const account = await loadAccountStoreContext(ownerUserId);
  const stores = Array.isArray(account.stores) ? account.stores : [];
  const storeCount = stores.length;
  console.log('[ContextEvaluator] store lookup result:', {
    ownerUserId,
    storeCount,
    intent: intent.type,
  });

  if (storeCount === 0) {
    if (intent.type === 'create_store') {
      return { status: 'ready', storeCount: 0, message: 'Ready to create a new business.' };
    }
    return {
      status: 'needs_store_creation',
      storeCount: 0,
      message: "You don't have a business yet. Let's create one first, then we can continue.",
      lockedTool: lockedToolForIntent(intent),
    };
  }

  if (storeCount === 1) {
    const store = stores[0];
    const storeId = String(store?.id ?? store?.storeId ?? '').trim() || null;
    return {
      status: 'ready',
      storeId,
      storeCount: 1,
      stores,
    };
  }

  return {
    status: 'needs_store_picker',
    storeCount,
    stores,
    message: 'Which business should we work on?',
    lockedTool: lockedToolForIntent(intent),
  };
}

export class ContextEvaluator {
  async evaluate(intent: Intent, input: IntentEngineInput): Promise<ContextResult> {
    return evaluateContext(intent, input);
  }
}
