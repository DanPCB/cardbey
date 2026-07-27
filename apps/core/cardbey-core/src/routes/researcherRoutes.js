/**
 * Researcher agent API: POST /api/agents/researcher
 * Body: { goal?, storeContext? | storeId?, tenantKey? }
 * If only storeId is provided, store context is fetched server-side.
 * Returns validated market report or 422/500 with error detail.
 */

import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';
import { getTenantId } from '../lib/missionAccess.js';

const router = Router();

/**
 * POST /api/agents/researcher
 * Body: { goal?: string, storeId?: string, storeContext?: object, tenantKey?: string }
 * - goal: research goal (default "Launch campaign")
 * - storeId: resolve store and build storeContext server-side
 * - storeContext: use as-is (storeId, storeName, productCount, etc.); ignored if storeId also sent
 * - tenantKey: tenant for researcher (default from req.user or 'default')
 */
router.post('/', optionalAuth, async (req, res) => {
  try {
    const body = req.body ?? {};
    const goal = typeof body.goal === 'string' ? body.goal.trim() : 'Launch campaign';
    const storeId = typeof body.storeId === 'string' ? body.storeId.trim() : null;
    const tenantKey = typeof body.tenantKey === 'string' ? body.tenantKey.trim() : (req.user ? getTenantId(req.user) : null) || 'default';

    let storeContext = body.storeContext && typeof body.storeContext === 'object' ? body.storeContext : null;

    if (storeId && !storeContext) {
      const prisma = getPrismaClient();
      const store = await prisma.business.findUnique({ where: { id: storeId } });
      const products = store ? await prisma.product.findMany({ where: { businessId: storeId, deletedAt: null } }) : [];
      const productCount = products?.length ?? 0;
      const categorySet = new Set((products ?? []).map((p) => (p.category != null ? String(p.category).trim() : '')).filter(Boolean));
      const categoryCount = categorySet.size;
      const summary = store && productCount > 0
        ? `Store "${store.name ?? storeId}" has ${productCount} products across ${categoryCount} categories.`
        : store
          ? `Store "${store.name ?? storeId}" has no products yet.`
          : 'Store not found.';
      storeContext = {
        storeId,
        storeName: store?.name ?? null,
        productCount,
        categoryCount,
        suburb: store?.suburb ?? null,
        state: null,
        country: 'Australia',
        timezone: 'Australia/Sydney',
        summary,
      };
    }

    if (!storeContext?.storeId) {
      return res.status(400).json({
        ok: false,
        error: 'validation',
        message: 'storeId or storeContext with storeId is required',
      });
    }

    const { buildResearcherPrompt } = await import('../lib/agents/researcherPromptBuilder.js');
    const { runResearcher } = await import('../lib/agents/researcherAgent.js');

    const prompt = await buildResearcherPrompt({ goal, storeContext });
    const report = await runResearcher(prompt, { tenantKey });

    return res.json({ ok: true, report, goal });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith('MarketReport validation failed:')) {
      return res.status(422).json({
        ok: false,
        error: 'validation',
        message,
        detail: message.replace(/^MarketReport validation failed: /, ''),
      });
    }
    if (process.env.NODE_ENV !== 'production') {
      console.error('[researcher route]', err);
    }
    return res.status(500).json({
      ok: false,
      error: 'server_error',
      message: 'Researcher agent failed',
    });
  }
});

export default router;
