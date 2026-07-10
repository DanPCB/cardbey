/**
 * Topology execution telemetry — blackboard, reasoning log, execution timeline.
 */

import { appendEvent } from '../missionBlackboard.js';
import { scheduleReasoningLinePersist } from '../reasoningLinePersist.js';
import { readMetadata, writeMetadata } from '../persistence/metadataWriter.js';

const MAX_TIMELINE = 200;
const MAX_IO_CHARS = 4000;

/**
 * @param {string} text
 * @returns {string}
 */
function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Strip `${label} failed` / `${label} failed — …` echoes so the title is never the reason.
 * @param {string} message
 * @param {string} label
 * @returns {string}
 */
function stripTitleFailedEcho(message, label) {
  let text = String(message ?? '').trim();
  if (!text) return 'Unknown error';
  const trimmedLabel = String(label ?? '').trim();
  if (!trimmedLabel) return text;

  if (text === trimmedLabel) return 'Step failed';

  const titleFailedOnly = new RegExp(`^${escapeRegExp(trimmedLabel)}\\s+failed\\.?$`, 'i');
  if (titleFailedOnly.test(text)) return 'Step failed';

  const titleFailedPrefix = new RegExp(
    `^${escapeRegExp(trimmedLabel)}\\s+failed\\s*[—–:\\-]+\\s*`,
    'i',
  );
  if (titleFailedPrefix.test(text)) {
    const stripped = text.replace(titleFailedPrefix, '').trim();
    return stripped || 'Step failed';
  }

  return text;
}

/**
 * @param {unknown} value
 * @param {number} [maxChars]
 */
export function sanitizeForTelemetry(value, maxChars = MAX_IO_CHARS) {
  try {
    const json = JSON.stringify(value ?? null);
    if (json == null) return null;
    if (json.length <= maxChars) return JSON.parse(json);
    return {
      _truncated: true,
      preview: json.slice(0, maxChars),
      length: json.length,
    };
  } catch {
    const text = String(value ?? '');
    return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
  }
}

/**
 * @param {import('../artifact/types.ts').TopologyNode | Record<string, unknown> | null | undefined} node
 * @param {string} [fallbackTool]
 */
export function resolveTopologyNodeLabel(node, fallbackTool = '') {
  if (node && typeof node === 'object') {
    const labels = node.labels && typeof node.labels === 'object' ? node.labels : null;
    const en = labels && typeof labels.en === 'string' ? labels.en.trim() : '';
    if (en) return en;
    if (typeof node.label === 'string' && node.label.trim()) return node.label.trim();
    if (typeof node.name === 'string' && node.name.trim()) return node.name.trim();
    if (typeof node.toolName === 'string' && node.toolName.trim()) return node.toolName.trim();
  }
  return String(fallbackTool || 'step').trim() || 'step';
}

/**
 * Normalize an error for telemetry / UI. Never use the node title as the failure reason.
 * @param {unknown} error
 * @param {import('../artifact/types.ts').TopologyNode | Record<string, unknown> | null} [node]
 * @returns {{ code?: string; message: string }}
 */
export function normalizeTopologyError(error, node = null) {
  const label = resolveTopologyNodeLabel(node, node?.toolName);

  if (!error) return { message: 'Unknown error' };
  if (typeof error === 'string') {
    return { message: stripTitleFailedEcho(error, label) };
  }
  if (typeof error === 'object') {
    const rec = /** @type {Record<string, unknown>} */ (error);
    const nested =
      rec.error && typeof rec.error === 'object'
        ? /** @type {Record<string, unknown>} */ (rec.error)
        : null;
    const rawMessage =
      (typeof rec.message === 'string' && rec.message.trim()) ||
      (typeof nested?.message === 'string' && String(nested.message).trim()) ||
      (typeof rec.reason === 'string' && rec.reason.trim()) ||
      '';
    const message = stripTitleFailedEcho(rawMessage || 'Step failed', label);
    const code =
      (typeof rec.code === 'string' && rec.code.trim()) ||
      (typeof nested?.code === 'string' && String(nested.code).trim()) ||
      undefined;
    return code ? { code, message } : { message };
  }
  return { message: stripTitleFailedEcho(String(error), label) };
}

/**
 * @param {string} missionId
 * @param {object} entry
 */
export async function appendExecutionTimeline(missionId, entry) {
  const mid = String(missionId ?? '').trim();
  if (!mid || !entry) return;
  try {
    const meta = (await readMetadata(mid)) ?? {};
    const prev = Array.isArray(meta.executionTimeline) ? meta.executionTimeline : [];
    const next = [...prev, { ts: new Date().toISOString(), ...entry }].slice(-MAX_TIMELINE);
    await writeMetadata(mid, { executionTimeline: next });
  } catch (err) {
    console.warn('[topologyExecutionTelemetry] timeline persist failed:', err?.message ?? err);
  }
}

/**
 * @param {string} missionId
 * @param {string} eventType
 * @param {Record<string, unknown>} payload
 */
export async function emitTopologyBlackboardEvent(missionId, eventType, payload) {
  const mid = String(missionId ?? '').trim();
  if (!mid || !eventType) return;
  try {
    await appendEvent(mid, eventType, payload, { agentId: 'topology_executor' });
  } catch (err) {
    console.warn('[topologyExecutionTelemetry] blackboard emit failed:', err?.message ?? err);
  }
}

/**
 * @param {string} missionId
 * @param {string} line
 */
export function emitTopologyReasoningLine(missionId, line) {
  const mid = String(missionId ?? '').trim();
  const text = String(line ?? '').trim();
  if (!mid || !text) return;
  try {
    scheduleReasoningLinePersist(mid, text, { agent: 'topology_executor' });
  } catch (err) {
    console.warn('[topologyExecutionTelemetry] reasoning emit failed:', err?.message ?? err);
  }
}

/**
 * Record a topology node lifecycle event (blackboard + timeline + reasoning).
 * Phases: node_started, tool_invoked, tool_input, tool_output, validation_errors, exception, node_finished.
 * @param {object} opts
 */
export async function recordTopologyNodeEvent(opts) {
  const {
    missionId,
    phase,
    nodeId,
    toolName,
    label,
    input,
    output,
    error,
    validationErrors,
    exception,
    status,
    message,
  } = opts;

  const mid = String(missionId ?? '').trim();
  if (!mid || !phase) return;

  const displayLabel = String(label || toolName || nodeId || 'step').trim();
  const payload = {
    phase,
    nodeId: nodeId ?? null,
    toolName: toolName ?? null,
    label: displayLabel,
    status: status ?? null,
    ...(input !== undefined ? { input: sanitizeForTelemetry(input) } : {}),
    ...(output !== undefined ? { output: sanitizeForTelemetry(output) } : {}),
    ...(error ? { error: normalizeTopologyError(error) } : {}),
    ...(Array.isArray(validationErrors) && validationErrors.length
      ? { validationErrors: sanitizeForTelemetry(validationErrors) }
      : {}),
    ...(exception
      ? {
          exception: {
            message: exception instanceof Error ? exception.message : String(exception),
            name: exception instanceof Error ? exception.name : 'Error',
          },
        }
      : {}),
    ...(message ? { message: String(message) } : {}),
  };

  const eventType =
    phase === 'node_started'
      ? 'topology.node.started'
      : phase === 'tool_invoked'
        ? 'topology.tool.invoked'
        : phase === 'tool_input'
          ? 'topology.tool.input'
          : phase === 'tool_output'
            ? 'topology.tool.output'
            : phase === 'validation_errors'
              ? 'topology.node.validation_errors'
              : phase === 'exception'
                ? 'topology.node.exception'
                : phase === 'node_finished'
                  ? 'topology.node.finished'
                  : `topology.${phase}`;

  await emitTopologyBlackboardEvent(mid, eventType, payload);
  await appendExecutionTimeline(mid, payload);

  if (phase === 'node_started') {
    emitTopologyReasoningLine(mid, `→ ${displayLabel}`);
  } else if (phase === 'node_finished' && status === 'completed') {
    emitTopologyReasoningLine(mid, `✓ ${displayLabel}`);
  } else if (phase === 'node_finished' && status === 'skipped') {
    emitTopologyReasoningLine(mid, `⊘ ${displayLabel} (skipped)`);
  } else if (phase === 'node_finished' && status === 'needs_input') {
    const missingMsg = message || normalizeTopologyError(error ?? { message }).message;
    emitTopologyReasoningLine(mid, `⚠ ${displayLabel}`);
    if (missingMsg) emitTopologyReasoningLine(mid, `Reason: ${missingMsg}`);
  } else if (phase === 'node_finished' && (status === 'failed' || status === 'blocked')) {
    const reason = normalizeTopologyError(error ?? { message }).message;
    emitTopologyReasoningLine(mid, `✗ ${displayLabel}`);
    emitTopologyReasoningLine(mid, `Reason: ${reason}`);
  } else if (phase === 'exception') {
    const reason = exception instanceof Error ? exception.message : String(exception ?? 'error');
    emitTopologyReasoningLine(mid, `✗ ${displayLabel}`);
    emitTopologyReasoningLine(mid, `Reason: ${reason}`);
  } else if (phase === 'validation_errors') {
    const first =
      Array.isArray(validationErrors) && validationErrors[0]
        ? typeof validationErrors[0] === 'string'
          ? validationErrors[0]
          : normalizeTopologyError(validationErrors[0]).message
        : message || 'Validation failed';
    emitTopologyReasoningLine(mid, `✗ ${displayLabel}`);
    emitTopologyReasoningLine(mid, `Reason: ${first}`);
  }
}

/**
 * Human summary from node run result for API / UI.
 * detail/reason are the real error message (not `${label} failed — ${reason}` echo).
 * @param {{ nodeStatus?: Record<string, string>; nodeOutputs?: Record<string, unknown>; failedNodeIds?: string[]; nodes?: unknown[] }} nodeRun
 * @param {Array<Record<string, unknown>>} [nodes]
 */
export function buildTopologyFailureSummary(nodeRun, nodes = []) {
  const failedIds = Array.isArray(nodeRun?.failedNodeIds) ? nodeRun.failedNodeIds : [];
  const nodeOutputs =
    nodeRun?.nodeOutputs && typeof nodeRun.nodeOutputs === 'object' ? nodeRun.nodeOutputs : {};
  const nodeById = new Map(
    (Array.isArray(nodes) ? nodes : []).map((n) => [String(n?.id ?? '').trim(), n]),
  );

  const steps = failedIds.map((id) => {
    const node = nodeById.get(String(id));
    const label = resolveTopologyNodeLabel(node, node?.toolName);
    const out = nodeOutputs[id];
    const err = out && typeof out === 'object' ? /** @type {Record<string, unknown>} */ (out).error : null;
    const reason = normalizeTopologyError(err ?? out, node).message;
    return { nodeId: id, label, reason };
  });

  if (!steps.length) {
    return {
      headline: 'Topology execution failed',
      steps: [],
      detail: 'Topology execution failed',
      reason: 'Topology execution failed',
    };
  }

  const first = steps[0];
  const reason = first.reason;
  const reasonRepeatsTitle =
    reason === first.label ||
    new RegExp(`^${escapeRegExp(first.label)}\\s+failed`, 'i').test(reason);

  return {
    headline: reasonRepeatsTitle ? reason : `${first.label} failed`,
    steps,
    detail: reason,
    reason,
  };
}
