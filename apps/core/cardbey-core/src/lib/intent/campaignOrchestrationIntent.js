/**
 * Campaign orchestration phrase detection (pre-reasoner route shortcut).
 */

const CAMPAIGN_ORCHESTRATION_PATTERNS = [
  /\bcreate\s+a?\s*(winter|summer|spring|autumn|seasonal|holiday|flash|sale|launch)\s+campaign/i,
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

/** @param {string | null | undefined} message */
export function isCampaignOrchestrationIntent(message) {
  return CAMPAIGN_ORCHESTRATION_PATTERNS.some((p) => p.test(message ?? ''));
}
