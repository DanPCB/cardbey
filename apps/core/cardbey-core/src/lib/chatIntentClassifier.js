/**
 * Chat intent classifier (v0 heuristics): decide if a user chat message should trigger agent dispatch.
 * Used with AUTO_DISPATCH_ON_CHAT; when true, only actionable messages trigger handleUserTurn.
 * Does not affect explicit Continue/Execute or approval flows.
 */

const AUTO_DISPATCH_ON_CHAT = process.env.AUTO_DISPATCH_ON_CHAT === 'true';

/** Minimum length for a message to be considered actionable (avoids "ok", "x", etc.) */
const MIN_ACTIONABLE_LENGTH = 10;

/** Substrings that indicate chitchat / non-actionable (case-insensitive) */
const CHITCHAT_PATTERNS = [
  /^test\s*$/i,
  /^hi\s*$/i,
  /^hey\s*$/i,
  /^hello\s*$/i,
  /^thanks?\s*$/i,
  /^thank you\s*$/i,
  /^ok\s*$/i,
  /^okay\s*$/i,
  /^yes\s*$/i,
  /^no\s*$/i,
  /^cool\s*$/i,
  /^great\s*$/i,
  /^nice\s*$/i,
  /^sure\s*$/i,
];

/** Verbs that indicate actionable intent (message must contain at least one) */
const ACTIONABLE_VERBS = [
  'create',
  'generate',
  'fix',
  'plan',
  'run',
  'publish',
  'schedule',
  'make',
  'build',
  'launch',
  'start',
  'draft',
  'repair',
  'update',
  'change',
  'add',
  'remove',
  'design',
  'write',
];

/**
 * Returns true if the message is short or matches chitchat and should not trigger dispatch.
 * @param {string} text - User message text
 * @returns {boolean} - True if message should be treated as chat-only (no dispatch)
 */
function isChitchatOrTooShort(text) {
  const t = typeof text === 'string' ? text.trim() : '';
  if (t.length < MIN_ACTIONABLE_LENGTH) return true;
  return CHITCHAT_PATTERNS.some((re) => re.test(t));
}

/**
 * Returns true if the message looks actionable (contains dispatch verbs).
 * @param {string} text - User message text
 * @returns {boolean}
 */
function isMessageActionable(text) {
  const t = (typeof text === 'string' ? text : '').toLowerCase();
  if (!t || t.length < MIN_ACTIONABLE_LENGTH) return false;
  return ACTIONABLE_VERBS.some((verb) => t.includes(verb));
}

/**
 * Whether auto-dispatch on chat is enabled (env: AUTO_DISPATCH_ON_CHAT, default false).
 * @returns {boolean}
 */
function isAutoDispatchOnChatEnabled() {
  return AUTO_DISPATCH_ON_CHAT;
}

/**
 * Should we call handleUserTurn (dispatch planner/research) for this user message?
 * Returns true only when: AUTO_DISPATCH_ON_CHAT is true, message is actionable, and not chitchat/short.
 * Caller must also check chain state (waiting_approval / running) before dispatching.
 *
 * @param {string} text - User message text
 * @returns {{ shouldDispatch: boolean, reason?: string }}
 */
function shouldDispatchOnChatMessage(text) {
  if (!isAutoDispatchOnChatEnabled()) {
    return { shouldDispatch: false, reason: 'AUTO_DISPATCH_ON_CHAT is false' };
  }
  if (isChitchatOrTooShort(text)) {
    return { shouldDispatch: false, reason: 'message too short or chitchat' };
  }
  if (!isMessageActionable(text)) {
    return { shouldDispatch: false, reason: 'message does not match actionable intent' };
  }
  return { shouldDispatch: true };
}

export {
  isAutoDispatchOnChatEnabled,
  isChitchatOrTooShort,
  isMessageActionable,
  shouldDispatchOnChatMessage,
  MIN_ACTIONABLE_LENGTH,
};
