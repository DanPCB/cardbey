/**
 * Lightweight mission snapshot for unified memory bundle.
 */

import { prisma } from '../../lib/prisma.js';
import { getLatestSnapshot } from '../../lib/missionBlackboard.js';

function readSummaryFromMeta(meta) {
  if (!meta || typeof meta !== 'object') {
    return { activeSummary: null, keyFacts: [] };
  }
  const activeSummary =
    typeof meta.activeSummary === 'string' && meta.activeSummary.trim()
      ? meta.activeSummary.trim()
      : null;
  const keyFacts = Array.isArray(meta.keyFacts) ? meta.keyFacts.map(String) : [];
  return { activeSummary, keyFacts };
}

/**
 * @param {string} missionId
 * @param {import('@prisma/client').PrismaClient} [db]
 * @returns {Promise<import('../../lib/memory/memoryTypes.js').MissionContextMemory | null>}
 */
export async function getMissionMemorySnapshot(missionId, db = prisma) {
  const id = missionId ? String(missionId).trim() : '';
  if (!id) return null;

  try {
    if (db.missionPipeline?.findUnique) {
      const pipeline = await db.missionPipeline.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          type: true,
          metadataJson: true,
          steps: {
            select: { id: true, label: true, status: true, orderIndex: true },
            orderBy: { orderIndex: 'asc' },
            take: 12,
          },
        },
      });
      if (pipeline) {
        const { activeSummary, keyFacts } = readSummaryFromMeta(pipeline.metadataJson);
        return {
          missionId: pipeline.id,
          status: pipeline.status ?? 'unknown',
          type: pipeline.type ?? 'unknown',
          steps: (pipeline.steps ?? []).map((step) => ({
            id: step.id,
            name: step.label ?? step.id,
            status: step.status ?? 'pending',
          })),
          blackboard: {},
          activeSummary,
          keyFacts,
        };
      }
    }

    const mission = await db.mission.findUnique({
      where: { id },
      select: { id: true, status: true, context: true },
    });
    if (!mission) return null;

    const ctxRow = await db.missionContext.findUnique({
      where: { missionId: id },
      select: { contextJson: true },
    });

    let contextPayload = {};
    try {
      contextPayload = JSON.parse(ctxRow?.contextJson ?? '{}');
      if (typeof contextPayload !== 'object' || Array.isArray(contextPayload)) {
        contextPayload = {};
      }
    } catch {
      contextPayload = {};
    }

    const missionContext =
      mission.context && typeof mission.context === 'object' && !Array.isArray(mission.context)
        ? mission.context
        : {};

    let blackboard = {};
    try {
      const snap = await getLatestSnapshot(id);
      if (snap?.payload && typeof snap.payload === 'object') {
        blackboard = snap.payload;
      }
    } catch {
      /* blackboard optional */
    }

    const type =
      String(contextPayload.type ?? missionContext.type ?? 'unknown').trim() || 'unknown';
    const { activeSummary, keyFacts } = readSummaryFromMeta(contextPayload);

    return {
      missionId: id,
      status: mission.status ?? 'unknown',
      type,
      steps: [],
      blackboard,
      activeSummary,
      keyFacts,
    };
  } catch {
    return null;
  }
}
