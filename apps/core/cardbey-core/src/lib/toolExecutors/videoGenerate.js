/**
 * Minimal mock video multimodal executor: emits SSE mission.artifact for console projection.
 */

import { broadcastMissionArtifact } from '../../realtime/simpleSse.js';

export async function execute(input = {}, context = {}) {
  const missionIdRaw =
    (context && typeof context.missionId === 'string' && context.missionId.trim()) ||
    (typeof input?.missionId === 'string' && input.missionId.trim()) ||
    '';
  const missionId = missionIdRaw.trim();

  const videoUrl = 'https://samplelib.com/lib/preview/mp4/sample-5s.mp4';

  if (missionId) {
    broadcastMissionArtifact({
      missionId,
      subtype: 'video',
      payload: {
        url: videoUrl,
        thumbnail: '',
      },
    });
  }

  return {
    status: 'ok',
    output: {
      videoUrl,
    },
  };
}
