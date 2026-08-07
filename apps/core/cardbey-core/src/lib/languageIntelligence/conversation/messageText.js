/**
 * Extract canonical text from chat message shapes without mutating them.
 */

/**
 * @param {unknown} message  AgentMessage | ConversationMessage | plain { id, content|text }
 * @returns {{ text: string, field: string }}
 */
export function extractCanonicalMessageText(message) {
  if (!message || typeof message !== 'object') {
    return { text: '', field: 'content' };
  }
  const m = /** @type {Record<string, unknown>} */ (message);

  if (typeof m.text === 'string') {
    return { text: m.text, field: 'text' };
  }

  if (typeof m.content === 'string') {
    return { text: m.content, field: 'content' };
  }

  if (m.content && typeof m.content === 'object' && !Array.isArray(m.content)) {
    const c = /** @type {Record<string, unknown>} */ (m.content);
    if (typeof c.text === 'string') return { text: c.text, field: 'text' };
    if (typeof c.content === 'string') return { text: c.content, field: 'content' };
    if (typeof c.body === 'string') return { text: c.body, field: 'body' };
  }

  if (typeof m.body === 'string') {
    return { text: m.body, field: 'body' };
  }

  return { text: '', field: 'content' };
}

/**
 * @param {unknown} message
 * @returns {string}
 */
export function extractMessageId(message) {
  if (!message || typeof message !== 'object') return '';
  const m = /** @type {Record<string, unknown>} */ (message);
  return String(m.id ?? m.messageId ?? '');
}
