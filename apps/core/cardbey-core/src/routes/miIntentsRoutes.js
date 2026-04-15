/**
 * M1.5 Single Runway: Mission Inbox (IntentRequest) API.
 * POST/GET /api/mi/missions/:missionId/intents, POST .../intents/:intentId/run
 * requireAuth; only mission owner can create/read/run intents. No cross-tenant access.
 */

import { Router } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';
import { getOrCreateMission, mergeMissionContext } from '../lib/mission.js';
import { planIntent } from '../lib/missionPlan/planIntent.js';
import { emitMissionEvent } from '../services/miAgents/emitMissionEvent.js';
import { resolveAccessibleMission } from '../lib/missionAccess.js';
import { normalizeCreateMissionIntentRequest } from '../lib/missionIntent/normalizeCreateMissionIntent.js';
import { serializeNormalizedIntentPayload } from '../lib/missionIntent/serializeNormalizedIntentPayload.js';
import { emitHealthProbe } from '../lib/telemetry/healthProbes.js';

const router = Router();

function isNonProductionEnv() {
  return process.env.NODE_ENV !== 'production';
}

/** Normalize Mission.context.reasoning_log for GET reasoning-log (string[], legacy JSON string, {line} rows). */
function normalizeReasoningLogFromContext(ctx) {
  const raw = ctx && typeof ctx === 'object' ? ctx.reasoning_log : undefined;
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    const out = [];
    for (const x of raw) {
      if (x == null) continue;
      if (typeof x === 'string') {
        if (x.trim()) out.push(x);
        continue;
      }
      if (typeof x === 'object' && x !== null && typeof x.line === 'string' && x.line.trim()) {
        out.push(x.line);
        continue;
      }
      const s = String(x);
      if (s.trim()) out.push(s);
    }
    return out;
  }
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return [];
    try {
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed)) {
        return normalizeReasoningLogFromContext({ reasoning_log: parsed });
      }
    } catch {
      /* fall through */
    }
    return [raw];
  }
  return [];
}

const VALID_STATUSES = new Set(['queued', 'running', 'completed', 'failed', 'cancelled']);

/**
 * POST /api/mi/interpret-intent
 * Body: { prompt: string }
 * Optional LLM-assisted intent interpretation (existing LLM service path: cache + budget + provider).
 * Returns hints only; frontend resolver owns final mission plan.
 */
router.post('/interpret-intent', requireAuth, async (req, res) => {
  try {
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    if (!prompt) {
      return res.status(400).json({ ok: false, error: 'prompt_required', message: 'prompt is required' });
    }
    const prisma = getPrismaClient();
    const tenantKey = req.user?.business?.id ?? req.user?.tenantId ?? req.user?.id ?? 'global';
    const { interpretMissionIntentWithLlm } = await import('../lib/missionPlan/interpretMissionIntentWithLlm.js');
    const hints = await interpretMissionIntentWithLlm(prisma, prompt, { tenantKey });
    return res.json({ ok: true, hints: hints ?? null });
  } catch (err) {
    console.warn('[MI Intents] interpret-intent error:', err?.message);
    return res.json({ ok: true, hints: null });
  }
});

/**
 * POST /api/mi/missions/:missionId/intents
 * Body: { type: string, payload?: object }
 * requireAuth; mission owner only. Creates IntentRequest with status queued.
 */
router.post('/missions/:missionId/intents', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        ok: false,
        error: 'unauthorized',
        message: 'Not authenticated',
      });
    }
    const missionIdRaw = req.params.missionId;
    const missionId = typeof missionIdRaw === 'string' ? missionIdRaw.trim() : '';
    if (!missionId) {
      return res.status(400).json({
        ok: false,
        error: 'mission_id_required',
        message: 'missionId is required',
      });
    }
    // Ensure Mission row exists so intents can always be created (e.g. missionId from OrchestratorTask).
    try {
      await getOrCreateMission(missionId, req.user, { title: 'Mission' });
    } catch (e) {
      console.warn('[MI Intents] getOrCreateMission failed:', e.message);
    }
    const access = await resolveAccessibleMission(req.user, missionId);
    if (!access.ok) {
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        message: 'You do not have access to this mission.',
      });
    }
    const prisma = getPrismaClient();
    if (!prisma.intentRequest) {
      return res.status(503).json({
        ok: false,
        error: 'model_unavailable',
        message: 'IntentRequest model not available. Run prisma generate and migrate.',
      });
    }
    const body = req.body ?? {};
    const parsed = normalizeCreateMissionIntentRequest({
      missionId,
      userId,
      body,
    });
    if (!parsed.ok) {
      return res.status(parsed.status).json({
        ok: false,
        error: parsed.error,
        message: parsed.message,
      });
    }
    const { normalized } = parsed;
    const payload = serializeNormalizedIntentPayload(normalized);

    if (isNonProductionEnv()) {
      res.setHeader('X-Intent-Payload-Shape', normalized.payloadShape);
      console.debug('[MI Intents] POST intents normalized', {
        route: 'POST /api/mi/missions/:missionId/intents',
        intentType: normalized.type,
        payloadShape: normalized.payloadShape,
        topLevelKeys: payload && typeof payload === 'object' ? Object.keys(payload) : [],
      });
    }

    const intent = await prisma.intentRequest.create({
      data: {
        missionId,
        userId,
        type: normalized.type,
        agent: normalized.agent,
        payload,
        status: 'queued',
      },
    });
    return res.status(201).json({
      ok: true,
      intentRequestId: intent.id,
      intent: {
        id: intent.id,
        missionId: intent.missionId,
        type: intent.type,
        payload: intent.payload,
        status: intent.status,
        createdAt: intent.createdAt,
      },
    });
  } catch (err) {
    console.error('[MI Intents] POST intents error:', err);
    return res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: err.message || 'Failed to create intent',
    });
  }
});

/**
 * GET /api/mi/missions/:missionId/intents
 * requireAuth; mission owner only. Returns list of intents for the mission (newest first).
 */
router.get('/missions/:missionId/intents', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        ok: false,
        error: 'unauthorized',
        message: 'Not authenticated',
      });
    }
    const missionIdRaw = req.params.missionId;
    const missionId = typeof missionIdRaw === 'string' ? missionIdRaw.trim() : '';
    if (!missionId) {
      return res.status(400).json({
        ok: false,
        error: 'mission_id_required',
        message: 'missionId is required',
      });
    }
    const access = await resolveAccessibleMission(req.user, missionId);
    if (!access.ok) {
      return res.status(403).json({
        ok: false,
        error: 'forbidden',
        message: 'You do not have access to this mission.',
      });
    }
    const prisma = getPrismaClient();
    if (!prisma.intentRequest) {
      return res.status(503).json({
        ok: false,
        error: 'model_unavailable',
        message: 'IntentRequest model not available.',
      });
    }
    const intents = await prisma.intentRequest.findMany({
      where: { missionId },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({
      ok: true,
      intents: intents.map((i) => ({
        id: i.id,
        missionId: i.missionId,
        userId: i.userId,
        type: i.type,
        agent: i.agent ?? null,
        payload: i.payload,
        result: i.result ?? null,
        status: i.status,
        createdAt: i.createdAt,
        updatedAt: i.updatedAt,
      })),
    });
  } catch (err) {
    console.error('[MI Intents] GET intents error:', err);
    return res.status(500).json({
      ok: false,
      error: 'internal_error',
      message: err.message || 'Failed to list intents',
    });
  }
});

/**
 * GET /api/mi/missions/:missionId/events?limit=200&jobId=...
 * optionalAuth then require user; allow access if mission owner OR jobId belongs to user (guest-created missions).
 */
/**
 * GET /api/mi/missions/:missionId/reasoning-log
 * Returns Mission.context.reasoning_log for Performer ReAct feed (append-only strings).
 */
router.get('/missions/:missionId/reasoning-log', optionalAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Not authenticated' });
    }
    const missionIdRaw = req.params.missionId;
    const missionId = typeof missionIdRaw === 'string' ? missionIdRaw.trim() : '';
    if (!missionId) {
      return res.status(400).json({ ok: false, error: 'mission_id_required', message: 'missionId is required' });
    }
    const access = await resolveAccessibleMission(req.user, missionId);
    if (!access.ok) {
      return res.status(403).json({ ok: false, error: 'forbidden', message: 'You do not have access to this mission.' });
    }
    const prisma = getPrismaClient();
    const row = await prisma.mission.findUnique({
      where: { id: missionId },
      select: { context: true },
    });
    const ctx = row?.context && typeof row.context === 'object' ? row.context : {};
    const reasoningLog = normalizeReasoningLogFromContext(ctx);
    emitHealthProbe('reasoning_log_polled', {
      missionId: req.params.missionId,
      lineCount: reasoningLog.length,
      empty: reasoningLog.length === 0,
    });
    console.log('[reasoning-log API] response', {
      missionId: req.params.missionId,
      reasoningLogLength: reasoningLog?.length ?? 0,
      firstLine: reasoningLog?.[0] ?? 'none',
      rawContextType: typeof ctx?.reasoning_log,
      rawContextLength: Array.isArray(ctx?.reasoning_log) ? ctx.reasoning_log.length : 'not-array',
    });
    const reactTrace = ctx.react_trace && typeof ctx.react_trace === 'object' ? ctx.react_trace : null;
    if (isNonProductionEnv()) {
      const r = ctx.reasoning_log;
      console.log('[MI Intents] GET reasoning-log', missionId, {
        normalizedCount: reasoningLog.length,
        rawType: r === null || r === undefined ? 'nil' : Array.isArray(r) ? 'array' : typeof r,
        rawLength: Array.isArray(r) ? r.length : undefined,
      });
    }
    return res.json({ ok: true, reasoningLog, reactTrace });
  } catch (err) {
    console.error('[MI Intents] GET reasoning-log error:', err);
    return res.status(500).json({ ok: false, error: 'internal_error', message: err.message || 'Failed to read reasoning log' });
  }
});

router.get('/missions/:missionId/events', optionalAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Not authenticated' });
    }
    const missionIdRaw = req.params.missionId;
    const missionId = typeof missionIdRaw === 'string' ? missionIdRaw.trim() : '';
    if (!missionId) {
      return res.status(400).json({ ok: false, error: 'mission_id_required', message: 'missionId is required' });
    }
    let access = await resolveAccessibleMission(req.user, missionId);
    if (!access.ok && req.query.jobId && typeof req.query.jobId === 'string') {
      const jobId = req.query.jobId.trim();
      if (jobId) {
        const prisma = getPrismaClient();
        const task = await prisma.orchestratorTask.findUnique({
          where: { id: jobId },
          select: { userId: true },
        });
        if (task && task.userId === userId) {
          access = { ok: true };
        }
      }
    }
    if (!access.ok) {
      return res.status(403).json({ ok: false, error: 'forbidden', message: 'You do not have access to this mission.' });
    }
    const prisma = getPrismaClient();
    if (!prisma.missionEvent) {
      return res.status(503).json({ ok: false, error: 'model_unavailable', message: 'MissionEvent model not available.' });
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
    const rows = await prisma.missionEvent.findMany({
      where: { missionId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    const events = rows.map((e) => ({
      id: e.id,
      missionId: e.missionId,
      intentId: e.intentId,
      agent: e.agent,
      type: e.type,
      payload: e.payload,
      createdAt: e.createdAt,
    }));
    return res.json({ ok: true, events });
  } catch (err) {
    console.error('[MI Intents] GET events error:', err);
    return res.status(500).json({ ok: false, error: 'internal_error', message: err.message || 'Failed to list events' });
  }
});

/**
 * POST /api/mi/missions/:missionId/intents/:intentId/run
 * requireAuth; mission owner only. Runs intent via CatalogAgent or MediaAgent; emits events; patches DraftStore.preview only.
 */
router.post(
  '/missions/:missionId/intents/:intentId/run',
  requireAuth,
  async (req, res) => {
    const missionId = typeof req.params.missionId === 'string' ? req.params.missionId.trim() : '';
    const intentId = typeof req.params.intentId === 'string' ? req.params.intentId.trim() : '';
    try {
      if (!req.user?.id) {
        return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Not authenticated' });
      }
      if (!missionId || !intentId) {
        return res.status(400).json({ ok: false, error: 'ids_required', message: 'missionId and intentId are required' });
      }
      const access = await resolveAccessibleMission(req.user, missionId);
      if (!access.ok) {
        return res.status(403).json({ ok: false, error: 'forbidden', message: 'You do not have access to this mission.' });
      }
      const prisma = getPrismaClient();
      if (!prisma.intentRequest) {
        return res.status(503).json({ ok: false, error: 'model_unavailable', message: 'IntentRequest model not available.' });
      }
      const intent = await prisma.intentRequest.findFirst({ where: { id: intentId, missionId } });
      if (!intent) {
        return res.status(404).json({ ok: false, error: 'not_found', message: 'Intent not found' });
      }
      if (intent.status !== 'queued') {
        return res.status(409).json({
          ok: false,
          error: 'invalid_state',
          message: `Intent is not queued (status: ${intent.status})`,
        });
      }

      await prisma.intentRequest.update({
        where: { id: intentId },
        data: { status: 'running', updatedAt: new Date() },
      });

      const { resolveDraftContext } = await import('../services/miAgents/resolveDraftContext.js');
      const intentType = intent.type || '';
      const payload = intent.payload && typeof intent.payload === 'object' ? intent.payload : {};

      await emitMissionEvent({
        missionId,
        intentId,
        agent: 'orchestrator',
        type: 'started',
        payload: { intentType },
      });

      // Foundation 1 Session 2: execution plan for this intent — planIntent (pure), merge into context keyed by intentId, emit plan_created.
      try {
        await getOrCreateMission(missionId, req.user, { title: 'Mission' });
      } catch (e) {
        console.warn('[MI Intents] getOrCreateMission failed (plan may not be persisted):', e?.message ?? e);
      }
      const plan = planIntent(intentType, payload, { missionId, intentId });
      await mergeMissionContext(missionId, { missionPlan: { [intentId]: plan } });
      await emitMissionEvent({
        missionId,
        intentId,
        agent: 'orchestrator',
        type: 'plan_created',
        payload: { planId: plan.planId, intentId, stepCount: plan.steps.length },
      });

      // MI Assistant (single runway): message queued from artifact page; run just marks completed (no resolve-scope, no store mutation).
      if (intentType === 'mi_assistant_message') {
        const message = payload.message != null ? String(payload.message).slice(0, 4096) : '';
        await emitMissionEvent({
          missionId,
          intentId,
          agent: 'orchestrator',
          type: 'completed',
          payload: { message, storeId: payload.storeId ?? null, draftId: payload.draftId ?? null, source: 'mi_assistant' },
        });
        await prisma.intentRequest.update({
          where: { id: intentId },
          data: {
            status: 'completed',
            result: { message, storeId: payload.storeId ?? null, draftId: payload.draftId ?? null, intentType: 'mi_assistant_message' },
            updatedAt: new Date(),
          },
        });
        return res.json({ ok: true, intentId, status: 'completed', result: { message } });
      }

      // Intent Capture: create_offer — create Offer + optional DynamicQr from Mission Execution only (no draft context).
      // Result shape is the backend contract for frontend promotion handoff: frontend uses it to derive Promotion Entity
      // Mode, render offer artifacts, and continue promotion opportunities. Always include offerId, storeId, entityType, source.
      if (intentType === 'create_offer') {
        try {
          const storeId = payload.storeId && typeof payload.storeId === 'string' ? payload.storeId.trim() : '';
          if (!storeId) {
            await emitMissionEvent({ missionId, intentId, agent: 'orchestrator', type: 'failed', payload: { message: 'storeId required in payload' } });
            await prisma.intentRequest.update({ where: { id: intentId }, data: { status: 'failed', result: { error: 'storeId_required' }, updatedAt: new Date() } });
            return res.json({ ok: true, intentId, status: 'failed', message: 'storeId required' });
          }
          const store = await prisma.business.findUnique({
            where: { id: storeId, isActive: true },
            select: { id: true, userId: true, slug: true },
          });
          if (!store || store.userId !== req.user.id) {
            await emitMissionEvent({ missionId, intentId, agent: 'orchestrator', type: 'failed', payload: { message: 'Store not found or not owned' } });
            await prisma.intentRequest.update({ where: { id: intentId }, data: { status: 'failed', result: { error: 'store_not_found' }, updatedAt: new Date() } });
            return res.json({ ok: true, intentId, status: 'failed', message: 'Store not found or not owned' });
          }
          const title = (payload.title && String(payload.title).trim()) || 'Special offer';
          const slugRaw = (payload.slug && String(payload.slug).trim()) || title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
          let slug = slugRaw.slice(0, 80) || 'offer';
          const description = payload.description != null ? String(payload.description) : null;
          const priceText = payload.priceText != null ? String(payload.priceText) : null;
          const { nanoid } = await import('nanoid');

          // Idempotent: if offer with this (storeId, slug) already exists, treat as success and return it.
          let offer = await prisma.storeOffer.findFirst({
            where: { storeId: store.id, slug },
            select: { id: true, slug: true, title: true, description: true, priceText: true, isActive: true, endsAt: true },
          });
          if (!offer) {
            try {
              offer = await prisma.storeOffer.create({
                data: { storeId: store.id, slug, title, description, priceText, isActive: true },
              });
            } catch (createErr) {
              if (createErr?.code === 'P2002' && (createErr?.meta?.target?.includes('storeId') || createErr?.meta?.target?.includes('slug'))) {
                slug = `${slug.slice(0, 70)}-${nanoid(6).toLowerCase()}`;
                offer = await prisma.storeOffer.create({
                  data: { storeId: store.id, slug, title, description, priceText, isActive: true },
                });
              } else {
                throw createErr;
              }
            }
          }

          const baseUrl = (process.env.PUBLIC_BASE_URL || process.env.API_BASE || '').replace(/\/$/, '') || (req.protocol + '://' + (req.get('host') || 'localhost:3000'));
          const targetPath = `/p/${store.slug}/offers/${offer.slug}`;
          const publicUrl = baseUrl ? `${baseUrl}${targetPath}` : targetPath;
          const feedUrl = baseUrl ? `${baseUrl}/api/public/stores/${store.id}/intent-feed` : null;

          // Minimum required for promotion handoff; add optional qrUrl if QR is created.
          const result = {
            offerId: offer.id,
            storeId: store.id,
            entityType: 'promotion',
            source: 'create_offer',
            offerName: title,
            title,
            description: description ?? undefined,
            isActive: offer.isActive,
            endsAt: offer.endsAt ? offer.endsAt.toISOString() : null,
            publicUrl,
            feedUrl: feedUrl ?? undefined,
          };

          let qrUrl = null;
          let code;
          for (let attempt = 0; attempt < 10; attempt++) {
            code = nanoid(8).toLowerCase();
            const exists = await prisma.dynamicQr.findUnique({ where: { code } });
            if (!exists) break;
          }
          if (code) {
            try {
              await prisma.dynamicQr.create({
                data: {
                  code,
                  storeId: store.id,
                  type: 'offer',
                  payload: { offerId: offer.id, storeSlug: store.slug, offerSlug: offer.slug },
                  targetPath,
                  isActive: true,
                  createdByUserId: req.user.id,
                },
              });
              qrUrl = baseUrl ? `${baseUrl}/q/${code}` : `/q/${code}`;
              result.qrUrl = qrUrl;
            } catch (qrErr) {
              console.warn('[MI Intents] create_offer: QR create failed, completing without qrUrl:', qrErr?.message);
            }
          }

          await emitMissionEvent({ missionId, intentId, agent: 'orchestrator', type: 'completed', payload: result });
          await prisma.intentRequest.update({
            where: { id: intentId },
            data: { status: 'completed', result, updatedAt: new Date() },
          });
          return res.json({ ok: true, intentId, status: 'completed', result });
        } catch (createOfferErr) {
          console.warn('[MI Intents] create_offer error:', createOfferErr?.message || createOfferErr);
          await emitMissionEvent({ missionId, intentId, agent: 'orchestrator', type: 'failed', payload: { message: createOfferErr?.message || 'create_offer failed' } });
          await prisma.intentRequest.update({
            where: { id: intentId },
            data: { status: 'failed', result: { error: 'create_offer_failed', message: createOfferErr?.message }, updatedAt: new Date() },
          });
          return res.json({ ok: true, intentId, status: 'failed', message: createOfferErr?.message || 'create_offer failed' });
        }
      }

      // Intent Capture: create_qr_for_offer — add DynamicQr for an existing StoreOffer (Mission Execution only).
      if (intentType === 'create_qr_for_offer') {
        try {
          const offerId = payload.offerId && typeof payload.offerId === 'string' ? payload.offerId.trim() : '';
          if (!offerId) {
            await emitMissionEvent({ missionId, intentId, agent: 'orchestrator', type: 'failed', payload: { message: 'offerId required in payload' } });
            await prisma.intentRequest.update({ where: { id: intentId }, data: { status: 'failed', result: { error: 'offerId_required' }, updatedAt: new Date() } });
            return res.json({ ok: true, intentId, status: 'failed', message: 'offerId required' });
          }
          const offer = await prisma.storeOffer.findUnique({
            where: { id: offerId, isActive: true },
            include: { store: { select: { id: true, userId: true, slug: true } } },
          });
          if (!offer || offer.store.userId !== req.user.id) {
            await emitMissionEvent({ missionId, intentId, agent: 'orchestrator', type: 'failed', payload: { message: 'Offer not found or not owned' } });
            await prisma.intentRequest.update({ where: { id: intentId }, data: { status: 'failed', result: { error: 'offer_not_found' }, updatedAt: new Date() } });
            return res.json({ ok: true, intentId, status: 'failed', message: 'Offer not found or not owned' });
          }
          const { nanoid } = await import('nanoid');
          let code;
          for (let attempt = 0; attempt < 10; attempt++) {
            code = nanoid(8).toLowerCase();
            const exists = await prisma.dynamicQr.findUnique({ where: { code } });
            if (!exists) break;
          }
          if (!code) {
            await emitMissionEvent({ missionId, intentId, agent: 'orchestrator', type: 'failed', payload: { message: 'Could not generate unique QR code' } });
            await prisma.intentRequest.update({ where: { id: intentId }, data: { status: 'failed', result: { error: 'code_generation_failed' }, updatedAt: new Date() } });
            return res.json({ ok: true, intentId, status: 'failed', message: 'QR code generation failed' });
          }
          const targetPath = `/p/${offer.store.slug}/offers/${offer.slug}`;
          await prisma.dynamicQr.create({
            data: {
              code,
              storeId: offer.store.id,
              type: 'offer',
              payload: { offerId: offer.id, storeSlug: offer.store.slug, offerSlug: offer.slug },
              targetPath,
              isActive: true,
              createdByUserId: req.user.id,
            },
          });
          const baseUrl = (process.env.PUBLIC_BASE_URL || process.env.API_BASE || '').replace(/\/$/, '') || (req.protocol + '://' + (req.get('host') || 'localhost:3000'));
          const publicUrl = baseUrl ? `${baseUrl}${targetPath}` : targetPath;
          const qrUrl = baseUrl ? `${baseUrl}/q/${code}` : `/q/${code}`;
          const result = { offerId: offer.id, publicUrl, qrUrl, storeId: offer.store.id };
          await emitMissionEvent({ missionId, intentId, agent: 'orchestrator', type: 'completed', payload: result });
          await prisma.intentRequest.update({
            where: { id: intentId },
            data: { status: 'completed', result: { ...result, intentType: 'create_qr_for_offer' }, updatedAt: new Date() },
          });
          return res.json({ ok: true, intentId, status: 'completed', result });
        } catch (err) {
          console.warn('[MI Intents] create_qr_for_offer error:', err?.message || err);
          await emitMissionEvent({ missionId, intentId, agent: 'orchestrator', type: 'failed', payload: { message: err?.message || 'create_qr_for_offer failed' } });
          await prisma.intentRequest.update({
            where: { id: intentId },
            data: { status: 'failed', result: { error: 'create_qr_for_offer_failed', message: err?.message }, updatedAt: new Date() },
          });
          return res.json({ ok: true, intentId, status: 'failed', message: err?.message || 'create_qr_for_offer failed' });
        }
      }

      // Intent Capture: publish_offer_page / publish_intent_feed — no-op (page and feed are already public). Emit completed for UI.
      if (intentType === 'publish_offer_page' || intentType === 'publish_intent_feed') {
        const storeId = payload.storeId && typeof payload.storeId === 'string' ? payload.storeId.trim() : null;
        const baseUrl = (process.env.PUBLIC_BASE_URL || process.env.API_BASE || '').replace(/\/$/, '') || (req.protocol + '://' + (req.get('host') || 'localhost:3000'));
        const feedUrl = storeId && baseUrl ? `${baseUrl}/api/public/stores/${storeId}/intent-feed` : null;
        const result = { message: intentType === 'publish_offer_page' ? 'Offer page is live at /p/:storeSlug/offers/:offerSlug' : 'Intent feed is live', feedUrl: feedUrl || undefined };
        await emitMissionEvent({ missionId, intentId, agent: 'orchestrator', type: 'completed', payload: result });
        await prisma.intentRequest.update({
          where: { id: intentId },
          data: { status: 'completed', result: { ...result, intentType }, updatedAt: new Date() },
        });
        return res.json({ ok: true, intentId, status: 'completed', result });
      }

      const ctx = await resolveDraftContext(payload);
      if (!ctx?.draft) {
        const friendlyMessage = 'Open your draft from Mission (or add draft link to the intent), then run this again.';
        await emitMissionEvent({
          missionId,
          intentId,
          agent: 'orchestrator',
          type: 'failed',
          payload: {
            message: 'No draft context (provide draftId or generationRunId in intent payload)',
            userFriendlyMessage: friendlyMessage,
            errorCode: 'no_draft_context',
          },
        });
        await prisma.intentRequest.update({
          where: { id: intentId },
          data: {
            status: 'failed',
            result: { error: 'no_draft_context', userFriendlyMessage: friendlyMessage },
            updatedAt: new Date(),
          },
        });
        return res.json({
          ok: true,
          intentId,
          status: 'failed',
          message: friendlyMessage,
          errorCode: 'no_draft_context',
        });
      }

      const catalogTypes = new Set(['generate_tags', 'rewrite_descriptions']);
      const mediaTypes = new Set(['generate_store_hero']);

      // Foundation 2: load agentMemory and create emitContextUpdate for agents
      const mission = await prisma.mission.findUnique({
        where: { id: missionId },
        select: { context: true },
      }).catch(() => null);
      const agentMemory = mission?.context?.agentMemory ?? null;
      const { makeEmitContextUpdate } = await import('../services/miAgents/makeEmitContextUpdate.js');

      const agentStep = plan.steps.find(
        (s) => s.agentType === 'CatalogAgent' || s.agentType === 'MediaAgent'
      );
      if (agentStep) {
        await emitMissionEvent({
          missionId,
          intentId,
          agent: agentStep.agentType === 'CatalogAgent' ? 'catalog' : 'media',
          type: 'step_started',
          payload: { stepId: agentStep.stepId, agentType: agentStep.agentType },
        });
      }

      let resultPayload = null;
      try {
        if (catalogTypes.has(intentType)) {
          const emitContextUpdate = makeEmitContextUpdate(missionId, 'CatalogAgent', emitMissionEvent);
          const agentParams = { missionId, intentId, intentType, draft: ctx.draft, payload };
          const agentOpts = { missionContext: agentMemory, emitContextUpdate };
          if (intentType === 'rewrite_descriptions') {
            const { runCopyAgent } = await import('../services/miAgents/copyAgent.js');
            resultPayload = await runCopyAgent(agentParams, agentOpts);
          } else {
            const { runCatalogAgent } = await import('../services/miAgents/catalogAgent.js');
            resultPayload = await runCatalogAgent(agentParams, agentOpts);
          }
        } else if (mediaTypes.has(intentType)) {
          const { runMediaAgent } = await import('../services/miAgents/mediaAgent.js');
          const emitContextUpdate = makeEmitContextUpdate(missionId, 'MediaAgent', emitMissionEvent);
          resultPayload = await runMediaAgent(
            {
              missionId,
              intentId,
              draft: ctx.draft,
              payload,
            },
            { missionContext: agentMemory, emitContextUpdate }
          );
        } else {
          await emitMissionEvent({
            missionId,
            intentId,
            agent: 'orchestrator',
            type: 'failed',
            payload: { message: `Unknown intent type: ${intentType}` },
          });
          await prisma.intentRequest.update({
            where: { id: intentId },
            data: { status: 'failed', result: { error: 'unknown_type', intentType }, updatedAt: new Date() },
          });
          return res.json({ ok: true, intentId, status: 'failed', message: `Unknown intent type: ${intentType}` });
        }

        if (agentStep) {
          await emitMissionEvent({
            missionId,
            intentId,
            agent: agentStep.agentType === 'CatalogAgent' ? 'catalog' : 'media',
            type: 'step_completed',
            payload: { stepId: agentStep.stepId, agentType: agentStep.agentType },
          });
        }
        const agentName = catalogTypes.has(intentType) ? 'catalog' : 'media';
        await emitMissionEvent({
          missionId,
          intentId,
          agent: agentName,
          type: 'completed',
          payload: resultPayload || {},
        });
        const result = {
          ...resultPayload,
          draftId: ctx.draftId,
          draftReviewUrl: `/app/store/temp/review?mode=draft&draftId=${encodeURIComponent(ctx.draftId)}&missionId=${encodeURIComponent(missionId)}`,
        };
        await prisma.intentRequest.update({
          where: { id: intentId },
          data: { status: 'completed', result, updatedAt: new Date() },
        });
        return res.json({ ok: true, intentId, status: 'completed', result });
      } catch (agentErr) {
        console.warn('[MI Intents] Agent run error:', agentErr?.message || agentErr);
        if (agentStep) {
          await emitMissionEvent({
            missionId,
            intentId,
            agent: agentStep.agentType === 'CatalogAgent' ? 'catalog' : 'media',
            type: 'step_failed',
            payload: { stepId: agentStep.stepId, agentType: agentStep.agentType, message: agentErr?.message || 'Agent failed' },
          });
        }
        await emitMissionEvent({
          missionId,
          intentId,
          agent: catalogTypes.has(intentType) ? 'catalog' : 'media',
          type: 'failed',
          payload: { message: agentErr?.message || 'Agent failed' },
        });
        await prisma.intentRequest.update({
          where: { id: intentId },
          data: {
            status: 'failed',
            result: { error: 'agent_failed', message: agentErr?.message },
            updatedAt: new Date(),
          },
        });
        return res.json({
          ok: true,
          intentId,
          status: 'failed',
          message: agentErr?.message || 'Agent failed',
        });
      }
    } catch (err) {
      console.error('[MI Intents] POST run error:', err);
      return res.status(500).json({
        ok: false,
        error: 'internal_error',
        message: err.message || 'Failed to run intent',
      });
    }
  }
);

export default router;
