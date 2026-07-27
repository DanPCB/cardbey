/**
 * Phase 3 — Resolve pre-classify shortcut signals for IntentReasoner context.
 * Detection only; execution stays in the unified intake pipeline after reasoning.
 */

import { areIntakeShortcutsAllowed } from '../runtime/kernelMandatory.js';
import { detectIntent } from './intakeSystemShortcuts.js';
import {
  classifyStoreWebsiteCreateIntent,
  isGuestAllowedStoreWebsiteIntent,
} from './storeWebsiteRunwayClassifier.js';
import {
  resolveCreateStoreShortcut,
  shouldPreserveCreateStoreShortcutWhenKernelMandatory,
} from '../intent/storeCreateFastPath.js';
import { isCasualChatTurn } from './intakeCasualChatTurn.js';

/**
 * @typedef {{
 *   type: 'create_store' | 'clarify_create_runway' | 'auth_required' | 'missing_store',
 *   intentMode?: 'store' | 'website',
 *   intentLabel?: string,
 *   message?: string,
 * } | null} IntakeShortcutContext
 */

/**
 * @param {object} input
 * @param {string} [input.userMessage]
 * @param {object} [input.storeCreateForm]
 * @param {string} [input.primaryMode]
 * @param {string} [input.primaryModeHint]
 * @param {string} [input.intentSource]
 * @param {string} [input.forceIntent]
 * @param {string} [input.currentFlow]
 * @param {{ userId?: string | null, isGuest?: boolean }} [input.auth]
 * @returns {IntakeShortcutContext}
 */
export function resolveIntakeShortcutContext(input = {}) {
  const userMessage = String(input.userMessage ?? '').trim();
  if (isCasualChatTurn(userMessage)) {
    return null;
  }
  const storeCreateForm =
    input.storeCreateForm && typeof input.storeCreateForm === 'object' && !Array.isArray(input.storeCreateForm)
      ? input.storeCreateForm
      : undefined;

  let shortcut = detectIntent({
    userMessage,
    auth: input.auth ?? {},
    primaryMode: input.primaryMode,
    primaryModeHint: input.primaryModeHint,
    intentSource: input.intentSource,
    storeCreateForm,
  });

  if (!shortcut?.type) {
    shortcut = resolveCreateStoreShortcut({
      userMessage,
      storeCreateForm,
      primaryMode: input.primaryMode,
      intentSource: input.intentSource,
      forceIntent: input.forceIntent,
      currentFlow: input.currentFlow,
    });
  }

  if (!areIntakeShortcutsAllowed()) {
    const preserveStoreShortcut = shouldPreserveCreateStoreShortcutWhenKernelMandatory(shortcut, {
      userMessage,
      storeCreateForm,
      primaryMode: input.primaryMode,
      intentSource: input.intentSource,
    });
    if (!preserveStoreShortcut) {
      shortcut = null;
    }
  }

  if (
    !shortcut?.type &&
    shouldPreserveCreateStoreShortcutWhenKernelMandatory(null, {
      userMessage,
      storeCreateForm,
      primaryMode: input.primaryMode,
      intentSource: input.intentSource,
    })
  ) {
    shortcut = resolveCreateStoreShortcut({
      userMessage,
      storeCreateForm,
      primaryMode: input.primaryMode,
      intentSource: input.intentSource,
      forceIntent: input.forceIntent,
      currentFlow: input.currentFlow,
    });
  }

  if (!shortcut?.type && userMessage && isGuestAllowedStoreWebsiteIntent(userMessage)) {
    const runway = classifyStoreWebsiteCreateIntent(userMessage);
    if (!runway.ambiguous && runway.intentMode) {
      shortcut = {
        type: 'create_store',
        intentMode: runway.intentMode,
        ...(runway.label ? { intentLabel: runway.label } : {}),
      };
    }
  }

  return shortcut ?? null;
}
