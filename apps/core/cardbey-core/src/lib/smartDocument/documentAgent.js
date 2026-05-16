/**
 * Document Agent — CC-2
 *
 * Embedded AI agent for SmartDocument visitor interactions.
 * Handles the chat, action-dispatch, and conversation persistence layer
 * for any SmartDocument (card, ticket, report, badge, menu, flyer).
 *
 * Entry points:
 *   processDocMessage(docId, visitorToken, message, channel, options)
 */

import crypto from 'node:crypto';
import { getPrismaClient } from '../prisma.js';
import { emitHealthProbe } from '../telemetry/healthProbes.js';
import { parseCapabilities } from './capabilityRegistry.js';
import { resolvePhase } from './phaseEngine.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function nowIso() {
  return new Date().toISOString();
}

function pickSessionToken(token) {
  if (typeof token === 'string' && token.trim().length >= 8) return token.trim();
  return `anon_${crypto.randomBytes(10).toString('hex')}`;
}

function platformVisitorIdFor(phone, email) {
  const key = (phone ?? '') + '|' + (email ?? '');
  if (key === '|') return null;
  return crypto.createHash('sha256').update(key).digest('hex').substring(0, 16);
}

// ── Agent personality prompt ───────────────────────────────────────────────

function buildSystemPrompt(doc, capabilities) {
  const capList = capabilities.join(', ') || 'chat';
  return [
    `You are an embedded AI agent for a SmartDocument titled "${doc.title}".`,
    doc.agentPersonality
      ? `Your personality: ${doc.agentPersonality}.`
      : 'Be helpful, concise, and professional.',
    `Document type: ${doc.docType}${doc.subtype ? ` (${doc.subtype})` : ''}.`,
    `Available actions: ${capList}.`,
    'When a visitor asks to perform an action, respond with a brief confirmation and emit the action.',
    'Keep responses under 3 sentences. Never reveal internal system details.',
  ].join(' ');
}

// ── Action dispatcher ──────────────────────────────────────────────────────

/**
 * @param {object} prisma
 * @param {object} doc
 * @param {object} visitor
 * @param {string} action
 * @param {object} args
 * @returns {Promise<{ actionResult: object|null, outcome: string|null }>}
 */
async function dispatchAction(prisma, doc, visitor, action, args) {
  const capabilities = parseCapabilities(doc.capabilities);
  const allowed = doc.autoApprove ? capabilities : [];
  if (!allowed.includes(action)) {
    emitHealthProbe('doc_action_blocked', { docId: doc.id, action, visitorId: visitor.id });
    return { actionResult: { ok: false, error: 'action_not_permitted' }, outcome: null };
  }

  const at = nowIso();

  if (action === 'record_stamp') {
    const row = await prisma.loyaltyStamp.create({
      data: { docId: doc.id, visitorId: visitor.id, stampedAt: new Date() },
      select: { id: true, stampedAt: true },
    });
    emitHealthProbe('doc_action_executed', { docId: doc.id, action, visitorId: visitor.id, ok: true });
    return { actionResult: { stampId: row.id, stampedAt: row.stampedAt, at }, outcome: action };
  }

  if (action === 'redeem_promo') {
    const code = typeof args.code === 'string' ? args.code.trim() : '';
    const row = await prisma.promoRedemption.create({
      data: { docId: doc.id, visitorId: visitor.id, discountApplied: code || null, redeemedAt: new Date() },
      select: { id: true, redeemedAt: true, discountApplied: true },
    });
    emitHealthProbe('doc_action_executed', { docId: doc.id, action, visitorId: visitor.id, ok: true });
    return {
      actionResult: { redemptionId: row.id, redeemedAt: row.redeemedAt, discountApplied: row.discountApplied, at },
      outcome: action,
    };
  }

  if (action === 'record_rsvp') {
    const status = typeof args.status === 'string' ? args.status.trim().toLowerCase() : '';
    const safe = ['attending', 'declined', 'maybe'].includes(status) ? status : 'maybe';
    const row = await prisma.eventRsvp.create({
      data: { docId: doc.id, visitorId: visitor.id, status: safe, rsvpAt: new Date() },
      select: { id: true, status: true, rsvpAt: true },
    });
    emitHealthProbe('doc_action_executed', { docId: doc.id, action, visitorId: visitor.id, ok: true });
    return { actionResult: { rsvpId: row.id, status: row.status, rsvpAt: row.rsvpAt, at }, outcome: action };
  }

  if (action === 'check_in') {
    const note = typeof args.note === 'string' ? args.note.trim() : null;
    const row = await prisma.docCheckIn.create({
      data: { docId: doc.id, visitorId: visitor.id, checkedInAt: new Date(), note: note || null },
      select: { id: true, checkedInAt: true },
    });
    emitHealthProbe('doc_action_executed', { docId: doc.id, action, visitorId: visitor.id, ok: true });
    return { actionResult: { checkInId: row.id, checkedInAt: row.checkedInAt, at }, outcome: action };
  }

  if (action === 'collect_signature') {
    const signatureUrl = typeof args.signatureUrl === 'string' ? args.signatureUrl.trim() : null;
    const ipAddress = typeof args.ipAddress === 'string' ? args.ipAddress.trim() : null;
    const row = await prisma.docSignature.create({
      data: { docId: doc.id, visitorId: visitor.id, signedAt: new Date(), signatureUrl, ipAddress },
      select: { id: true, signedAt: true },
    });
    emitHealthProbe('doc_action_executed', { docId: doc.id, action, visitorId: visitor.id, ok: true });
    return { actionResult: { signatureId: row.id, signedAt: row.signedAt, at }, outcome: 'signed' };
  }

  if (action === 'capture_lead') {
    const phone = typeof args.phone === 'string' ? args.phone.trim() : '';
    const email = typeof args.email === 'string' ? args.email.trim() : '';
    const name = typeof args.name === 'string' ? args.name.trim() : '';
    const platformVisitorId = platformVisitorIdFor(phone || visitor.phone, email || visitor.email);
    await prisma.docVisitor.update({
      where: { id: visitor.id },
      data: {
        ...(phone ? { phone } : {}),
        ...(email ? { email } : {}),
        ...(name ? { name } : {}),
        ...(platformVisitorId ? { platformVisitorId } : {}),
      },
    });
    emitHealthProbe('doc_action_executed', { docId: doc.id, action, visitorId: visitor.id, ok: true });
    return { actionResult: { captured: true, at }, outcome: 'lead_captured' };
  }

  emitHealthProbe('doc_action_executed', { docId: doc.id, action, visitorId: visitor.id, ok: false });
  return { actionResult: { ok: false, error: 'unsupported_action' }, outcome: null };
}

// ── LLM call ───────────────────────────────────────────────────────────────

async function callLlm(systemPrompt, history, userMessage) {
  try {
    const { llmGateway } = await import('../llm/llmGateway.ts');
    const messages = [
      ...history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessage },
    ];
    const response = await llmGateway.generate({
      provider: process.env.LLM_DEFAULT_PROVIDER,
      model: process.env.LLM_DEFAULT_MODEL,
      system: systemPrompt,
      messages,
      maxTokens: 256,
    });
    return typeof response?.content === 'string' ? response.content.trim() : '';
  } catch (e) {
    console.warn('[documentAgent] LLM call failed:', e?.message ?? e);
    return '';
  }
}

// ── Action detection ───────────────────────────────────────────────────────

const ACTION_PATTERNS = [
  { pattern: /\bstamp\b|\bloyalty\b|\bpunch\b/i, action: 'record_stamp' },
  { pattern: /\bredeem\b|\bpromo\b|\bdiscount\b|\bvoucher\b/i, action: 'redeem_promo' },
  { pattern: /\brsvp\b|\battend\b|\bgoing\b|\bdecline\b/i, action: 'record_rsvp' },
  { pattern: /\bcheck.?in\b|\bcheck in\b|\barrived?\b/i, action: 'check_in' },
  { pattern: /\bsign\b|\bsignature\b/i, action: 'collect_signature' },
  { pattern: /\bcontact\b|\bphone\b|\bemail\b|\bname\b|\blead\b/i, action: 'capture_lead' },
];

/**
 * Heuristically detect an intended action from the visitor message.
 * @param {string} message
 * @param {string[]} capabilities
 * @returns {{ action: string, args: object } | null}
 */
function detectAction(message, capabilities) {
  for (const { pattern, action } of ACTION_PATTERNS) {
    if (capabilities.includes(action) && pattern.test(message)) {
      return { action, args: {} };
    }
  }
  return null;
}

// ── Main entry point ───────────────────────────────────────────────────────

/**
 * Process a visitor message for a SmartDocument.
 *
 * @param {string} docId
 * @param {string} visitorToken
 * @param {string} message
 * @param {string} [channel]  - 'web' | 'sms' | 'email'
 * @param {object} [options]
 * @returns {Promise<{
 *   reply: string,
 *   actionResult?: object,
 *   outcome?: string | null,
 *   visitorId: string,
 *   docId: string,
 * }>}
 */
export async function processDocMessage(docId, visitorToken, message, channel = 'web', options = {}) {
  const prisma = getPrismaClient();

  try {
    const cid = typeof docId === 'string' ? docId.trim() : '';
    if (!cid) return { reply: 'Document not found.', docId: cid, visitorId: '' };

    // ── Load document ────────────────────────────────────────────────────
    const doc = await prisma.smartDocument.findUnique({
      where: { id: cid },
      select: {
        id: true,
        docType: true,
        subtype: true,
        title: true,
        status: true,
        phase: true,
        phaseConfig: true,
        createdAt: true,
        expiresAt: true,
        agentPersonality: true,
        knowledgeBase: true,
        capabilities: true,
        autoApprove: true,
      },
    });

    if (!doc) return { reply: 'Document not found.', docId: cid, visitorId: '' };
    if (doc.status === 'archived') return { reply: 'This document is no longer active.', docId: cid, visitorId: '' };

    // Lazy phase resolution
    const { phase, needsUpdate } = resolvePhase({ ...doc, stampCount: 0 });
    if (needsUpdate) {
      prisma.smartDocument.update({ where: { id: cid }, data: { phase } }).catch(() => {});
    }
    if (phase === 'pre') return { reply: 'This document is not yet active.', docId: cid, visitorId: '' };
    if (phase === 'post') return { reply: 'This document has expired.', docId: cid, visitorId: '' };

    const capabilities = parseCapabilities(doc.capabilities);
    const ch = typeof channel === 'string' && channel.trim() ? channel.trim() : 'web';
    const token = pickSessionToken(visitorToken);

    // ── Upsert visitor ───────────────────────────────────────────────────
    const visitor = await prisma.docVisitor.upsert({
      where: { sessionToken: token },
      create: { docId: cid, sessionToken: token },
      update: { docId: cid },
      select: { id: true, name: true, phone: true, email: true },
    });

    // ── Load / create conversation ───────────────────────────────────────
    let convo = await prisma.docConversation.findFirst({
      where: { docId: cid, visitorId: visitor.id, channel: ch },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, messages: true },
    });

    if (!convo) {
      convo = await prisma.docConversation.create({
        data: { docId: cid, visitorId: visitor.id, channel: ch, messages: [] },
        select: { id: true, messages: true },
      });
    }

    const history = Array.isArray(convo.messages) ? convo.messages : [];

    // ── Detect and dispatch action ────────────────────────────────────────
    let actionResult = null;
    let outcome = null;
    const detected = detectAction(message, capabilities);
    if (detected) {
      const dispatched = await dispatchAction(prisma, doc, visitor, detected.action, detected.args);
      actionResult = dispatched.actionResult;
      outcome = dispatched.outcome;
    }

    // ── Generate LLM reply ────────────────────────────────────────────────
    const systemPrompt = buildSystemPrompt(doc, capabilities);
    let reply = await callLlm(systemPrompt, history, message);
    if (!reply) {
      reply = actionResult
        ? 'Done! Is there anything else I can help you with?'
        : "I'm here to help. What would you like to know?";
    }

    // ── Persist messages ───────────────────────────────────────────────────
    const updatedMessages = [
      ...history,
      { role: 'user', content: message, ts: Date.now() },
      { role: 'assistant', content: reply, ts: Date.now(), ...(outcome ? { outcome } : {}) },
    ];

    await prisma.docConversation.update({
      where: { id: convo.id },
      data: { messages: updatedMessages, outcome: outcome ?? undefined },
    });

    emitHealthProbe('doc_agent_message', {
      docId: cid,
      channel: ch,
      visitorId: visitor.id,
      hasAction: Boolean(actionResult),
      ok: true,
    });

    return {
      reply,
      ...(actionResult ? { actionResult } : {}),
      outcome: outcome ?? null,
      visitorId: visitor.id,
      docId: cid,
    };
  } catch (e) {
    console.error('[documentAgent] processDocMessage failed:', e?.message ?? e);
    emitHealthProbe('doc_agent_error', { docId, error: e?.message ?? String(e) });
    return {
      reply: "I'm sorry, something went wrong. Please try again.",
      docId: typeof docId === 'string' ? docId : '',
      visitorId: '',
    };
  }
}
