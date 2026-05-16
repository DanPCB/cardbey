import type { StepObservation, MissionReactBlackboardLike } from '../../types/react.types.js';

function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string' && !v.trim()) return true;
  if (Array.isArray(v) && v.length === 0) return true;
  if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0) return true;
  return false;
}

/**
 * Deterministic post-step observation (no LLM).
 * Compares blackboard snapshots and records which keys were added or left empty.
 */
export function observeStep(
  stepIndex: number,
  tool: string,
  blackboardBefore: Record<string, unknown>,
  blackboardAfter: Record<string, unknown>,
  expectedOutputKeys: string[],
  startTime: number,
  error?: Error
): StepObservation {
  const beforeKeys = new Set(Object.keys(blackboardBefore || {}));
  const outputKeys = Object.keys(blackboardAfter || {}).filter((k) => !beforeKeys.has(k));

  const emptyKeys = (expectedOutputKeys || []).filter((k) => isEmptyValue(blackboardAfter[k]));

  const success = !error && emptyKeys.length === 0;
  const durationMs = Math.max(0, Date.now() - startTime);

  const observation: StepObservation = {
    stepIndex,
    tool,
    success,
    outputKeys,
    emptyKeys,
    durationMs,
    ...(error ? { error: error.message || String(error) } : {}),
  };

  return observation;
}

/** Append observation + reasoning line to working blackboard (caller persists if needed). */
export function recordObservationOnBlackboard(
  blackboard: MissionReactBlackboardLike,
  observation: StepObservation,
  reasoningLog: string[]
): void {
  const snap = blackboard.snapshot();
  const prev = Array.isArray(snap.react_observations)
    ? (snap.react_observations as StepObservation[])
    : [];
  blackboard.write('react_observations', [...prev, observation]);
  const line = `Step ${observation.stepIndex} (${observation.tool}): ${observation.success ? '✓' : '✗'} wrote [${observation.outputKeys.join(', ')}]${
    observation.emptyKeys.length > 0 ? ` empty: [${observation.emptyKeys.join(', ')}]` : ''
  }`;
  reasoningLog.push(line);
  blackboard.appendReasoningLog(line);
}
