import { Router } from 'express';
import crypto from 'node:crypto';
import { requireAuth } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';
import { processCardMessage } from '../lib/cards/cardAgent.js';
import { getCardHtmlForEmbed } from '../lib/cards/cardRenderer.js';

const router = Router();

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function platformVisitorIdFor(phone, email) {
  const seed = (phone && String(phone).trim()) || (email && String(email).trim()) || '';
  if (!seed) return null;
  const hex = crypto.createHash('sha256').update(seed, 'utf8').digest('hex');
  return hex.slice(0, 16);
}

function parseDataUrlPng(dataUrl) {
  const s = typeof dataUrl === 'string' ? dataUrl : '';
  const m = s.match(/^data:image\/png;base64,(.+)$/i);
  if (!m) return null;
  try {
    return Buffer.from(m[1], 'base64');
  } catch {
    return null;
  }
}

router.get('/', requireAuth, async (req, res) => {
  const prisma = getPrismaClient();
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ ok: false, error: 'auth_required' });
  const rows = await prisma.card.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      type: true,
      title: true,
      status: true,
      designJson: true,
      liveUrl: true,
      qrCodeUrl: true,
      createdAt: true,
    },
  });
  /** Card has no Prisma relations yet — mirror SmartDocument list shape for UIs that expect `_count`. */
  const cards = rows.map((c) => ({
    ...c,
    _count: { stamps: 0, redemptions: 0, rsvps: 0, conversations: 0, checkIns: 0 },
  }));
  return res.status(200).json({ ok: true, cards });
});

router.get('/:cardId', async (req, res) => {
  const prisma = getPrismaClient();
  const cardId = String(req.params.cardId ?? '').trim();
  if (!cardId) return res.status(400).json({ ok: false, error: 'card_id_required' });

  const authedUserId = req.user?.id ?? null;
  if (authedUserId) {
    const card = await prisma.card.findUnique({
      where: { id: cardId },
      select: {
  id: true,
  type: true,
  title: true,
  status: true,
  designJson: true,
  liveUrl: true,
  qrCodeUrl: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
  agentPersonality: true,
  knowledgeBase: true,
  capabilities: true,
  autoApprove: true,
  sizeW: true,
  sizeH: true,
  sizeUnit: true,
  sizeDpi: true,
},
    });
    if (!card) return res.status(404).json({ ok: false, error: 'not_found' });
    if (card.userId !== authedUserId) return res.status(403).json({ ok: false, error: 'forbidden' });
    return res.status(200).json({ ok: true, card });
  }

  const sessionToken = typeof req.query.sessionToken === 'string' ? req.query.sessionToken.trim() : '';
  if (!sessionToken) return res.status(403).json({ ok: false, error: 'session_token_required' });
  const visitor = await prisma.cardVisitor.findFirst({ where: { cardId, sessionToken }, select: { id: true } });
  if (!visitor) return res.status(403).json({ ok: false, error: 'invalid_session' });

  const card = await prisma.card.findUnique({
    where: { id: cardId },
    select: {
      id: true,
      type: true,
      title: true,
      designJson: true,
      liveUrl: true,
      qrCodeUrl: true,
      agentPersonality: true,
      createdAt: true,
    },
  });
  if (!card) return res.status(404).json({ ok: false, error: 'not_found' });
  return res.status(200).json({ ok: true, card });
});

router.post('/:cardId/chat', async (req, res) => {
  const cardId = String(req.params.cardId ?? '').trim();
  const body = asObject(req.body);
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const sessionToken = typeof body.sessionToken === 'string' ? body.sessionToken.trim() : '';
  const channel = typeof body.channel === 'string' ? body.channel.trim() : 'web';

  if (!cardId) return res.status(400).json({ ok: false, error: 'card_id_required' });
  if (!message) return res.status(400).json({ ok: false, error: 'message_required' });
  if (!sessionToken) return res.status(400).json({ ok: false, error: 'session_token_required' });

  const out = await processCardMessage(cardId, sessionToken, message, channel, {});
  return res.status(200).json(out);
});

router.post('/:cardId/visitor', async (req, res) => {
  const prisma = getPrismaClient();
  const cardId = String(req.params.cardId ?? '').trim();
  const body = asObject(req.body);
  const sessionToken = typeof body.sessionToken === 'string' ? body.sessionToken.trim() : '';
  if (!cardId) return res.status(400).json({ ok: false, error: 'card_id_required' });
  if (!sessionToken) return res.status(400).json({ ok: false, error: 'session_token_required' });

  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const platformVisitorId = platformVisitorIdFor(phone, email);

  const visitor = await prisma.cardVisitor.upsert({
    where: { sessionToken },
    create: {
      cardId,
      sessionToken,
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
      ...(name ? { name } : {}),
      ...(platformVisitorId ? { platformVisitorId } : {}),
    },
    update: {
      cardId,
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
      ...(name ? { name } : {}),
      ...(platformVisitorId ? { platformVisitorId } : {}),
    },
    select: { id: true, sessionToken: true },
  });
  return res.status(200).json({ ok: true, visitorId: visitor.id, sessionToken: visitor.sessionToken });
});

router.get('/:cardId/view', async (req, res) => {
  const prisma = getPrismaClient();
  const cardId = String(req.params.cardId ?? '').trim();
  if (!cardId) return res.status(400).send('cardId required');
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    select: {
      id: true,
      type: true,
      title: true,
      designJson: true,
      liveUrl: true,
      qrCodeUrl: true,
      sizeW: true,
      sizeH: true,
      sizeUnit: true,
      sizeDpi: true,
    },
  });
  if (!card) return res.status(404).send('not_found');
  const html = getCardHtmlForEmbed(card);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(html);
});

router.get('/:cardId/qr', async (req, res) => {
  const prisma = getPrismaClient();
  const cardId = String(req.params.cardId ?? '').trim();
  if (!cardId) return res.status(400).send('cardId required');
  const card = await prisma.card.findUnique({ where: { id: cardId }, select: { qrCodeUrl: true } });
  const qr = card?.qrCodeUrl ?? null;
  if (!qr) return res.status(404).json({ ok: false, error: 'no_qr' });

  const png = parseDataUrlPng(qr);
  if (png) {
    res.setHeader('Content-Type', 'image/png');
    return res.status(200).send(png);
  }
  if (typeof qr === 'string' && /^https?:\/\//i.test(qr)) return res.redirect(302, qr);
  return res.status(200).json({ ok: true, qrCodeUrl: qr });
});

router.delete('/:cardId', requireAuth, async (req, res) => {
  const prisma = getPrismaClient();
  const userId = req.user?.id;
  const cardId = String(req.params.cardId ?? '').trim();
  if (!userId) return res.status(401).json({ ok: false, error: 'auth_required' });
  if (!cardId) return res.status(400).json({ ok: false, error: 'card_id_required' });

  const card = await prisma.card.findUnique({ where: { id: cardId }, select: { id: true, userId: true } });
  if (!card) return res.status(404).json({ ok: false, error: 'not_found' });
  if (card.userId !== userId) return res.status(403).json({ ok: false, error: 'forbidden' });
  await prisma.card.update({ where: { id: cardId }, data: { status: 'archived' } });
  return res.status(200).json({ ok: true });
});

export default router;

