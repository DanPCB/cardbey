/**
 * Legacy marketing-dashboard compatibility: GET /api/campaigns
 * Maps tenant-scoped CampaignV2 (+ optional workflow Campaign rows) to the dashboard shape.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';
import { getTenantId } from '../lib/tenant.js';

const router = Router();

function mapCampaignV2Status(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'DONE') return 'archived';
  if (s === 'RUNNING' || s === 'SCHEDULED') return 'active';
  return 'draft';
}

function mapLegacyWorkflowStatus(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'DONE') return 'archived';
  if (s === 'RUNNING') return 'active';
  return 'draft';
}

function toDashboardCampaign(row, source = 'v2') {
  if (source === 'v2') {
    return {
      id: row.id,
      name: row.title,
      objective: row.objective || row.title || '',
      status: mapCampaignV2Status(row.status),
      budget: 0,
      schedule: null,
      startDate: row.createdAt?.toISOString?.() ?? null,
      endDate: row.updatedAt?.toISOString?.() ?? null,
      createdAt: row.createdAt?.toISOString?.() ?? new Date().toISOString(),
      updatedAt: row.updatedAt?.toISOString?.() ?? new Date().toISOString(),
    };
  }
  return {
    id: row.id,
    name: row.title || 'Campaign',
    objective: row.title || '',
    status: mapLegacyWorkflowStatus(row.status),
    budget: 0,
    schedule: null,
    startDate: row.createdAt?.toISOString?.() ?? null,
    endDate: row.updatedAt?.toISOString?.() ?? null,
    createdAt: row.createdAt?.toISOString?.() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString?.() ?? new Date().toISOString(),
  };
}

/**
 * GET /api/campaigns?limit=50
 * Auth required; tenant-scoped list for marketing dashboard + PIL awareness.
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id ?? req.userId;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Not authenticated' });
    }
    const tenantKey = getTenantId(req.user) || userId;
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 50;
    const prisma = getPrismaClient();

    const v2Rows = await prisma.campaignV2.findMany({
      where: { tenantKey },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        title: true,
        objective: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    }).catch(() => []);

    const items = v2Rows.map((row) => toDashboardCampaign(row, 'v2'));

    if (items.length < limit && prisma.campaign?.findMany) {
      const legacy = await prisma.campaign.findMany({
        orderBy: { updatedAt: 'desc' },
        take: Math.max(0, limit - items.length),
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }).catch(() => []);
      const seen = new Set(items.map((c) => c.id));
      for (const row of legacy) {
        if (seen.has(row.id)) continue;
        items.push(toDashboardCampaign(row, 'legacy'));
        seen.add(row.id);
      }
    }

    return res.json({ ok: true, items });
  } catch (err) {
    console.error('[campaigns] list error:', err);
    return res.status(500).json({
      ok: false,
      error: 'campaigns_list_failed',
      message: err?.message || 'Failed to list campaigns',
    });
  }
});

/**
 * GET /api/campaigns/:id
 * Auth required; returns a single campaign in dashboard shape when tenant-scoped.
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id ?? req.userId;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Not authenticated' });
    }
    const tenantKey = getTenantId(req.user) || userId;
    const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!id) return res.status(400).json({ ok: false, error: 'id_required' });

    const prisma = getPrismaClient();
    const v2 = await prisma.campaignV2.findFirst({
      where: { id, tenantKey },
      select: {
        id: true,
        title: true,
        objective: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (v2) {
      return res.json({ ok: true, item: toDashboardCampaign(v2, 'v2') });
    }

    const legacy = await prisma.campaign?.findUnique?.({
      where: { id },
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (legacy) {
      return res.json({ ok: true, item: toDashboardCampaign(legacy, 'legacy') });
    }

    return res.status(404).json({ ok: false, error: 'not_found', message: 'Campaign not found' });
  } catch (err) {
    console.error('[campaigns] get error:', err);
    return res.status(500).json({
      ok: false,
      error: 'campaign_get_failed',
      message: err?.message || 'Failed to load campaign',
    });
  }
});

export default router;
