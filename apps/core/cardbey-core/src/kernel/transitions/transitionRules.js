/**
 * Allowed status transitions for doctrine boundary.
 * Used by transitionService to validate before applying.
 */

/** DraftStore: draft | generating | ready | failed | committed | abandoned */
const DRAFT_STORE_ALLOWED = new Set([
  'draft->generating',
  'generating->ready',
  'generating->failed',
  'draft->failed',   // expiry before generation starts
  'draft->ready',
  'ready->committed',
]);

/** OrchestratorTask: queued | running | completed | failed */
const ORCHESTRATOR_TASK_ALLOWED = new Set([
  'queued->running',
  'running->completed',
  'running->failed',
  'queued->failed',
  'queued->completed',  // shortcut when draft already ready before worker runs
]);

function key(from, to) {
  const f = (from || 'null').toLowerCase().trim();
  const t = (to || '').toLowerCase().trim();
  return `${f}->${t}`;
}

export function isDraftStoreTransitionAllowed(fromStatus, toStatus) {
  return DRAFT_STORE_ALLOWED.has(key(fromStatus, toStatus));
}

export function isOrchestratorTaskTransitionAllowed(fromStatus, toStatus) {
  return ORCHESTRATOR_TASK_ALLOWED.has(key(fromStatus, toStatus));
}
