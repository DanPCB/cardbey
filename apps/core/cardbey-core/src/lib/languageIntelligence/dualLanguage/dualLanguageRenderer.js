/**
 * DualLanguageRenderer — UI presentation helpers over DualLanguageView.
 * No I/O. No storage mutation.
 */

import {
  buildDualLanguageView,
  pickDualLanguageDisplay,
  DUAL_LANGUAGE_MODES,
} from '../contracts/dualLanguageView.js';

export const CONVERSATION_UI_ACTIONS = Object.freeze([
  'view_original',
  'view_translated',
  'view_both',
  'translate_message',
  'auto_translate_conversation',
]);

/**
 * @param {import('../contracts/dualLanguageView.js').DualLanguageView} view
 * @param {'original'|'translated'|'both'} mode
 */
export function withViewMode(view, mode) {
  const nextMode = DUAL_LANGUAGE_MODES.includes(mode) ? mode : view.mode;
  return buildDualLanguageView({
    mode: nextMode,
    originalLanguage: view.originalLanguage,
    originalText: view.originalText,
    localizedLanguage: view.localizedLanguage,
    localizedText: view.localizedText,
    showTranslatedByAttribution: nextMode !== 'original',
  });
}

/**
 * Render payload for clients (chat bubbles, product titles, etc.).
 * @param {import('../contracts/dualLanguageView.js').DualLanguageView} view
 */
export function renderDualLanguage(view) {
  const display = pickDualLanguageDisplay(view);
  const canToggleOriginal =
    view.localizedText != null &&
    view.localizedText !== view.originalText &&
    view.mode !== 'original';

  return Object.freeze({
    primary: display.primary,
    secondary: display.secondary,
    mode: view.mode,
    originalLanguage: view.originalLanguage,
    localizedLanguage: view.localizedLanguage,
    attribution: view.showTranslatedByAttribution
      ? view.attributionLabel || 'Translated by Cardbey AI'
      : null,
    actions: Object.freeze({
      viewOriginal: canToggleOriginal,
      viewTranslated: view.mode === 'original' && view.localizedText != null,
      viewBoth: view.localizedText != null,
      translateMessage: view.localizedText == null,
    }),
    labels: Object.freeze({
      viewOriginal: 'View Original',
      viewTranslated: 'View Translation',
      viewBoth: 'Show Both',
      translatedBy: 'Translated by Cardbey AI',
      autoTranslateConversation: 'Auto Translate Conversation',
      translateMessage: 'Translate Message',
    }),
  });
}

/**
 * Conversation-level UI preference envelope (not persisted in Phase 3).
 * @param {object} [prefs]
 */
export function buildConversationTranslatePrefs(prefs = {}) {
  return Object.freeze({
    autoTranslateConversation: Boolean(prefs.autoTranslateConversation),
    defaultMode: DUAL_LANGUAGE_MODES.includes(prefs.defaultMode) ? prefs.defaultMode : 'translated',
    showAttribution: prefs.showAttribution !== false,
  });
}
