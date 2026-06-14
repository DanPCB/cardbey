/**
 * Lightweight mission snapshot for unified memory bundle.
 */

import { prisma } from '../../lib/prisma.js';
import { getLatestSnapshot } from '../../lib/missionBlackboard.js';

/**
 * @param {string} missionId
 * @param {import('@prisma/client').PrismaClient} [db]
 * @returns {Promise<import('../../lib/memory/memoryTypes.js').MissionContextMemory | null>}
 */
export async function getMissionMemorySnapshot(missionId, db = prisma) {
  const id = missionId ? String(missionId).trim() : '';
  if (!id) return null;

  try {
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

    return {
      missionId: id,
      status: mission.status ?? 'unknown',
      type,
      steps: [],
      blackboard,
    };
  } catch {
    return null;
  }
}
