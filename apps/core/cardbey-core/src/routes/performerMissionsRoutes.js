/**
 * GET /api/performer/missions/recent — recent MissionPipeline rows for the current user / store.
 */

import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';
const router = express.Router();

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 * @returns {Promise<string|null>}
 */
async function resolveUserStoreId(prisma, userId) {
  if (!userId) return null;
  try {
    const business = await prisma.business.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return business?.id ?? null;
  } catch {
    return null;
  }
}

function deriveListTitle(row) {
  const meta = asObject(row.metadataJson);
  const direct = meta.title;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const stepOut = asObject(meta.stepOutputs);
  const cr = asObject(stepOut.campaign_research);
  const sn = cr.storeName ?? cr?.marketReport?.storeName;
  if (typeof sn === 'string' && sn.trim()) return sn.trim();
  const mr = asObject(stepOut.market_research);
  const sn2 = mr.storeName ?? mr?.marketReport?.storeName;
  if (typeof sn2 === 'string' && sn2.trim()) return sn2.trim();
  return String(row.status ?? 'mission');
}

router.get('/recent', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Not authenticated' });
    }
    const prisma = getPrismaClient();
    const storeId = await resolveUserStoreId(prisma, userId);

    /** @type {import('@prisma/client').Prisma.MissionPipelineWhereInput} */
    const where = {
      OR: [
        { createdBy: userId },
        ...(storeId ? [{ targetType: 'store', targetId: storeId }] : []),
      ],
    };

    const rows = await prisma.missionPipeline.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 30,
      select: {
        id: true,
        status: true,
        runState: true,
        createdAt: true,
        updatedAt: true,
        metadataJson: true,
      },
    });

    const missions = rows.map((r) => ({
      id: r.id,
      title: deriveListTitle(r),
      status: r.status ?? '',
      runState: r.runState ?? '',
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? ''),
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt ?? ''),
    }));

    return res.json({ ok: true, missions });
  } catch (err) {
    next(err);
  }
});

export default router;
