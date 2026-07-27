/**
 * Mission step context chain: durable summaries on MissionBlackboard so later runway
 * steps and LLM prompts can see prior tool outcomes even when pipeline metadata is thin.
 */

import { appendEvent, getEvents } from './missionBlackboard.js';

/** @type {string} */
export const MISSION_STEP_OUTPUT_EVENT = 'step_output';

const MAX_BLACKBOARD_JSON = 24000;
/** Exported for tests and observability — prior-step prompt block cap in {@link buildStepContext}. */
export const MAX_PRIOR_CONTEXT_CHARS = 12000;
const MAX_SUMMARY_CHARS = 2000;

const STRIP_INPUT_KEYS = new Set([
  'imageDataUrl',
  'ownerProvidedProductImageDataUrl',
  'enrichedUserMessage',
  'priorStepsContext',
]);

/**
 * @param {unknown} obj
 * @param {number} depth
 * @returns {unknown}
 */
function sanitizeForBlackboard(obj, depth = 0) {
  if (depth > 10) return '[max-depth]';
  if (obj == null) return obj;
  if (typeof obj === 'string') {
    if (obj.length > 4000) return `${obj.slice(0, 4000)}…[truncated]`;
    if (/^data:image\//i.test(obj) || /^data:application\//i.test(obj)) return '[binary-data-redacted]';
    return obj;
  }
  if (typeof obj === 'number' || typeof obj === 'boolean') return obj;
  if (Array.isArray(obj)) {
    return obj.slice(0, 80).map((x) => sanitizeForBlackboard(x, depth + 1));
  }
  if (typeof obj === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (STRIP_INPUT_KEYS.has(k) || /dataUrl$/i.test(k) || /DataUrl$/i.test(k)) continue;
      out[k] = sanitizeForBlackboard(v, depth + 1);
    }
    return out;
  }
  return String(obj).slice(0, 500);
}

/**
 * @param {string} toolName
 * @param {Record<string, unknown>} out
 * @returns {string}
 */
export function summarizeStepOutputForBus(toolName, out) {
  if (!out || typeof out !== 'object') return String(out ?? '').slice(0, MAX_SUMMARY_CHARS);
  const t = String(toolName || '').toLowerCase();
  if (t === 'market_research' || t === 'campaign_research') {
    const mr = out.marketReport && typeof out.marketReport === 'object' ? out.marketReport : {};
    const parts = [
      mr.summary && String(mr.summary).trim(),
      mr.targetAudience && `Audience: ${String(mr.targetAudience).trim()}`,
      Array.isArray(mr.recommendations) && mr.recommendations.length
        ? `Recommendations: ${mr.recommendations.slice(0, 5).join('; ')}`
        : '',
    ].filter(Boolean);
    return parts.join('\n').slice(0, MAX_SUMMARY_CHARS) || JSON.stringify(mr).slice(0, MAX_SUMMARY_CHARS);
  }
  if (t === 'create_promotion' || t === 'smart_visual' || t === 'generate_mini_website' || t === 'mini_website') {
    const phase = out.phase != null ? String(out.phase) : '';
    const msg = out.message != null ? String(out.message) : '';
    const recCount = Array.isArray(out.recommendations) ? out.recommendations.length : 0;
    return [phase && `phase=${phase}`, msg && `message=${msg}`, recCount ? `recommendations=${recCount}` : '']
      .filter(Boolean)
      .join(' | ')
      .slice(0, MAX_SUMMARY_CHARS);
  }
  if (t === 'launch_campaign') {
    const headline = out.headline != null ? String(out.headline) : '';
    return [`headline=${headline}`, out.message != null ? String(out.message) : '']
      .filter(Boolean)
      .join(' | ')
      .slice(0, MAX_SUMMARY_CHARS);
  }
  try {
    return JSON.stringify(sanitizeForBlackboard(out)).slice(0, MAX_SUMMARY_CHARS);
  } catch {
    return '[unserializable-output]';
  }
}

/**
 * @param {string} missionId
 * @param {{ stepIndex: number, toolName: string, stepTitle?: string | null }} stepMeta
 * @param {unknown} rawOutput
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function writeStepOutput(missionId, stepMeta, rawOutput) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  const stepIndex =
    typeof stepMeta?.stepIndex === 'number' && Number.isFinite(stepMeta.stepIndex) ? stepMeta.stepIndex : 0;
  const toolName = typeof stepMeta?.toolName === 'string' ? stepMeta.toolName.trim().toLowerCase() : '';
  if (!mid || !toolName || stepIndex < 1) {
    return { ok: false, error: 'invalid_step_meta' };
  }
  if (!shouldPersistStepOutputToBus(toolName)) {
    return { ok: false, error: 'tool_step_output_skipped' };
  }
  const stepTitle =
    stepMeta.stepTitle != null && String(stepMeta.stepTitle).trim() ? String(stepMeta.stepTitle).trim() : null;
  const out =
    rawOutput && typeof rawOutput === 'object' && !Array.isArray(rawOutput)
      ? /** @type {Record<string, unknown>} */ (rawOutput)
      : { value: rawOutput };
  const summary = summarizeStepOutputForBus(toolName, out);
  let sanitized = sanitizeForBlackboard(out);
  let json = '';
  try {
    json = JSON.stringify({ summary, output: sanitized });
  } catch {
    json = JSON.stringify({ summary, output: '[unserializable]' });
  }
  if (json.length > MAX_BLACKBOARD_JSON) {
    sanitized = { truncated: true, summary };
    json = JSON.stringify({ summary, output: sanitized });
  }
  const payload = {
    stepIndex,
    toolName,
    stepTitle,
    summary,
    output: sanitized,
    completedAt: new Date().toISOString(),
  };
  return appendEvent(mid, MISSION_STEP_OUTPUT_EVENT, payload, { correlationId: mid });
}

/**
 * @param {string} missionId
 * @param {number} currentStepIndex — only events with stepIndex < this are included
 * @returns {Promise<Array<{ stepIndex: number, toolName: string, stepTitle: string | null, summary: string }>>}
 *
 * **Dedup:** Multiple `step_output` rows for the same `stepIndex` (e.g. retries) collapse to **last event
 * in ascending `seq` order** — the final write wins. That keeps context aligned with the latest attempt but
 * means a worse retry can replace a better prior snapshot in `buildStepContext`. Approval gates usually make
 * this acceptable; revisit if a step ever appears to “regress” after a failed retry.
 */
export async function readPriorOutputs(missionId, currentStepIndex) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  const cur =
    typeof currentStepIndex === 'number' && Number.isFinite(currentStepIndex) ? Math.floor(currentStepIndex) : 999;
  if (!mid || cur <= 1) return [];

  // Do not filter correlationId: traces may differ across runs; missionId is authoritative.
  const { events } = await getEvents(mid, { limit: 2000 });
  const rows = [];
  for (const e of events) {
    if (e.eventType !== MISSION_STEP_OUTPUT_EVENT) continue;
    const p = e.payload && typeof e.payload === 'object' && !Array.isArray(e.payload) ? e.payload : {};
    const stepIndex = typeof p.stepIndex === 'number' ? p.stepIndex : 0;
    if (stepIndex <= 0 || stepIndex >= cur) continue;
    const toolName = typeof p.toolName === 'string' ? p.toolName : '';
    const summary = typeof p.summary === 'string' ? p.summary : '';
    const stepTitle = p.stepTitle != null && String(p.stepTitle).trim() ? String(p.stepTitle).trim() : null;
    rows.push({ stepIndex, toolName, stepTitle, summary: summary || JSON.stringify(p.output ?? {}).slice(0, 500) });
  }
  // Last-wins per stepIndex: events are iterated in seq asc, so Map overwrite = latest seq for that step.
  const byStep = new Map();
  for (const r of rows) {
    byStep.set(r.stepIndex, r);
  }
  return [...byStep.values()].sort((a, b) => a.stepIndex - b.stepIndex);
}

/**
 * @param {{ missionId: string, currentStepIndex: number, step?: { index?: number, toolName?: string, name?: string } }} opts
 * @returns {Promise<string>}
 */
export async function buildStepContext(opts) {
  const missionId = typeof opts?.missionId === 'string' ? opts.missionId.trim() : '';
  const currentStepIndex =
    typeof opts?.currentStepIndex === 'number' && Number.isFinite(opts.currentStepIndex)
      ? Math.floor(opts.currentStepIndex)
      : 1;
  if (!missionId || currentStepIndex <= 1) return '';

  const prior = await readPriorOutputs(missionId, currentStepIndex);
  if (!prior.length) return '';

  const lines = prior.map((r) => {
    const title = r.stepTitle ? ` (${r.stepTitle})` : '';
    return `Step ${r.stepIndex} — ${r.toolName}${title}:\n${r.summary}`;
  });
  let block = `Prior completed steps on this mission (use as continuity; do not contradict without reason):\n\n${lines.join('\n\n')}`;
  if (block.length > MAX_PRIOR_CONTEXT_CHARS) {
    const hard = block.slice(0, MAX_PRIOR_CONTEXT_CHARS);
    const nl = hard.lastIndexOf('\n');
    const soft =
      nl > Math.floor(MAX_PRIOR_CONTEXT_CHARS * 0.4) ? hard.slice(0, nl) : hard;
    block = `${soft}\n…[truncated]`;
  }
  return block;
}

/**
 * Whether to append a `step_output` blackboard event after a successful proactive step.
 *
 * **Skip list (keep in sync when adding runway tools):** tools that are pure placeholders, client-driven, or
 * would flood the bus with low-signal payloads. When you add a new tool, default is **persist**; add it here
 * only if it matches one of those categories (document the reason in the list below).
 *
 * | Tool                 | Reason |
 * |----------------------|--------|
 * | `generate_slideshow`       | Client export stub; no durable server intelligence. |
 * | `general_chat`             | No structured step output; noise. |
 * | `connect_social_account`   | OAuth redirect stub — no structured output to chain. |
 *
 * **Document builders** (`build_card`, `build_smart_document`) are always allowed — Performer artifact
 * panel reads `step_output` rows from MissionBlackboard for these tools.
 *
 * @param {string} tool
 * @returns {boolean} `true` if this tool should call `writeStepOutput` after success
 */
export function shouldPersistStepOutputToBus(tool) {
  const t = String(tool || '').trim().toLowerCase();
  if (!t) return false;
  if (t === 'build_card' || t === 'build_smart_document') return true;
  return (
    t !== 'generate_slideshow' && t !== 'general_chat' && t !== 'connect_social_account'
  );
}
