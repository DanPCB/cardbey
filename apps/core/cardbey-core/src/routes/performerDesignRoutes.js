/**
 * /api/performer/design
 * - POST /     — LLM DesignSpec (stub fallback on failure)
 * - POST /save — persist MerchantDesign (auth)
 * - GET  /     — list designs ?storeId= (auth)
 * - GET  /:id  — load one (auth)
 */

import express from 'express';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';
import { generateDesignSpecWithLlm, formatSize } from '../services/designStudio/designGeneratorSkill.js';
import { getStoreProfileForDesign } from '../services/designStudio/getStoreProfileForDesign.js';

const router = express.Router();
const jsonBody = express.json({ limit: '2mb' });

function buildStubSpec({ prompt, format, patchSpec }) {
  const { width, height } = formatSize(format);
  const headline = String(prompt || 'Design').trim().slice(0, 120) || 'Your message';

  if (patchSpec && Array.isArray(patchSpec.layers) && patchSpec.layers.length) {
    const layers = JSON.parse(JSON.stringify(patchSpec.layers));
    const textLayer = layers.find((l) => l && l.type === 'text');
    if (textLayer) {
      textLayer.text = headline;
    }
    return {
      version: '1.0',
      format: patchSpec.format || format,
      width: patchSpec.width || width,
      height: patchSpec.height || height,
      background: patchSpec.background || {
        type: 'solid',
        color: '#0f172a',
      },
      layers,
      generatedFrom: prompt,
      generatedAt: new Date().toISOString(),
    };
  }

  return {
    version: '1.0',
    format,
    width,
    height,
    background: {
      type: 'gradient',
      from: '#1e293b',
      to: '#312e81',
      direction: 'diagonal',
    },
    layers: [
      {
        id: 'headline-1',
        type: 'text',
        x: Math.round(width * 0.08),
        y: Math.round(height * 0.35),
        width: Math.round(width * 0.84),
        text: headline,
        fontSize: Math.min(72, Math.floor(height * 0.07)),
        fontFamily: 'Inter',
        fontStyle: 'bold',
        fill: '#f8fafc',
        align: 'center',
        lineHeight: 1.15,
      },
      {
        id: 'sub-1',
        type: 'text',
        x: Math.round(width * 0.1),
        y: Math.round(height * 0.52),
        width: Math.round(width * 0.8),
        text: 'Cardbey Contents Studio',
        fontSize: Math.min(36, Math.floor(height * 0.035)),
        fontFamily: 'Inter',
        fill: '#94a3b8',
        align: 'center',
      },
    ],
    generatedFrom: prompt,
    generatedAt: new Date().toISOString(),
  };
}

async function userOwnsStore(prisma, userId, storeId) {
  if (!userId || !storeId) return false;
  const row = await prisma.business.findFirst({
    where: { id: storeId, userId },
    select: { id: true },
  });
  return !!row;
}

async function resolveBrandKitForRequest(req, storeId) {
  const userId = req.user?.id;
  if (!storeId || !userId) return null;
  const prisma = getPrismaClient();
  const ok = await userOwnsStore(prisma, userId, storeId);
  if (!ok) return null;
  const profile = await getStoreProfileForDesign(storeId);
  if (!profile) return null;
  return {
    storeId: profile.storeId,
    name: profile.name,
    tagline: profile.tagline,
    primaryColor: profile.primaryColor,
    secondaryColor: profile.secondaryColor,
    logoUrl: profile.logoUrl,
    qrCodeUrl: profile.qrCodeUrl,
  };
}

// ── Save / list / load (auth) — register before POST / and GET /:id clash
router.post('/save', requireAuth, jsonBody, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { storeId, name, spec } = req.body || {};
    if (!storeId || typeof storeId !== 'string') {
      return res.status(400).json({ ok: false, error: 'storeId_required' });
    }
    if (!spec || typeof spec !== 'object') {
      return res.status(400).json({ ok: false, error: 'spec_required' });
    }
    const prisma = getPrismaClient();
    if (!(await userOwnsStore(prisma, userId, storeId))) {
      return res.status(403).json({ ok: false, error: 'forbidden', message: 'Store not found or access denied' });
    }
    const specJson = JSON.stringify(spec);
    const design = await prisma.merchantDesign.create({
      data: {
        storeId,
        name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 200) : null,
        specJson,
      },
      select: { id: true, storeId: true, name: true, createdAt: true, updatedAt: true },
    });
    return res.json({ ok: true, design });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[performerDesignRoutes] save', e);
    return res.status(500).json({ ok: false, error: 'save_failed', message: e?.message || String(e) });
  }
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    const storeId = typeof req.query.storeId === 'string' ? req.query.storeId.trim() : '';
    if (!storeId) {
      return res.status(400).json({ ok: false, error: 'storeId_required' });
    }
    const prisma = getPrismaClient();
    if (!(await userOwnsStore(prisma, userId, storeId))) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }
    const rows = await prisma.merchantDesign.findMany({
      where: { storeId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        storeId: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return res.json({ ok: true, designs: rows });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[performerDesignRoutes] list', e);
    return res.status(500).json({ ok: false, error: 'list_failed', message: e?.message || String(e) });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    const id = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!id) {
      return res.status(400).json({ ok: false, error: 'id_required' });
    }
    const prisma = getPrismaClient();
    const row = await prisma.merchantDesign.findUnique({
      where: { id },
      select: { id: true, storeId: true, name: true, specJson: true, createdAt: true, updatedAt: true },
    });
    if (!row) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    if (!(await userOwnsStore(prisma, userId, row.storeId))) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }
    let spec = null;
    try {
      spec = JSON.parse(row.specJson);
    } catch {
      return res.status(500).json({ ok: false, error: 'invalid_stored_spec' });
    }
    return res.json({
      ok: true,
      design: {
        id: row.id,
        storeId: row.storeId,
        name: row.name,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        spec,
        specJson: row.specJson,
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[performerDesignRoutes] get', e);
    return res.status(500).json({ ok: false, error: 'load_failed', message: e?.message || String(e) });
  }
});

router.post('/', optionalAuth, jsonBody, async (req, res) => {
  try {
    const { prompt, format, patchSpec, storeId } = req.body || {};
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ ok: false, error: 'prompt_required' });
    }
    const fmt = typeof format === 'string' ? format : 'signage_landscape';
    const canvasSize = formatSize(fmt);
    const tenantKey = req.user?.id || req.user?.email || 'design_generator_guest';

    const sid = typeof storeId === 'string' && storeId.trim() ? storeId.trim() : '';
    const brandKit = await resolveBrandKitForRequest(req, sid);

    let spec;
    let degraded = null;
    try {
      spec = await generateDesignSpecWithLlm({
        prompt: prompt.trim(),
        format: fmt,
        patchSpec: patchSpec && typeof patchSpec === 'object' ? patchSpec : null,
        brandKit,
        canvasSize,
        tenantKey,
      });
      spec.generatedFrom = prompt.trim();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[performerDesignRoutes] LLM design failed, using stub:', err?.message || err);
      spec = buildStubSpec({
        prompt: prompt.trim(),
        format: fmt,
        patchSpec: patchSpec && typeof patchSpec === 'object' ? patchSpec : null,
      });
      degraded = err?.code === 'parse_failed' ? 'llm_parse_failed' : 'llm_error';
    }

    return res.json({
      ok: true,
      spec,
      brandKit: brandKit ?? null,
      ...(degraded ? { degraded } : {}),
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[performerDesignRoutes]', e);
    return res.status(500).json({
      ok: false,
      error: 'design_generation_failed',
      message: e?.message || String(e),
    });
  }
});

export default router;
