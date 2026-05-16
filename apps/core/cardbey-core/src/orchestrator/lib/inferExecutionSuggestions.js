/**
 * Infer actionable execution suggestions from a plan_update payload (v0 heuristic).
 * Risk (R0–R3) and requiresApproval come from intentRiskMap (single source of truth).
 */

import { getRiskForIntent, requiresApprovalForRisk } from '../../lib/intentRiskMap.js';

/**
 * @param {{ steps?: string[] } | null | undefined} planPayload - plan_update.payload
 * @returns {{ id: string, label: string, agentKey: string, intent: string, risk: 'R0'|'R1'|'R2'|'R3', requiresApproval: boolean }[]}
 */
export function inferExecutionSuggestions(planPayload) {
  const steps = Array.isArray(planPayload?.steps) ? planPayload.steps : [];
  const out = [];
  const seen = new Set();
  let index = 0;

  const add = (label, agentKey, intent) => {
    const key = `${agentKey}:${intent}:${label.slice(0, 40)}`;
    if (seen.has(key)) return;
    seen.add(key);
    const risk = getRiskForIntent(intent);
    out.push({
      id: `s${index}`,
      label,
      agentKey,
      intent,
      risk,
      requiresApproval: requiresApprovalForRisk(risk),
    });
    index += 1;
  };

  for (const step of steps) {
    const s =
      step && typeof step === 'object' && step.label != null
        ? String(step.label)
        : (step && String(step)) || '';
    const lower = s.toLowerCase();
    const label = s.slice(0, 80) || 'Step';
    let added = false;

    // One suggestion per step: first matching intent wins (avoids duplicate tasks e.g. "email" + "marketing").
    if (/\b(research|explore)\b/i.test(lower) || /visit\s+suppliers/i.test(lower)) {
      add(label, 'research', 'research');
      added = true;
    }
    if (!added && /\b(contact|email)\b/i.test(lower)) {
      add(label, 'planner', 'generate_contact_template');
      added = true;
    }
    if (!added && /\bmarketing\b/i.test(lower)) {
      add(label, 'planner', 'campaign_plan');
      added = true;
    }
    if (!added && /\blayout\b/i.test(lower)) {
      add(label, 'planner', 'store_layout_plan');
      added = true;
    }
    // v0 intent executors (keyword heuristics)
    if (!added && /\bcanva\b/i.test(lower)) {
      add(label, 'planner', 'create_canva_brief');
      added = true;
    }
    if (!added && (/\bpost\s*calendar\b|\bcalendar\s*post\b|14\s*day\s*calendar/i.test(lower) || (/\bcalendar\b/i.test(lower) && /\bpost\b/i.test(lower)))) {
      add(label, 'planner', 'generate_post_calendar');
      added = true;
    }
    if (!added && (/\bads?\s*plan\b|weeks?\s*2\s*[-–]?\s*4|ads\s*weeks/i.test(lower))) {
      add(label, 'planner', 'ads_plan_weeks_2_4');
      added = true;
    }
    if (!added && (/\bweekly\s*report\b|report\s*template\b|setup\s*reporting/i.test(lower))) {
      add(label, 'planner', 'setup_weekly_reporting');
      added = true;
    }
    if (!added && (/\blead\s*follow\s*up\b|follow\s*up\s*playbook\b|followup\s*playbook/i.test(lower))) {
      add(label, 'planner', 'lead_followup_playbook');
      added = true;
    }
    if (!added && label.trim()) {
      add(label, 'planner', 'follow_up');
    }
  }

  return out;
}
