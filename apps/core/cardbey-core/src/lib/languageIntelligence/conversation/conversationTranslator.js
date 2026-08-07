/**
 * ConversationTranslator — WeChat-style on-read translation.
 *
 * Sender writes → store original → translate for viewer → DualLanguageView.
 * NEVER mutates stored message content.
 */

import { normalizeLanguageCode } from '../contracts/languageCode.js';
import { buildDualLanguageView } from '../contracts/dualLanguageView.js';
import { detectLegacyMessageLocale } from '../adapters/localePromptAdapter.js';
import { resolveLanguage } from '../resolution/languageResolver.js';
import { translateField } from '../engine/translationEngine.js';
import { isLanguageIntelligenceConversationV1Enabled } from '../flags.js';
import {
  renderDualLanguage,
  withViewMode,
  buildConversationTranslatePrefs,
} from '../dualLanguage/index.js';
import { extractCanonicalMessageText, extractMessageId } from './messageText.js';

export const CONVERSATION_TRANSLATOR_VERSION = 'conversation-translator-v1';

/**
 * @typedef {Object} LocalizeMessageInput
 * @property {object} message
 * @property {string} [targetLanguage]
 * @property {string} [sourceLanguage]
 * @property {'original'|'translated'|'both'} [mode]
 * @property {boolean} [autoTranslate]  When false, return original-only view
 * @property {boolean} [forceRefresh]
 * @property {string} [entityType]  agentMessage | conversationMessage
 * @property {import('../resolution/languageResolver.js').ResolveLanguageInput} [languageHints]
 */

/**
 * Localize a single message for a viewer. Does not write to DB.
 * @param {LocalizeMessageInput} input
 */
export async function localizeMessage(input) {
  const message = input.message;
  const { text, field } = extractCanonicalMessageText(message);
  const messageId = extractMessageId(message) || `anon-${Date.now()}`;
  const sourceLanguage =
    normalizeLanguageCode(input.sourceLanguage) || detectLegacyMessageLocale(text);

  const resolved = resolveLanguage({
    ...(input.languageHints || {}),
    explicitLanguage: input.targetLanguage ?? input.languageHints?.explicitLanguage,
  });
  const targetLanguage = resolved.language;
  const prefs = buildConversationTranslatePrefs({
    autoTranslateConversation: input.autoTranslate !== false,
    defaultMode: input.mode || 'translated',
  });

  if (!prefs.autoTranslateConversation || sourceLanguage === targetLanguage || !text.trim()) {
    const view = buildDualLanguageView({
      mode: 'original',
      originalLanguage: sourceLanguage,
      originalText: text,
      localizedLanguage: targetLanguage,
      localizedText: null,
      showTranslatedByAttribution: false,
    });
    return Object.freeze({
      messageId,
      canonicalPreserved: true,
      sourceLanguage,
      targetLanguage,
      skipped: !text.trim() ? 'empty' : sourceLanguage === targetLanguage ? 'same_language' : 'auto_off',
      dualLanguageView: view,
      render: renderDualLanguage(view),
      record: null,
    });
  }

  const result = await translateField({
    entityType: input.entityType || 'agentMessage',
    entityId: messageId,
    field,
    sourceText: text,
    sourceLanguage,
    revision: message?.updatedAt || message?.createdAt || message?.seq || 1,
    targetLanguage,
    contentClass: 'conversation',
    forceRefresh: input.forceRefresh,
  });

  const view = withViewMode(result.view, prefs.defaultMode);

  return Object.freeze({
    messageId,
    canonicalPreserved: true,
    sourceLanguage,
    targetLanguage,
    skipped: null,
    dualLanguageView: view,
    render: renderDualLanguage(view),
    record: result.record,
    fromCache: result.fromCache,
  });
}

/**
 * Localize a conversation thread for a viewer.
 * @param {object} input
 * @param {object[]} input.messages
 * @param {string} [input.targetLanguage]
 * @param {boolean} [input.autoTranslateConversation]
 * @param {'original'|'translated'|'both'} [input.mode]
 * @param {number} [input.maxMessages]
 * @param {import('../resolution/languageResolver.js').ResolveLanguageInput} [input.languageHints]
 * @param {boolean} [input.force]
 */
export async function localizeConversation(input) {
  if (!input.force && !isLanguageIntelligenceConversationV1Enabled()) {
    return Object.freeze({
      enabled: false,
      version: CONVERSATION_TRANSLATOR_VERSION,
      results: [],
      canonicalPreserved: true,
    });
  }

  const max = Math.min(Math.max(Number(input.maxMessages) || 50, 1), 100);
  const messages = Array.isArray(input.messages) ? input.messages.slice(0, max) : [];
  const prefs = buildConversationTranslatePrefs({
    autoTranslateConversation: input.autoTranslateConversation !== false,
    defaultMode: input.mode || 'translated',
  });

  const results = [];
  for (const message of messages) {
    // Sequential to reuse cache cleanly; batch provider path can be added later.
    // eslint-disable-next-line no-await-in-loop
    const localized = await localizeMessage({
      message,
      targetLanguage: input.targetLanguage,
      mode: prefs.defaultMode,
      autoTranslate: prefs.autoTranslateConversation,
      languageHints: input.languageHints,
      forceRefresh: input.forceRefresh,
    });
    results.push(localized);
  }

  return Object.freeze({
    enabled: true,
    version: CONVERSATION_TRANSLATOR_VERSION,
    targetLanguage: resolveLanguage({
      ...(input.languageHints || {}),
      explicitLanguage: input.targetLanguage,
    }).language,
    autoTranslateConversation: prefs.autoTranslateConversation,
    mode: prefs.defaultMode,
    results: Object.freeze(results),
    canonicalPreserved: true,
    labels: Object.freeze({
      viewOriginal: 'View Original',
      translatedBy: 'Translated by Cardbey AI',
      autoTranslateConversation: 'Auto Translate Conversation',
      translateMessage: 'Translate Message',
    }),
  });
}

/**
 * Attach languageIntelligence side-channel onto message DTOs (does not alter content).
 * @param {object[]} messages
 * @param {Awaited<ReturnType<typeof localizeConversation>>} localized
 */
export function attachConversationLocalization(messages, localized) {
  const byId = new Map((localized.results || []).map((r) => [r.messageId, r]));
  return (messages || []).map((msg) => {
    const id = extractMessageId(msg);
    const loc = byId.get(id);
    if (!loc) return msg;
    return {
      ...msg,
      languageIntelligence: Object.freeze({
        dualLanguageView: loc.dualLanguageView,
        render: loc.render,
        sourceLanguage: loc.sourceLanguage,
        targetLanguage: loc.targetLanguage,
        skipped: loc.skipped,
        canonicalPreserved: true,
      }),
    };
  });
}
