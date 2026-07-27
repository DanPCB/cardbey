/**
 * Emit canonical operational artifacts over mission SSE.
 */

import { broadcastMissionArtifact } from '../../realtime/simpleSse.js';
import { normalizeArtifact } from './artifactContract.js';

/**
 * @param {string} missionId
 * @param {import('./artifactContract.js').OperationalArtifact} artifact
 */
export function emitMissionArtifact(missionId, artifact) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid) {
    console.warn('[artifactSse] emit skipped: missing missionId', { artifactId: artifact?.id });
    return;
  }
  const normalized = normalizeArtifact({ ...artifact, missionId: mid });
  if (!normalized) return;
  broadcastMissionArtifact({
    missionId: mid,
    subtype: normalized.type,
    payload: normalized,
  });
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log('[artifactSse] mission.artifact emitted', {
      missionId: mid,
      artifactId: normalized.id,
      type: normalized.type,
      status: normalized.status,
      url: normalized.url ?? normalized.previewUrl ?? null,
    });
  }
}
