/**
 * Message Scheduler — CC-3
 *
 * Polls `DocScheduledMessage` for pending messages due for delivery,
 * attempts delivery, and marks them sent or failed.
 *
 * Currently supports the 'web' channel (in-conversation injection).
 * SMS / email channels emit a warning and mark the message failed
 * until transport integrations are wired in.
 *
 * Usage:
 *   import { startScheduler, stopScheduler } from './messageScheduler.js';
 *   startScheduler();   // call once on app startup
 *   stopScheduler();    // call on graceful shutdown
 */

import { getPrismaClient } from '../prisma.js';
import { emitHealthProbe } from '../telemetry/healthProbes.js';

// ── Config ─────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 60_000; // 1 minute
const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 3;

let schedulerTimer = null;
let isRunning = false;

// ── Delivery ───────────────────────────────────────────────────────────────

/**
 * Attempt to deliver a scheduled message.
 * Returns true on success, throws on failure.
 *
 * @param {object} prisma
 * @param {object} msg
 * @returns {Promise<boolean>}
 */
async function deliverMessage(prisma, msg) {
  const payload = parsePayload(msg.payload);
  const channel = msg.channel ?? 'web';

  if (channel === 'web') {
    // Web channel: inject into DocConversation as a system message
    const convo = await prisma.docConversation.findFirst({
      where: { docId: msg.docId, channel: 'web' },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, messages: true },
    });

    if (!convo) {
      // No active conversation — create one (system-initiated)
      await prisma.docConversation.create({
        data: {
          docId: msg.docId,
          visitorId: payload.visitorId ?? 'system',
          channel: 'web',
          messages: [
            {
              role: 'assistant',
              content: payload.text ?? payload.message ?? '(scheduled message)',
              ts: Date.now(),
              scheduled: true,
              scheduledMessageId: msg.id,
            },
          ],
        },
      });
      return true;
    }

    const existing = Array.isArray(convo.messages) ? convo.messages : [];
    await prisma.docConversation.update({
      where: { id: convo.id },
      data: {
        messages: [
          ...existing,
          {
            role: 'assistant',
            content: payload.text ?? payload.message ?? '(scheduled message)',
            ts: Date.now(),
            scheduled: true,
            scheduledMessageId: msg.id,
          },
        ],
      },
    });
    return true;
  }

  if (channel === 'sms') {
    // TODO: wire Twilio
    throw new Error('SMS transport not yet configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
  }

  if (channel === 'email') {
    // TODO: wire SendGrid / SMTP
    throw new Error('Email transport not yet configured. Set SENDGRID_API_KEY or SMTP_* env vars.');
  }

  throw new Error(`Unknown delivery channel: ${channel}`);
}

// ── Poll loop ──────────────────────────────────────────────────────────────

async function runOnce() {
  const prisma = getPrismaClient();
  const now = new Date();

  let pending;
  try {
    pending = await prisma.docScheduledMessage.findMany({
      where: {
        status: 'pending',
        sendAt: { lte: now },
        attempts: { lt: MAX_ATTEMPTS },
      },
      take: BATCH_SIZE,
      orderBy: { sendAt: 'asc' },
    });
  } catch (e) {
    console.warn('[messageScheduler] DB query failed:', e?.message ?? e);
    return;
  }

  for (const msg of pending) {
    // Mark in-flight (optimistic update)
    try {
      await prisma.docScheduledMessage.update({
        where: { id: msg.id },
        data: { attempts: { increment: 1 } },
      });
    } catch {
      continue; // race condition — skip
    }

    try {
      await deliverMessage(prisma, msg);
      await prisma.docScheduledMessage.update({
        where: { id: msg.id },
        data: { status: 'sent', sentAt: new Date() },
      });
      emitHealthProbe('doc_reminder_sent', { docId: msg.docId, channel: msg.channel, ok: true });
    } catch (e) {
      const attempts = (msg.attempts ?? 0) + 1;
      const failed = attempts >= MAX_ATTEMPTS;
      await prisma.docScheduledMessage.update({
        where: { id: msg.id },
        data: {
          status: failed ? 'failed' : 'pending',
          error: e?.message ?? String(e),
        },
      }).catch(() => {});
      emitHealthProbe('doc_reminder_sent', {
        docId: msg.docId,
        channel: msg.channel,
        ok: false,
        error: e?.message ?? String(e),
      });
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function parsePayload(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return {};
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Start the scheduler polling loop.
 * Safe to call multiple times — only one loop runs at a time.
 */
export function startScheduler() {
  if (isRunning) return;
  isRunning = true;
  console.log('[messageScheduler] started — polling every', POLL_INTERVAL_MS / 1000, 's');

  // Run immediately on start, then on interval
  runOnce().catch((e) => console.warn('[messageScheduler] runOnce error:', e?.message ?? e));

  schedulerTimer = setInterval(() => {
    runOnce().catch((e) => console.warn('[messageScheduler] runOnce error:', e?.message ?? e));
  }, POLL_INTERVAL_MS);

  // Unref so the timer doesn't block process exit
  if (schedulerTimer?.unref) schedulerTimer.unref();
}

/**
 * Stop the scheduler polling loop.
 */
export function stopScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  isRunning = false;
  console.log('[messageScheduler] stopped');
}

/**
 * Schedule a message for future delivery (convenience helper for other modules).
 *
 * @param {{
 *   docId: string,
 *   sendAt: Date | string,
 *   channel?: string,
 *   payload?: object,
 * }} opts
 * @returns {Promise<{ id: string }>}
 */
export async function scheduleMessage(opts) {
  const prisma = getPrismaClient();
  const row = await prisma.docScheduledMessage.create({
    data: {
      docId: opts.docId,
      sendAt: new Date(opts.sendAt),
      channel: opts.channel ?? 'web',
      payload: opts.payload ?? null,
      status: 'pending',
    },
    select: { id: true },
  });
  return row;
}
