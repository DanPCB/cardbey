/**
 * Canonical runtime state vocabulary for intake, review, resume, and execution.
 */

export const CANONICAL_RUNTIME_STATES = Object.freeze([
  'awaiting_perception',
  'awaiting_context',
  'awaiting_approval',
  'awaiting_owner_input',
  'executing',
  'completed',
  'failed',
]);

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function deriveCanonicalRuntimeState(input = {}) {
  const explicit = pickString(input.runtimeState);
  if (explicit && CANONICAL_RUNTIME_STATES.includes(explicit)) return explicit;

  const action = pickString(input.action)?.toLowerCase();
  const executionPath = pickString(input.executionPath)?.toLowerCase();
  const status = pickString(input.status)?.toLowerCase();
  const missionStatus = pickString(input.missionStatus)?.toLowerCase();
  const multiAgentStatus = pickString(input.multiAgentStatus)?.toLowerCase();

  if (action === 'awaiting_perception' || executionPath === 'awaiting_perception') {
    return 'awaiting_perception';
  }
  if (action === 'clarify_store') return 'awaiting_context';
  if (action === 'approval_required' || missionStatus === 'awaiting_confirmation' || multiAgentStatus === 'pending_approval') {
    return 'awaiting_approval';
  }
  if (
    status === 'awaiting_owner_input' ||
    missionStatus === 'awaiting_owner_input' ||
    multiAgentStatus === 'awaiting_owner_input'
  ) {
    return 'awaiting_owner_input';
  }
  if (
    action === 'show_execution_plan' ||
    status === 'executing' ||
    missionStatus === 'executing' ||
    missionStatus === 'queued' ||
    missionStatus === 'planned' ||
    missionStatus === 'requested'
  ) {
    return 'executing';
  }
  if (status === 'completed' || missionStatus === 'completed' || missionStatus === 'done') {
    return 'completed';
  }
  if (status === 'failed' || missionStatus === 'failed' || action === 'error') {
    return 'failed';
  }
  return 'executing';
}

export function withCanonicalRuntimeState(payload = {}, input = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  return {
    ...payload,
    runtimeState: deriveCanonicalRuntimeState({
      ...input,
      ...payload,
    }),
  };
}
