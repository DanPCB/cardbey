/**
 * Casual / greeting turns — must not inherit stale upload session state.
 */

const CASUAL_CHAT_RE = /^(hi|hello|hey|thanks|thank you|yo|sup|good\s+(morning|afternoon|evening))$/i;

/**
 * @param {string} message
 */
export function isCasualChatTurn(message) {
  const msg = String(message ?? '').trim();
  return msg.length > 0 && CASUAL_CHAT_RE.test(msg);
}
