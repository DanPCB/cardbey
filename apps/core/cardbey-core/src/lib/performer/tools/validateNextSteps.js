/**
 * DANH: validate_and_fix_next_steps — deterministic next-step shape repair for post–store-build missions.
 */

import { TOOLS } from '../../toolRegistry.js';

/** @typedef {{ order: number, title: string, action: string, description?: string, mission_id: string, actionId?: string }} NextStep */

/** @typedef {{ step: string, issue: string, fix_applied: string }} ValidationIssue */

/** @typedef {{ mission_id: string, steps_checked: number, issues_found: ValidationIssue[], steps_final: NextStep[], status: 'clean' | 'fixed' | 'needs_manual_review' }} ValidationReport */

const ACTION_ALIASES = new Map([
  ['connect_domain', 'general_chat'],
  ['update_products', 'replace_store_catalog'],
  ['review_performance', 'analyze_store'],
]);

/** Registry tool names + common post-creation aliases. */
const VALID_ACTION_KEYS = new Set([
  ...TOOLS.map((t) => t.toolName),
  'general_chat',
  'connect_domain',
  'update_products',
  'review_performance',
]);

const POST_CREATION_ORDER = ['replace_store_catalog', 'connect_domain', 'analyze_store'];

/**
 * @param {unknown} raw
 * @returns {NextStep[]}
 */
export function normalizeInputSteps(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => {
    if (!item || typeof item !== 'object') {
      return {
        order: index + 1,
        title: 'Review next step',
        action: 'general_chat',
        mission_id: '',
      };
    }
    const row = /** @type {Record<string, unknown>} */ (item);
    const title =
      (typeof row.title === 'string' && row.title.trim()) ||
      (typeof row.label === 'string' && row.label.trim()) ||
      'Review next step';
    const action =
      (typeof row.action === 'string' && row.action.trim()) ||
      (typeof row.suggestedTool === 'string' && row.suggestedTool.trim()) ||
      (typeof row.tool === 'string' && row.tool.trim()) ||
      'general_chat';
    const description =
      (typeof row.description === 'string' && row.description) ||
      (typeof row.prompt === 'string' && row.prompt) ||
      undefined;
    const mission_id =
      (typeof row.mission_id === 'string' && row.mission_id) ||
      (typeof row.missionId === 'string' && row.missionId) ||
      '';
    const order = typeof row.order === 'number' && row.order >= 1 ? row.order : index + 1;
    const actionId = typeof row.actionId === 'string' && row.actionId.trim() ? row.actionId.trim() : undefined;
    return { order, title, action, description, mission_id, ...(actionId ? { actionId } : {}) };
  });
}

/**
 * @param {NextStep[]} steps
 * @returns {Array<{ label: string, prompt: string, suggestedTool: string, actionId?: string }>}
 */
export function nextStepsToHints(steps) {
  return steps.map((s) => {
    let suggestedTool = s.action;
    let actionId = s.actionId;
    if (s.action === 'connect_domain') {
      suggestedTool = 'general_chat';
      actionId = actionId || 'custom_domain';
    }
    if (ACTION_ALIASES.has(s.action)) {
      suggestedTool = ACTION_ALIASES.get(s.action) || s.action;
    }
    return {
      label: s.title,
      prompt: s.description || s.title,
      suggestedTool,
      ...(actionId ? { actionId } : {}),
    };
  });
}

/**
 * @param {NextStep[]} steps
 * @param {string} mission_id
 * @returns {ValidationReport}
 */
export function validateAndFixNextSteps(steps, mission_id) {
  const mid = typeof mission_id === 'string' ? mission_id.trim() : '';
  const input = Array.isArray(steps) ? steps : [];
  if (input.length === 0) {
    return {
      mission_id: mid,
      steps_checked: 0,
      issues_found: [],
      steps_final: [],
      status: 'clean',
    };
  }

  /** @type {ValidationIssue[]} */
  const issues = [];

  let fixed = input.map((step, index) => {
    const stepIssues = [];
    /** @type {NextStep} */
    let fixedStep = { ...step };

    if (!step.mission_id || step.mission_id !== mid) {
      stepIssues.push('wrong or missing mission_id');
      fixedStep.mission_id = mid;
    }

    const canonicalAction = ACTION_ALIASES.get(step.action) || step.action;
    if (!VALID_ACTION_KEYS.has(step.action) && !VALID_ACTION_KEYS.has(canonicalAction)) {
      stepIssues.push(`unknown action key: ${step.action}`);
      const inferred = inferActionKey(step.title);
      if (inferred) {
        fixedStep.action = inferred;
      } else {
        issues.push({
          step: step.title,
          issue: `Invalid action key "${step.action}" could not be inferred`,
          fix_applied: 'flagged for manual review',
        });
      }
    } else if (ACTION_ALIASES.has(step.action)) {
      fixedStep.action = step.action;
    }

    if (!step.order || step.order < 1) {
      stepIssues.push('missing display order');
      const orderIdx = POST_CREATION_ORDER.indexOf(fixedStep.action);
      fixedStep.order = orderIdx >= 0 ? orderIdx + 1 : index + 1;
    }

    if (!step.title || step.title.length > 50) {
      stepIssues.push('title missing or too long');
      fixedStep.title = step.title?.slice(0, 50) || 'Review next step';
    }

    if (stepIssues.length > 0) {
      issues.push({
        step: step.title || `step_${index}`,
        issue: stepIssues.join(', '),
        fix_applied: JSON.stringify(fixedStep),
      });
    }

    return fixedStep;
  });

  fixed = fixed.sort((a, b) => {
    const orderDiff = a.order - b.order;
    if (orderDiff !== 0) return orderDiff;
    const ra = POST_CREATION_ORDER.indexOf(a.action);
    const rb = POST_CREATION_ORDER.indexOf(b.action);
    const rankA = ra >= 0 ? ra : POST_CREATION_ORDER.length;
    const rankB = rb >= 0 ? rb : POST_CREATION_ORDER.length;
    return rankA - rankB;
  });
  fixed = fixed.map((step, i) => ({ ...step, order: i + 1 }));

  const hasUnresolved = issues.some((i) => i.fix_applied === 'flagged for manual review');

  return {
    mission_id: mid,
    steps_checked: input.length,
    issues_found: issues,
    steps_final: fixed,
    status: issues.length === 0 ? 'clean' : hasUnresolved ? 'needs_manual_review' : 'fixed',
  };
}

/**
 * @param {string} title
 * @returns {string | null}
 */
function inferActionKey(title) {
  const lower = String(title ?? '').toLowerCase();
  if (lower.includes('catalog') || lower.includes('product') || lower.includes('menu')) {
    return 'replace_store_catalog';
  }
  if (lower.includes('domain')) return 'connect_domain';
  if (lower.includes('performance') || lower.includes('analyz') || lower.includes('analytics')) {
    return 'analyze_store';
  }
  if (lower.includes('hero') || lower.includes('banner') || lower.includes('image')) {
    return 'update_store_hero';
  }
  if (lower.includes('logo')) return 'upload_store_asset';
  if (lower.includes('publish')) return 'publish_store';
  if (lower.includes('chat')) return 'general_chat';
  return null;
}

/**
 * Performer UI: true while the latest pending event has pending=true.
 * @param {Array<{ eventType?: string, payload?: unknown }>} events
 * @returns {boolean}
 */
export function isNextStepsValidationPending(events) {
  if (!Array.isArray(events)) return false;
  let latest = null;
  for (const e of events) {
    if (e?.eventType !== 'next_steps_validation_pending') continue;
    const p = e.payload && typeof e.payload === 'object' && !Array.isArray(e.payload) ? e.payload : {};
    latest = p;
  }
  return Boolean(latest && latest.pending === true);
}

const WAITING_FOR_HINTS_MS = 5000;

/**
 * @param {Array<{ eventType?: string, payload?: unknown }>} events
 * @param {string} eventType
 * @returns {{ eventType?: string, payload?: unknown } | null}
 */
export function lastBlackboardEvent(events, eventType) {
  if (!Array.isArray(events)) return null;
  let latest = null;
  for (const e of events) {
    if (e?.eventType === eventType) latest = e;
  }
  return latest;
}

/**
 * DANH: validate_and_fix_next_steps — Performer UI derive state from blackboard + missionCompletedAt.
 * @param {Array<{ eventType?: string, payload?: unknown }>} events
 * @param {string|Date|number|null|undefined} missionCompletedAt
 * @returns {{ state: 'WAITING_FOR_HINTS'|'VALIDATION_PENDING'|'MANUAL_REVIEW'|'READY', hints: unknown[], review?: unknown }}
 */
export function deriveNextStepsState(events, missionCompletedAt) {
  const hintsEv = lastBlackboardEvent(events, 'next_action_hints');
  const pendingEv = lastBlackboardEvent(events, 'next_steps_validation_pending');
  const reviewEv = lastBlackboardEvent(events, 'next_steps_manual_review');

  const hintsPayload =
    hintsEv?.payload && typeof hintsEv.payload === 'object' && !Array.isArray(hintsEv.payload)
      ? hintsEv.payload
      : null;
  const hints = Array.isArray(/** @type {{ hints?: unknown[] }} */ (hintsPayload)?.hints)
    ? /** @type {{ hints: unknown[] }} */ (hintsPayload).hints
    : [];

  if (!hintsEv) {
    const completedMs = missionCompletedAt != null ? new Date(missionCompletedAt).getTime() : NaN;
    const age = Number.isFinite(completedMs) ? Date.now() - completedMs : Infinity;
    if (age < WAITING_FOR_HINTS_MS) {
      return { state: 'WAITING_FOR_HINTS', hints: [] };
    }
    return { state: 'READY', hints: [] };
  }

  const pendingPayload =
    pendingEv?.payload && typeof pendingEv.payload === 'object' && !Array.isArray(pendingEv.payload)
      ? pendingEv.payload
      : null;
  if (pendingPayload && pendingPayload.pending === true) {
    return { state: 'VALIDATION_PENDING', hints: [] };
  }

  if (reviewEv) {
    return {
      state: 'MANUAL_REVIEW',
      hints,
      review: reviewEv.payload,
    };
  }

  return { state: 'READY', hints };
}
