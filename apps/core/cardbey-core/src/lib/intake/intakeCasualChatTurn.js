/**
 * Casual / greeting turns — must not inherit stale upload session state.
 *
 * @deprecated Replaced by intent-first classification (src/intent/classifier/IntentClassifier.ts).
 * Legacy route short-circuit remains until INTENT_ENGINE_PRIMARY=true (Phase 2).
 */
const CASUAL_CHAT_RE = /^(hi|hello|hey|thanks|thank you|yo|sup|good\s+(morning|afternoon|evening))$/i;

const HELP_CHAT_RE =
  /^(help|i need help|what can you do(?:\s+today)?\??|how (?:do|can) i(?:\s+[^?.!]{0,40})?\??|support|guide(?:\s+me)?|answer a question\.?|\.\.?)$/i;

/**
 * @param {string} message
 */
export function isCasualChatTurn(message) {
  const msg = String(message ?? '').trim();
  return msg.length > 0 && CASUAL_CHAT_RE.test(msg);
}

/** Greetings + help/capability turns — open chat, not store onboarding. */
export function isGeneralPerformerChatTurn(message) {
  const msg = String(message ?? '').trim();
  if (!msg) return false;
  if (isCasualChatTurn(msg)) return true;
  return HELP_CHAT_RE.test(msg);
}

const INTENT_SIGNAL_RE =
  /\b(add|create|upload|publish|launch|start|setup|set\s*up|run|make|build|campaign|product|menu|loyalty|analytics|store|business|promotion|graphic|catalog|order|book|service|website|signage|device|poster|hero|banner|video|scan|import|delete|remove|update|edit|change|show|view|list|find|search|help|new)\b/i;

/**
 * Low-signal turns (gibberish, random tokens) — Personal Space chat, not store picker.
 *
 * @param {string} message
 */
export function isAmbiguousPerformerTurn(message) {
  const msg = String(message ?? '').trim();
  if (!msg || isGeneralPerformerChatTurn(msg)) return false;
  if (INTENT_SIGNAL_RE.test(msg)) return false;
  if (/^[\p{L}\p{M}\p{N}'-]+(?:\s+[\p{L}\p{M}\p{N}'-]+){0,4}$/u.test(msg)) {
    return msg.length <= 48;
  }
  return false;
}

/** Greetings, help, or ambiguous input — always open chat at intake front door. */
export function isOpenPerformerChatTurn(message) {
  return isGeneralPerformerChatTurn(message) || isAmbiguousPerformerTurn(message);
}
