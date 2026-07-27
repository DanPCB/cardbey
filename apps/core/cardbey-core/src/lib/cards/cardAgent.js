import crypto from 'node:crypto';
import { getPrismaClient } from '../prisma.js';
import { emitHealthProbe } from '../telemetry/healthProbes.js';
import { createCalendarEvent } from '../externalActions/index.js';

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function safeChannel(channel) {
  const c = typeof channel === 'string' ? channel.trim().toLowerCase() : 'web';
  return c === 'sms' || c === 'email' || c === 'web' ? c : 'web';
}

function parseCapabilities(raw) {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function platformVisitorIdFor(phone, email) {
  const seed = (phone && String(phone).trim()) || (email && String(email).trim()) || '';
  if (!seed) return null;
  const hex = crypto.createHash('sha256').update(seed, 'utf8').digest('hex');
  return hex.slice(0, 16);
}

function parseActionMarker(text) {
  const s = typeof text === 'string' ? text : '';
  const m = s.match(/\s*\[ACTION:([a-z_]+)([^\]]*)\]\s*$/i);
  if (!m) return { cleanReply: s.trim(), action: null, args: {} };
  const action = String(m[1] || '').trim().toLowerCase();
  const tail = String(m[2] || '').trim();
  const args = {};
  if (tail) {
    const re = /(\w+)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s]+))/g;
    let mm;
    while ((mm = re.exec(tail))) {
      const k = String(mm[1] || '').trim();
      const v = (mm[2] ?? mm[3] ?? mm[4] ?? '').toString().trim();
      if (k) args[k] = v;
    }
  }
  const cleanReply = s.slice(0, m.index).trim();
  return { cleanReply, action, args };
}

function buildPrompt({ card, visitor, conversation, capabilities, userMessage }) {
  const kb = asObject(card.knowledgeBase);
  const personality =
    (typeof card.agentPersonality === 'string' && card.agentPersonality.trim()) || 'helpful assistant';
  const history = Array.isArray(conversation?.messages) ? conversation.messages : [];
  const recent = history.slice(-10);
  const historyText = recent
    .map((m) => {
      const mm = asObject(m);
      const role = typeof mm.role === 'string' ? mm.role : 'unknown';
      const content = typeof mm.content === 'string' ? mm.content : '';
      return `${role.toUpperCase()}: ${content}`;
    })
    .join('\n');

  return [
    `You are ${personality} for "${card.title}".`,
    ``,
    `Card type: ${card.type}`,
    `Your capabilities: ${capabilities.join(', ') || '(none)'}`,
    ``,
    `Your knowledge:`,
    JSON.stringify(kb, null, 2),
    ``,
    `Visitor context:`,
    JSON.stringify(
      {
        name: visitor?.name ?? null,
        phone: visitor?.phone ?? null,
        email: visitor?.email ?? null,
      },
      null,
      2,
    ),
    ``,
    `Rules:`,
    `- Be helpful and concise.`,
    `- When you need to perform an action, include an action marker at the END of your reply:`,
    `  [ACTION:record_stamp]`,
    `  [ACTION:redeem_promo code=SAVE30]`,
    `  [ACTION:record_rsvp status=attending]`,
    `  [ACTION:capture_lead phone=xxx]`,
    `  [ACTION:capture_lead email=xxx]`,
    `  [ACTION:book_appointment datetime=2026-04-14T10:00:00Z]`,
    `- Only use actions from your capabilities list.`,
    `- Ask for name/phone/email naturally when needed for an action.`,
    ``,
    historyText ? `Conversation history (most recent last):\n${historyText}\n` : '',
    `Visitor message: ${userMessage}`,
  ]
    .filter(Boolean)
    .join('\n');
}

async function executeAction({ prisma, card, visitor, action, args }) {
  const nowIso = new Date().toISOString();
  if (!action) return { actionResult: null, outcome: null };

  if (action === 'record_stamp') {
    const row = await prisma.loyaltyStamp.create({
      data: { docId: card.id, visitorId: visitor.id, stampedAt: new Date() },
      select: { id: true, stampedAt: true },
    });
    emitHealthProbe('card_action_executed', { cardId: card.id, action, visitorId: visitor.id, ok: true });
    return { actionResult: { stampId: row.id, stampedAt: row.stampedAt, at: nowIso }, outcome: action };
  }

  if (action === 'redeem_promo') {
    const code = typeof args.code === 'string' ? args.code.trim() : '';
    const row = await prisma.promoRedemption.create({
      data: { docId: card.id, visitorId: visitor.id, discountApplied: code || null, redeemedAt: new Date() },
      select: { id: true, redeemedAt: true, discountApplied: true },
    });
    emitHealthProbe('card_action_executed', { cardId: card.id, action, visitorId: visitor.id, ok: true });
    return {
      actionResult: { redemptionId: row.id, redeemedAt: row.redeemedAt, discountApplied: row.discountApplied, at: nowIso },
      outcome: action,
    };
  }

  if (action === 'record_rsvp') {
    const status = typeof args.status === 'string' ? args.status.trim().toLowerCase() : '';
    const safe = status === 'attending' || status === 'declined' || status === 'maybe' ? status : 'maybe';
    const row = await prisma.eventRsvp.create({
      data: { docId: card.id, visitorId: visitor.id, status: safe, rsvpAt: new Date() },
      select: { id: true, status: true, rsvpAt: true },
    });
    emitHealthProbe('card_action_executed', { cardId: card.id, action, visitorId: visitor.id, ok: true });
    return { actionResult: { rsvpId: row.id, status: row.status, rsvpAt: row.rsvpAt, at: nowIso }, outcome: action };
  }

  if (action === 'capture_lead') {
    const phone = typeof args.phone === 'string' ? args.phone.trim() : '';
    const email = typeof args.email === 'string' ? args.email.trim() : '';
    const platformVisitorId = platformVisitorIdFor(phone || visitor.phone, email || visitor.email);
    const next = await prisma.docVisitor.update({
      where: { id: visitor.id },
      data: {
        ...(phone ? { phone } : {}),
        ...(email ? { email } : {}),
        ...(platformVisitorId ? { platformVisitorId } : {}),
      },
      select: { id: true, phone: true, email: true, platformVisitorId: true },
    });
    emitHealthProbe('card_action_executed', { cardId: card.id, action, visitorId: visitor.id, ok: true });
    return { actionResult: { visitor: next, at: nowIso }, outcome: 'lead_captured' };
  }

  if (action === 'book_appointment') {
    const dt = typeof args.datetime === 'string' ? args.datetime.trim() : '';
    if (!dt) {
      emitHealthProbe('card_action_executed', { cardId: card.id, action, visitorId: visitor.id, ok: false });
      return { actionResult: { ok: false, error: 'missing_datetime' }, outcome: null };
    }
    try {
      const start = new Date(dt);
      const end = new Date(start.getTime() + 30 * 60 * 1000);
      const res = await createCalendarEvent(
        card.id,
        {
          summary: `Appointment: ${card.title}`.slice(0, 120),
          startDateTime: start.toISOString(),
          endDateTime: end.toISOString(),
          timeZone: 'UTC',
          description: visitor?.name ? `Visitor: ${visitor.name}` : undefined,
        },
        { prisma, userId: card.userId },
      );
      emitHealthProbe('card_action_executed', { cardId: card.id, action, visitorId: visitor.id, ok: Boolean(res?.ok) });
      return { actionResult: res, outcome: 'booked' };
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[cardAgent] book_appointment failed:', e?.message ?? e);
      emitHealthProbe('card_action_executed', { cardId: card.id, action, visitorId: visitor.id, ok: false });
      return { actionResult: { ok: false, error: e?.message ?? String(e) }, outcome: null };
    }
  }

  emitHealthProbe('card_action_executed', { cardId: card.id, action, visitorId: visitor.id, ok: false });
  return { actionResult: { ok: false, error: 'unsupported_action' }, outcome: null };
}

export async function processCardMessage(cardId, visitorToken, message, channel, options = {}) {
  try {
    const prisma = options.prisma ?? getPrismaClient();
    const cid = typeof cardId === 'string' ? cardId.trim() : '';
    const token = typeof visitorToken === 'string' ? visitorToken.trim() : '';
    const userMessage = typeof message === 'string' ? message.trim() : '';
    const ch = safeChannel(channel);

    if (!cid || !token || !userMessage) {
      return {
        reply: "I'm having trouble right now, please try again in a moment.",
        action: null,
        actionResult: null,
      };
    }

    const card = await prisma.smartDocument.findUnique({
      where: { id: cid },
      select: {
        id: true,
        userId: true,
        title: true,
        type: true,
        autoApprove: true,
        agentPersonality: true,
        knowledgeBase: true,
        capabilities: true,
      },
    });
    if (!card) {
      return {
        reply: "I'm having trouble right now, please try again in a moment.",
        action: null,
        actionResult: null,
      };
    }

    const visitor = await prisma.docVisitor.upsert({
      where: { sessionToken: token },
      create: { docId: card.id, sessionToken: token },
      update: { docId: card.id },
      select: { id: true, name: true, phone: true, email: true },
    });

    let convo = await prisma.docConversation.findFirst({
      where: { docId: card.id, visitorId: visitor.id, channel: ch },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, messages: true },
    });
    if (!convo) {
      convo = await prisma.docConversation.create({
        data: { docId: card.id, visitorId: visitor.id, channel: ch, messages: [] },
        select: { id: true, messages: true },
      });
    }

    const capabilities = parseCapabilities(card.capabilities);
    const prompt = buildPrompt({
      card,
      visitor,
      conversation: convo,
      capabilities,
      userMessage,
    });

    const provider =
      typeof process.env.LLM_DEFAULT_PROVIDER === 'string' && process.env.LLM_DEFAULT_PROVIDER.trim()
        ? process.env.LLM_DEFAULT_PROVIDER.trim()
        : undefined;
    const model =
      typeof process.env.LLM_DEFAULT_MODEL === 'string' && process.env.LLM_DEFAULT_MODEL.trim()
        ? process.env.LLM_DEFAULT_MODEL.trim()
        : undefined;

    const tenantKey =
      typeof options.tenantKey === 'string' && options.tenantKey.trim()
        ? options.tenantKey.trim()
        : card.userId || 'card-agent';

    const { llmGateway } = await import('../llm/llmGateway.ts');
    const llm = await llmGateway.generate({
      purpose: 'card_agent_message',
      prompt,
      tenantKey,
      ...(provider ? { provider } : {}),
      ...(model ? { model } : {}),
      maxTokens: 400,
      temperature: 0.4,
    });

    const rawReply = typeof llm?.text === 'string' ? llm.text.trim() : '';
    const parsed = parseActionMarker(rawReply);
    const actionName = parsed.action && capabilities.includes(parsed.action) ? parsed.action : null;

    let actionResult = null;
    let outcome = null;
    if (actionName && card.autoApprove === true) {
      const exec = await executeAction({
        prisma,
        card,
        visitor,
        action: actionName,
        args: parsed.args,
      });
      actionResult = exec.actionResult;
      outcome = exec.outcome;
    }

    const nowIso = new Date().toISOString();
    const existing = Array.isArray(convo.messages) ? convo.messages : [];
    const updatedMessages = [
      ...existing,
      { role: 'user', content: userMessage, timestamp: nowIso },
      { role: 'assistant', content: parsed.cleanReply || rawReply || 'OK', action: actionName, timestamp: nowIso },
    ];

    await prisma.docConversation.update({
      where: { id: convo.id },
      data: {
        messages: updatedMessages,
        ...(outcome ? { outcome } : {}),
      },
    });

    emitHealthProbe('card_agent_message', {
      cardId: card.id,
      channel: ch,
      hasAction: Boolean(actionName),
      outcome: actionName ?? null,
    });

    return {
      reply: parsed.cleanReply || rawReply || 'Hi! How can I help you today?',
      action: actionName,
      actionResult,
    };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[cardAgent] processCardMessage error:', e?.message ?? e);
    return {
      reply: "I'm having trouble right now, please try again in a moment.",
      action: null,
      actionResult: null,
    };
  }
}

