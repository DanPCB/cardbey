/**
 * Global platform search for Super Admin Control Center command layer.
 * GET /api/admin/platform/search?q=&limit=
 */
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../../middleware/auth.js';
import { getPrismaClient } from '../../lib/prisma.js';
import { listSeedRecords } from '../../lib/businessIngestion/IngestionRepository.js';

const router = Router();
router.use(requireAuth);
router.use(requireAdmin);

function pushResult(results, entry) {
  if (results.length >= 30) return;
  results.push(entry);
}

router.get('/platform/search', async (req, res) => {
  try {
    const q = String(req.query.q ?? '').trim().toLowerCase();
    const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 30);
    if (q.length < 2) {
      return res.json({ ok: true, results: [] });
    }

    const prisma = getPrismaClient();
    const results = [];

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { displayName: { contains: q } },
          { fullName: { contains: q } },
          { id: { contains: q } },
        ],
      },
      take: 5,
      select: { id: true, displayName: true, fullName: true, role: true },
    });
    for (const u of users) {
      pushResult(results, {
        type: 'user',
        id: u.id,
        title: u.displayName || u.fullName || 'User account',
        subtitle: `Account · ${u.role ?? 'user'}`,
        route: '/admin',
      });
    }

    const stores = await prisma.store.findMany({
      where: {
        OR: [{ name: { contains: q } }, { id: { contains: q } }, { slug: { contains: q } }],
      },
      take: 5,
      select: { id: true, name: true, slug: true, status: true },
    });
    for (const store of stores) {
      pushResult(results, {
        type: 'store',
        id: store.id,
        title: store.name || 'Store',
        subtitle: `Store · ${store.status ?? 'unknown'}`,
        route: '/marketing#store-network',
      });
    }

    const devices = await prisma.device.findMany({
      where: {
        OR: [{ name: { contains: q } }, { id: { contains: q } }],
      },
      take: 5,
      select: { id: true, name: true, status: true, platform: true },
    });
    for (const device of devices) {
      pushResult(results, {
        type: 'device',
        id: device.id,
        title: device.name || 'Device',
        subtitle: `Device · ${device.status ?? 'unknown'}`,
        route: '/marketing#device-network',
      });
    }

    const missions = await prisma.missionPipeline.findMany({
      where: {
        OR: [{ id: { contains: q } }, { missionType: { contains: q } }],
      },
      take: 5,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, missionType: true, status: true },
    });
    for (const m of missions) {
      pushResult(results, {
        type: 'mission',
        id: m.id,
        title: m.missionType ? String(m.missionType).replace(/_/g, ' ') : 'Mission',
        subtitle: `Mission · ${m.status}`,
        route: '/marketing#runtime',
      });
    }

    const seeds = await listSeedRecords();
    const businessMatches = seeds
      .filter((s) => {
        const name = (s.normalized?.businessName ?? '').toLowerCase();
        const city = (s.normalized?.city ?? '').toLowerCase();
        return name.includes(q) || city.includes(q) || s.id.toLowerCase().includes(q);
      })
      .slice(0, 5);
    for (const seed of businessMatches) {
      pushResult(results, {
        type: 'business',
        id: seed.id,
        title: seed.normalized?.businessName || 'Business seed',
        subtitle: `Business · ${seed.verificationStatus}`,
        route: '/admin/discovery',
      });
    }

    res.json({ ok: true, results: results.slice(0, limit) });
  } catch (err) {
    console.error('[admin/platform/search]', err);
    res.status(500).json({ ok: false, error: 'platform_search_failed' });
  }
});

export default router;
