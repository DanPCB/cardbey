import { isDecisionLoopEnabled } from '../../config/features.js';

/**
 * Fast-path heuristics — skip LLM reasoner for trivial intake messages.
 */

const GREETING_PHRASES = new Set([
  'hi',
  'hello',
  'hey',
  'howdy',
  'yo',
  'hola',
  'sup',
  'hi there',
  'hello there',
  'hey there',
  'good morning',
  'good afternoon',
  'good evening',
  'what can you do',
  'what can you do?',
  'help',
  'help me',
]);

/**
 * @param {string} raw
 * @returns {string}
 */
export function normalizeIntakeMessageText(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[!?.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string} text normalized
 * @returns {boolean}
 */
export function isSimpleGreetingText(text) {
  const t = normalizeIntakeMessageText(text);
  return t.length > 0 && GREETING_PHRASES.has(t);
}

/**
 * @param {Object} [input]
 * @param {Record<string, unknown>} [classifyOpts]
 * @returns {boolean}
 */
export function shouldUseIntentFastPath(input = {}, classifyOpts = {}) {
  if (isDecisionLoopEnabled()) {
    return false;
  }

  if (String(process.env.DISABLE_LLM_REASONER_FAST_PATH ?? '').trim().toLowerCase() === 'true') {
    return false;
  }

  if (input.forceIntent || classifyOpts.forceIntent) return false;
  if (input.action || classifyOpts.action) return false;
  if (input.storeCreateForm || classifyOpts.storeCreateForm) return false;
  if (input.attachments?.length || input.imageDataUrl || input.hasAttachment) return false;
  if (classifyOpts.isSelectionConfirm) return false;

  const ctx =
    classifyOpts.currentContext &&
    typeof classifyOpts.currentContext === 'object' &&
    !Array.isArray(classifyOpts.currentContext)
      ? classifyOpts.currentContext
      : input.currentContext && typeof input.currentContext === 'object'
        ? input.currentContext
        : null;

  if (ctx?.activeMissionId && String(ctx.activeMissionId).trim()) return false;
  if (classifyOpts.missionId && String(classifyOpts.missionId).trim()) return false;

  const text = normalizeIntakeMessageText(
    input.text ?? classifyOpts.originalUserMessage ?? input.originalUserMessage ?? '',
  );
  if (!text) return false;

  if (isSimpleGreetingText(text)) return true;

  const maxWords = parseInt(process.env.LLM_REASONER_FAST_PATH_MAX_WORDS || '3', 10);
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (Number.isFinite(maxWords) && maxWords > 0 && wordCount <= maxWords) {
    return true;
  }

  return false;
}

/**
 * Fast direct-chat response for pre-intake agent loop (no LLM).
 * @param {string} locale
 * @returns {string}
 */
export function fastPathGreetingResponse(locale) {
  if (locale === 'vi') {
    return 'Xin chào! 👋 Tôi có thể giúp gì cho bạn hôm nay?';
  }
  return 'Hi there! 👋 How can I help you today?';
}
