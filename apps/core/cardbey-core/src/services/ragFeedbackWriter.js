/**
 * Writes mission outcome feedback vectors into the LangChain-backed RAG store (RagChunk).
 */

import { upsertRagChunkFromText } from './ragService.js';

const EFL_SCOPE = 'efl_feedback';

export async function writeFeedbackVectors(feedbackVectors) {
  try {
    if (!Array.isArray(feedbackVectors) || feedbackVectors.length === 0) {
      return { written: 0, failed: 0 };
    }

    const settled = await Promise.allSettled(
      feedbackVectors.map((vector, idx) => {
        const query = vector.query ?? '';
        const observation = vector.observation ?? '';
        const meta = JSON.stringify({
          type: vector.type ?? 'unknown',
          query,
          weight: vector.weight ?? 0.5,
          context: vector.context ?? {},
        });
        const content = `${query}\n\n${observation}\n\n__EFL_META__${meta}`.trim();
        const missionId = vector.missionId ?? 'unknown';
        const type = vector.type ?? 'unknown';
        const stamp = vector.createdAt ?? `idx-${idx}`;
        const sourcePath = `efl_feedback/${missionId}/${type}/${stamp}_${idx}`;

        return upsertRagChunkFromText({
          scope: EFL_SCOPE,
          sourcePath,
          chunkIndex: 0,
          content: content || `${type} ${missionId}`,
          tenantId: null,
        });
      })
    );

    let written = 0;
    let failed = 0;
    for (const r of settled) {
      if (r.status === 'fulfilled') written += 1;
      else failed += 1;
    }

    return { written, failed };
  } catch {
    return { written: 0, failed: 0 };
  }
}
