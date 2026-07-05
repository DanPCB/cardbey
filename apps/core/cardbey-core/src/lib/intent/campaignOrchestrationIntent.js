/**
 * Campaign phrase detection — shared by IntentReasoner and intake routing.
 */

const CAMPAIGN_ORCHESTRATION_PATTERNS = [
  /\bcreate\s+a?\s*(winter|summer|spring|autumn|seasonal|holiday|flash|sale|launch|weekend|brunch)\s+campaign/i,
  /\bcampaign\s+for\s+/i,
  /\brun\s+a?\s*campaign/i,
  /\bmulti.?agent/i,
  /\borchestrat/i,
  /\bfull\s+campaign/i,
  /\bpromotional\s+campaign/i,
  /\bmarketing\s+campaign/i,
  /\blaunch\s+campaign\b/i,
  /\bcontent\s+(plan|strategy|calendar)/i,
];

/** Natural-language create/launch with words before "campaign" (e.g. brunch promotion campaign). */
const CAMPAIGN_CREATION_PATTERNS = [
  /\b(create|launch|start|run|build|make)\s+(?:a\s+)?(?:[\w'-]+\s+){0,10}(?:promotion(?:al)?\s+)?campaign\b/i,
  /\b(?:promotion(?:al)?|marketing|promo)\s+campaign\b/i,
  /\bcampaign\s+for\s+(?:my\s+)?(?:store|business|shop)\b/i,
  /create\s+(?:a\s+)?campaign/i,
  /launch\s+(?:a\s+)?campaign/i,
  /start\s+(?:a\s+)?campaign/i,
  /new\s+campaign/i,
  /promo\s+campaign/i,
];

/** @param {string} text */
function isInformationalCampaignQuestion(text) {
  return /^(what|how|why|when|where|who|explain|tell me|define|describe)\b/i.test(text);
}

/** @param {string} text */
function hasCampaignActionVerb(text) {
  return /\b(create|launch|start|run|build|make|setup|set up|plan|orchestrat|multi.?agent)\b/i.test(
    text,
  );
}

/** @param {string | null | undefined} message */
export function isCampaignOrchestrationIntent(message) {
  return CAMPAIGN_ORCHESTRATION_PATTERNS.some((p) => p.test(message ?? ''));
}

/**
 * Broad campaign-creation detection for IntentReasoner (restores pre-gate phrase coverage).
 * @param {string | null | undefined} message
 */
export function detectCampaignCreationIntent(message) {
  const text = String(message ?? '').trim();
  if (!text || isInformationalCampaignQuestion(text)) return false;
  if (CAMPAIGN_CREATION_PATTERNS.some((p) => p.test(text))) return true;
  return isCampaignOrchestrationIntent(text) && hasCampaignActionVerb(text);
}
