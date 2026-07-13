/**
 * Self-observation diagnostics for mission authority / transition failures.
 */

import { writeMetadata } from '../persistence/metadataWriter.js';

/**
 * @param {string} missionId
 * @param {import('./missionTransitionError.js').MissionTransitionError | Error} err
 * @param {import('./missionAuthority.js').MissionAuthorityRecord | null | undefined} authority
 * @param {{ requestId?: string; traceId?: string }} [ctx]
 */
export async function recordMissionAuthorityDiagnostic(missionId, err, authority, ctx = {}) {
  const mid = String(missionId ?? '').trim();
  if (!mid) return null;

  const isTransition = err?.name === 'MissionTransitionError';
  const diagnostic = {
    code: isTransition ? err.code : 'MISSION_AUTHORITY_RECORD_MISSING',
    summary:
      isTransition && err.code === 'MISSION_RECORD_NOT_FOUND'
        ? 'Topology approval was received, but the authoritative MissionPipeline record could not be updated.'
        : isTransition
          ? `Mission transition failed: ${err.failedTransition ?? 'unknown'}`
          : 'Mission authority resolution failed during topology decision.',
    completed: ['store context selected', 'execution plan generated', 'owner approval received'],
    failed: [
      isTransition
        ? `persistence transition ${err.failedTransition ?? 'unknown'}`
        : 'mission authority resolution',
    ],
    consequences: [
      'canonical loyalty contract not applied',
      'legacy owner-input fallback may render',
    ],
    missionId: mid,
    persistenceKind: authority?.persistenceKind ?? err?.persistenceKind ?? null,
    failedModel: authority?.repository ?? err?.failedModel ?? 'MissionPipeline',
    failedTransition: isTransition ? err.failedTransition ?? null : null,
    currentState: isTransition ? err.currentState ?? authority?.currentState ?? null : authority?.currentState ?? null,
    requestId: ctx.requestId ?? err?.requestId ?? null,
    traceId: ctx.traceId ?? err?.traceId ?? null,
    recordedAt: new Date().toISOString(),
  };

  try {
    await writeMetadata(mid, {
      missionAuthorityDiagnostic: diagnostic,
      lastMissionAuthorityFailure: diagnostic,
      executionFailureReason: diagnostic.code,
      executionFailureMessage: diagnostic.summary,
    });
  } catch {
    /* metadata write may fail if pipeline row is missing — diagnostic still returned */
  }

  return diagnostic;
}

export default { recordMissionAuthorityDiagnostic };
