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
  if (activeStoreId) {
    return {
      status: 'ready',
      storeId: activeStoreId,
      storeCount: 1,
    };
  }

  const userId = String(input.userId ?? '').trim() || null;
  if (!userId || userId.startsWith('guest_')) {
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

  const account = await loadAccountStoreContext(userId);
  const stores = Array.isArray(account.stores) ? account.stores : [];
  const storeCount = stores.length;

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
