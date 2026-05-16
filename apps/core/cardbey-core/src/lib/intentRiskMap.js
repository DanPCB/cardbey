/**
 * Risk taxonomy for execution suggestions (R0–R3). Single source of truth for intent → risk.
 * Used by inferExecutionSuggestions and maybeAutoDispatch. Default permissive (R1) for unknown intents.
 */

/** @type {Record<string, 'R0'|'R1'|'R2'|'R3'>} */
const INTENT_RISK_MAP = {
  research: 'R1',
  campaign_plan: 'R1',
  store_layout_plan: 'R2',
  generate_contact_template: 'R3',
  // v0 intent executors (artifact-only)
  create_canva_brief: 'R1',
  generate_post_calendar: 'R1',
  ads_plan_weeks_2_4: 'R1',
  setup_weekly_reporting: 'R1',
  lead_followup_playbook: 'R1',
};

const VALID_RISKS = ['R0', 'R1', 'R2', 'R3'];

/**
 * Get risk level for an intent. Default R1 for unknown (permissive for existing manual flows).
 *
 * @param {string} intent
 * @returns {'R0'|'R1'|'R2'|'R3'}
 */
export function getRiskForIntent(intent) {
  if (!intent || typeof intent !== 'string') return 'R1';
  const key = intent.trim();
  const risk = INTENT_RISK_MAP[key];
  if (VALID_RISKS.includes(risk)) return risk;
  return 'R1';
}

/**
 * Whether this risk level requires explicit user approval before running (R3).
 *
 * @param {string} risk
 * @returns {boolean}
 */
export function requiresApprovalForRisk(risk) {
  return risk === 'R3';
}

export { VALID_RISKS, INTENT_RISK_MAP };
