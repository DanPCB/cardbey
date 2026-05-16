/**
 * Smart Document Routes — CC-3
 *
 * Mounts at:
 *   /api/docs   (primary SmartDocument endpoints)
 *   /api/cards  (legacy alias — SmartDocument with docType=card)
 *
 * Public endpoints (no auth):
 *   GET  /:id/view          — render document HTML (live page)
 *   GET  /:id/qr            — redirect to QR code data URL
 *   POST /:id/chat          — visitor chat message
 *   POST /:id/visitor       — upsert visitor session
 *
 * Authenticated endpoints:
 *   GET  /                  — list user's documents
 *   POST /                  — create a new document (buildSmartDocument)
 *   GET  /:id               — get document JSON
 *   DELETE /:id             — archive document
 *   GET  /:id/scheduled     — list scheduled messages
 *   POST /:id/schedule      — create a scheduled message
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';
import { buildSmartDocument } from '../lib/smartDocument/buildSmartDocument.js';
import {
  renderDocument,
  renderDocumentFromCardRow,
  ensureStandardsModeHtml,
} from '../lib/smartDocument/documentRenderer.js';
import { processDocMessage } from '../lib/smartDocument/documentAgent.js';
import { scheduleMessage } from '../lib/smartDocument/messageScheduler.js';
import { resolvePhase } from '../lib/smartDocument/phaseEngine.js';
import { emitHealthProbe } from '../lib/telemetry/healthProbes.js';

const router = Router();

// ── Helpers ────────────────────────────────────────────────────────────────

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function pickSessionToken(req) {
  const body = asObject(req.body);
  const q = asObject(req.query);
  const h = req.headers ?? {};
  const tok =
    body.sessionToken ||
    q.sessionToken ||
    h['x-session-token'] ||
    h['x-visitor-token'] ||
    '';
  return typeof tok === 'string' && tok.trim().length >= 8 ? tok.trim() : null;
}

// ── Public: render document (HTML) ────────────────────────────────────────

router.get('/:id/view', async (req, res) => {
  const prisma = getPrismaClient();
  const id = String(req.params.id ?? '').trim();
  if (!id) return res.status(400).send('Document ID required');

  try {
    const doc = await prisma.smartDocument.findUnique({ where: { id } });
    if (doc) {
      if (doc.status === 'archived') return res.status(410).send('Document no longer available');

      // Lazy phase update
      const { phase, needsUpdate } = resolvePhase({ ...doc, stampCount: 0 });
      if (needsUpdate) {
        prisma.smartDocument.update({ where: { id }, data: { phase } }).catch(() => {});
      }

      emitHealthProbe('card_created', { docId: id, docType: doc.docType, viewed: true });

      const html = ensureStandardsModeHtml(renderDocument({ ...doc, phase }, { includeChatWidget: true }));
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
      return res.send(html);
    }

    const card = await prisma.card.findUnique({ where: { id } });
    if (card) {
      if (String(card.status || '').toLowerCase() === 'archived') {
        return res.status(410).send('Document no longer available');
      }
      emitHealthProbe('card_created', { docId: id, docType: 'card', viewed: true });
      const html = ensureStandardsModeHtml(renderDocumentFromCardRow(card, { includeChatWidget: true }));
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
      return res.send(html);
    }

    return res.status(404).send('Document not found');
  } catch (e) {
    console.error('[smartDocumentRoutes] GET /:id/view failed:', e?.message ?? e);
    return res.status(500).send('Internal error');
  }
});

// ── Public: QR code ────────────────────────────────────────────────────────

router.get('/:id/qr', async (req, res) => {
  const prisma = getPrismaClient();
  const id = String(req.params.id ?? '').trim();
  if (!id) return res.status(400).send('Document ID required');

  try {
    const doc = await prisma.smartDocument.findUnique({ where: { id }, select: { qrCodeUrl: true, liveUrl: true } });
    if (!doc) return res.status(404).json({ ok: false, error: 'not_found' });
    const qr = typeof doc.qrCodeUrl === 'string' ? doc.qrCodeUrl.trim() : '';
    if (!qr) return res.status(404).json({ ok: false, error: 'qr_not_generated' });
    return res.json({ ok: true, qrCodeUrl: qr, liveUrl: doc.liveUrl });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

// ── Public: visitor upsert ─────────────────────────────────────────────────

router.post('/:id/visitor', async (req, res) => {
  const prisma = getPrismaClient();
  const docId = String(req.params.id ?? '').trim();
  const body = asObject(req.body);
  const sessionToken = typeof body.sessionToken === 'string' ? body.sessionToken.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : null;
  const email = typeof body.email === 'string' ? body.email.trim() : null;
  const name = typeof body.name === 'string' ? body.name.trim() : null;

  if (!docId) return res.status(400).json({ ok: false, error: 'doc_id_required' });
  if (!sessionToken) return res.status(400).json({ ok: false, error: 'session_token_required' });

  try {
    const visitor = await prisma.docVisitor.upsert({
      where: { sessionToken },
      create: {
        docId,
        sessionToken,
        ...(phone ? { phone } : {}),
        ...(email ? { email } : {}),
        ...(name ? { name } : {}),
      },
      update: {
        docId,
        ...(phone ? { phone } : {}),
        ...(email ? { email } : {}),
        ...(name ? { name } : {}),
      },
      select: { id: true, name: true, phone: true, email: true },
    });
    return res.json({ ok: true, visitor });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'internal_error', message: e?.message });
  }
});

// ── Public: chat ───────────────────────────────────────────────────────────

router.post('/:id/chat', async (req, res) => {
  const docId = String(req.params.id ?? '').trim();
  const body = asObject(req.body);
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const sessionToken = pickSessionToken(req) ?? (typeof body.sessionToken === 'string' ? body.sessionToken.trim() : '');
  const channel = typeof body.channel === 'string' && body.channel.trim() ? body.channel.trim() : 'web';

  if (!docId) return res.status(400).json({ ok: false, error: 'doc_id_required' });
  if (!message) return res.status(400).json({ ok: false, error: 'message_required' });

  const result = await processDocMessage(docId, sessionToken, message, channel, {});
  return res.json({ ok: true, ...result });
});

// ── Public: lightweight metadata (DocView container) ──────────────────────

router.get('/:id/public', async (req, res) => {
  const prisma = getPrismaClient();
  const id = String(req.params.id ?? '').trim();
  if (!id) return res.status(400).json({ ok: false, error: 'doc_id_required' });
  try {
    const doc = await prisma.smartDocument.findUnique({
      where: { id },
      select: {
        id: true,
        docType: true,
        subtype: true,
        title: true,
        phase: true,
        status: true,
        designJson: true,
        liveUrl: true,
      },
    });
    if (!doc || doc.status === 'archived') {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    return res.json({ ok: true, document: doc });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'internal_error', message: e?.message });
  }
});

// ── Public: pending notifications for visitor (scheduled, due) ─────────────

router.get('/:id/notifications', async (req, res) => {
  const prisma = getPrismaClient();
  const docId = String(req.params.id ?? '').trim();
  const q = asObject(req.query);
  const sessionToken = typeof q.sessionToken === 'string' ? q.sessionToken.trim() : '';
  if (!docId) return res.status(400).json({ ok: false, error: 'doc_id_required' });
  if (!sessionToken) return res.json({ ok: true, notifications: [] });

  try {
    const visitor = await prisma.docVisitor.findFirst({
      where: { docId, sessionToken },
      select: { id: true },
    });
    if (!visitor) return res.json({ ok: true, notifications: [] });

    const now = new Date();
    const rows = await prisma.docScheduledMessage.findMany({
      where: {
        docId,
        status: 'pending',
        sendAt: { lte: now },
      },
      orderBy: { sendAt: 'asc' },
      take: 20,
    });

    const notifications = rows
      .filter((m) => {
        const p = m.payload != null && typeof m.payload === 'object' ? m.payload : {};
        const tok = typeof p.sessionToken === 'string' ? p.sessionToken.trim() : '';
        return !tok || tok === sessionToken;
      })
      .map((m) => {
        const p = m.payload != null && typeof m.payload === 'object' ? m.payload : {};
        const message =
          typeof p.message === 'string'
            ? p.message
            : typeof p.text === 'string'
              ? p.text
              : '';
        return {
          id: m.id,
          message: message || 'Reminder',
          sendAt: m.sendAt?.toISOString?.() ?? null,
        };
      });

    return res.json({ ok: true, notifications });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'internal_error', message: e?.message });
  }
});

// ── Authenticated: list documents ──────────────────────────────────────────

router.get('/', requireAuth, async (req, res) => {
  const prisma = getPrismaClient();
  const userId = req.user?.id;
  const q = asObject(req.query);
  const docType = typeof q.type === 'string' ? q.type.trim() : undefined;

  try {
    const docs = await prisma.smartDocument.findMany({
      where: { userId, ...(docType ? { docType } : {}), status: { not: 'archived' } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        docType: true,
        subtype: true,
        title: true,
        status: true,
        phase: true,
        liveUrl: true,
        qrCodeUrl: true,
        renderedUrl: true,
        designJson: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            stamps: true,
            redemptions: true,
            rsvps: true,
            conversations: true,
            checkIns: true,
          },
        },
      },
    });

    /** Suitcase “digital cards” from buildCard — same list shape as SmartDocument rows. */
    let fromCardTable = [];
    if (prisma.card && typeof prisma.card.findMany === 'function' && (!docType || docType === 'card')) {
      const rows = await prisma.card.findMany({
        where: { userId, status: { not: 'archived' } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          type: true,
          title: true,
          status: true,
          liveUrl: true,
          qrCodeUrl: true,
          designJson: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      fromCardTable = rows.map((c) => ({
        id: c.id,
        docType: 'card',
        subtype: c.type,
        title: c.title,
        status: c.status,
        phase: 'active',
        liveUrl: c.liveUrl,
        qrCodeUrl: c.qrCodeUrl,
        renderedUrl: null,
        designJson: c.designJson,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        _count: { stamps: 0, redemptions: 0, rsvps: 0, conversations: 0, checkIns: 0 },
      }));
    }

    const merged = [...docs, ...fromCardTable]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 100);

    return res.json({ ok: true, documents: merged });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'internal_error', message: e?.message });
  }
});

// ── Authenticated: create document ─────────────────────────────────────────

router.post('/', requireAuth, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ ok: false, error: 'auth_required' });

  const body = asObject(req.body);

  const result = await buildSmartDocument(
    body.missionId ?? null,
    {
      type: body.type ?? body.docType ?? 'card',
      subtype: body.subtype ?? null,
      title: body.title ?? null,
      businessName: body.businessName ?? null,
      businessType: body.businessType ?? null,
      colorPrimary: body.colorPrimary ?? null,
      logoUrl: body.logoUrl ?? null,
      eventDate: body.eventDate ?? null,
      eventVenue: body.eventVenue ?? null,
      stampThreshold: typeof body.stampThreshold === 'number' ? body.stampThreshold : null,
      offer: body.offer ?? null,
      sizeVariant: body.sizeVariant ?? null,
    },
    { userId, tenantId: body.tenantId ?? userId },
  );

  if (result.error) {
    return res.status(500).json({ ok: false, error: result.error, partial: result.partial ?? false });
  }
  return res.status(201).json({ ok: true, ...result });
});

// ── Authenticated: host dashboard (stats + escalations + schedule) ─────────

router.get('/:id/dashboard', requireAuth, async (req, res) => {
  const prisma = getPrismaClient();
  const userId = req.user?.id;
  const docId = String(req.params.id ?? '').trim();
  if (!userId) return res.status(401).json({ ok: false, error: 'auth_required' });
  if (!docId) return res.status(400).json({ ok: false, error: 'doc_id_required' });

  try {
    const doc = await prisma.smartDocument.findUnique({
      where: { id: docId },
      select: {
        id: true,
        userId: true,
        docType: true,
        subtype: true,
        title: true,
        phase: true,
        status: true,
      },
    });
    if (!doc) return res.status(404).json({ ok: false, error: 'not_found' });
    if (doc.userId !== userId) return res.status(403).json({ ok: false, error: 'forbidden' });

    const [
      rsvpAttending,
      rsvpDeclined,
      rsvpMaybe,
      checkInCount,
      escalated,
      scheduledUpcoming,
    ] = await Promise.all([
      prisma.eventRsvp.count({ where: { docId, status: 'attending' } }),
      prisma.eventRsvp.count({ where: { docId, status: 'declined' } }),
      prisma.eventRsvp.count({ where: { docId, status: 'maybe' } }),
      prisma.docCheckIn.count({ where: { docId } }),
      prisma.docConversation.findMany({
        where: { docId, outcome: 'escalated' },
        orderBy: { updatedAt: 'desc' },
        take: 3,
        include: {
          visitor: { select: { id: true, name: true, email: true, phone: true } },
        },
      }),
      prisma.docScheduledMessage.findMany({
        where: { docId, status: 'pending', sendAt: { gte: new Date() } },
        orderBy: { sendAt: 'asc' },
        take: 10,
      }),
    ]);

    const recentConversations = escalated.map((c) => {
      let lastText = '';
      const msgs = Array.isArray(c.messages) ? c.messages : [];
      for (let i = msgs.length - 1; i >= 0; i--) {
        const row = msgs[i];
        const t =
          row && typeof row === 'object' && typeof row.content === 'string'
            ? row.content
            : typeof row === 'string'
              ? row
              : '';
        if (t) {
          lastText = t;
          break;
        }
      }
      return {
        id: c.id,
        visitorName: c.visitor?.name ?? null,
        visitorEmail: c.visitor?.email ?? null,
        lastMessage: lastText,
      };
    });

    const scheduledMessages = scheduledUpcoming.slice(0, 3).map((m) => {
      const p = m.payload != null && typeof m.payload === 'object' ? m.payload : {};
      const preview =
        typeof p.message === 'string'
          ? p.message
          : typeof p.text === 'string'
            ? p.text
            : '';
      return {
        id: m.id,
        sendAt: m.sendAt?.toISOString?.() ?? null,
        messagePreview: preview || 'Scheduled message',
      };
    });

    return res.json({
      ok: true,
      dashboard: {
        doc,
        rsvp: { attending: rsvpAttending, declined: rsvpDeclined, maybe: rsvpMaybe },
        checkIns: checkInCount,
        recentConversations,
        scheduledMessages,
      },
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'internal_error', message: e?.message });
  }
});

router.patch('/:id/phase', requireAuth, async (req, res) => {
  const prisma = getPrismaClient();
  const userId = req.user?.id;
  const id = String(req.params.id ?? '').trim();
  const body = asObject(req.body);
  const phase = typeof body.phase === 'string' ? body.phase.trim().toLowerCase() : '';
  if (!userId) return res.status(401).json({ ok: false, error: 'auth_required' });
  if (!id) return res.status(400).json({ ok: false, error: 'doc_id_required' });
  if (!['pre', 'active', 'post'].includes(phase)) {
    return res.status(400).json({ ok: false, error: 'invalid_phase' });
  }
  try {
    const doc = await prisma.smartDocument.findUnique({ where: { id }, select: { userId: true } });
    if (!doc) return res.status(404).json({ ok: false, error: 'not_found' });
    if (doc.userId !== userId) return res.status(403).json({ ok: false, error: 'forbidden' });
    await prisma.smartDocument.update({ where: { id }, data: { phase } });
    return res.json({ ok: true, phase });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'internal_error', message: e?.message });
  }
});

router.post('/:id/broadcast', requireAuth, async (req, res) => {
  const prisma = getPrismaClient();
  const userId = req.user?.id;
  const docId = String(req.params.id ?? '').trim();
  const body = asObject(req.body);
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const channel = typeof body.channel === 'string' && body.channel.trim() ? body.channel.trim() : 'web';
  if (!userId) return res.status(401).json({ ok: false, error: 'auth_required' });
  if (!docId) return res.status(400).json({ ok: false, error: 'doc_id_required' });
  if (!message) return res.status(400).json({ ok: false, error: 'message_required' });
  try {
    const doc = await prisma.smartDocument.findUnique({ where: { id: docId }, select: { userId: true } });
    if (!doc) return res.status(404).json({ ok: false, error: 'not_found' });
    if (doc.userId !== userId) return res.status(403).json({ ok: false, error: 'forbidden' });
    const sentTo = await prisma.docVisitor.count({ where: { docId } });
    emitHealthProbe('doc_broadcast', { docId, channel, visitorCount: sentTo });
    return res.json({ ok: true, sentTo });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'internal_error', message: e?.message });
  }
});

// ── Authenticated: get document ────────────────────────────────────────────

router.get('/:id', requireAuth, async (req, res) => {
  const prisma = getPrismaClient();
  const userId = req.user?.id;
  const id = String(req.params.id ?? '').trim();

  try {
    const doc = await prisma.smartDocument.findUnique({ where: { id } });
    if (doc) {
      if (doc.userId !== userId) return res.status(403).json({ ok: false, error: 'forbidden' });
      return res.json({ ok: true, document: doc });
    }
    /** Suitcase digital cards use `Card.id`; list APIs may still route GET /api/docs/:id here. */
    const card = await prisma.card.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        type: true,
        title: true,
        status: true,
        designJson: true,
        agentPersonality: true,
        knowledgeBase: true,
        capabilities: true,
        autoApprove: true,
        liveUrl: true,
        qrCodeUrl: true,
        sizeW: true,
        sizeH: true,
        sizeUnit: true,
        sizeDpi: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!card) return res.status(404).json({ ok: false, error: 'not_found' });
    if (card.userId !== userId) return res.status(403).json({ ok: false, error: 'forbidden' });
    const asDoc = {
      id: card.id,
      userId: card.userId,
      businessId: null,
      docType: 'card',
      subtype: card.type,
      title: card.title,
      status: card.status,
      phase: 'active',
      designJson: card.designJson,
      renderedUrl: null,
      printUrl: null,
      qrCodeUrl: card.qrCodeUrl,
      liveUrl: card.liveUrl,
      sizeW: card.sizeW,
      sizeH: card.sizeH,
      sizeUnit: card.sizeUnit,
      sizeDpi: card.sizeDpi,
      agentPersonality: card.agentPersonality,
      knowledgeBase: card.knowledgeBase,
      capabilities: card.capabilities,
      autoApprove: card.autoApprove,
      phaseConfig: null,
      expiresAt: null,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
    };
    return res.json({ ok: true, document: asDoc });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'internal_error', message: e?.message });
  }
});

// ── Authenticated: archive document ───────────────────────────────────────

router.delete('/:id', requireAuth, async (req, res) => {
  const prisma = getPrismaClient();
  const userId = req.user?.id;
  const id = String(req.params.id ?? '').trim();
  if (!userId) return res.status(401).json({ ok: false, error: 'auth_required' });
  if (!id) return res.status(400).json({ ok: false, error: 'doc_id_required' });

  try {
    const doc = await prisma.smartDocument.findUnique({ where: { id }, select: { id: true, userId: true } });
    if (doc) {
      if (doc.userId !== userId) return res.status(403).json({ ok: false, error: 'forbidden' });
      await prisma.smartDocument.update({ where: { id }, data: { status: 'archived' } });
      return res.json({ ok: true });
    }

    /** Suitcase `Card` rows share list/preview with SmartDocument but live in `card` table — mirror DELETE /api/cards/:id. */
    if (prisma.card && typeof prisma.card.findUnique === 'function') {
      const card = await prisma.card.findUnique({ where: { id }, select: { id: true, userId: true } });
      if (card) {
        if (card.userId !== userId) return res.status(403).json({ ok: false, error: 'forbidden' });
        await prisma.card.update({ where: { id }, data: { status: 'archived' } });
        return res.json({ ok: true });
      }
    }

    return res.status(404).json({ ok: false, error: 'not_found' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'internal_error', message: e?.message });
  }
});

// ── Authenticated: scheduled messages ─────────────────────────────────────

router.get('/:id/scheduled', requireAuth, async (req, res) => {
  const prisma = getPrismaClient();
  const userId = req.user?.id;
  const docId = String(req.params.id ?? '').trim();

  try {
    const doc = await prisma.smartDocument.findUnique({ where: { id: docId }, select: { userId: true } });
    if (!doc) return res.status(404).json({ ok: false, error: 'not_found' });
    if (doc.userId !== userId) return res.status(403).json({ ok: false, error: 'forbidden' });

    const messages = await prisma.docScheduledMessage.findMany({
      where: { docId },
      orderBy: { sendAt: 'asc' },
      take: 100,
    });
    return res.json({ ok: true, messages });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'internal_error', message: e?.message });
  }
});

router.post('/:id/schedule', requireAuth, async (req, res) => {
  const userId = req.user?.id;
  const docId = String(req.params.id ?? '').trim();
  const body = asObject(req.body);
  const sendAt = body.sendAt;
  const channel = typeof body.channel === 'string' ? body.channel.trim() : 'web';
  const payload = asObject(body.payload);

  if (!sendAt) return res.status(400).json({ ok: false, error: 'sendAt_required' });

  try {
    const prisma = getPrismaClient();
    const doc = await prisma.smartDocument.findUnique({ where: { id: docId }, select: { userId: true } });
    if (!doc) return res.status(404).json({ ok: false, error: 'not_found' });
    if (doc.userId !== userId) return res.status(403).json({ ok: false, error: 'forbidden' });

    const row = await scheduleMessage({ docId, sendAt, channel, payload });
    return res.status(201).json({ ok: true, id: row.id });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'internal_error', message: e?.message });
  }
});

export default router;
