import { emitHealthProbe } from '../telemetry/healthProbes.js';
import { createEmitContextUpdate } from '../missionPlan/agentMemory.js';
import { mergeMissionContext } from '../mission.js';
import { execute as createGoogleCalendarEvent } from '../toolExecutors/mcp/mcp_google_calendar_create_event.js';
import { getPrismaClient } from '../prisma.js';

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

async function emitReasoning(missionId, prisma, line) {
  const mid = typeof missionId === 'string' ? missionId.trim() : '';
  if (!mid || !prisma || typeof line !== 'string' || !line.trim()) return;
  try {
    const emit = createEmitContextUpdate(mid, 'external_actions', { prisma, mergeMissionContext });
    await emit({ reasoning_line: { line: line.trim(), timestamp: Date.now() } });
  } catch {
    /* ignore */
  }
}

async function resolveOwnerEmail(prisma, userId) {
  const uid = typeof userId === 'string' ? userId.trim() : '';
  if (!uid) return null;
  const row = await prisma.user
    .findUnique({ where: { id: uid }, select: { email: true } })
    .catch(() => null);
  const email = row?.email && String(row.email).trim();
  return email || null;
}

/**
 * Gmail MCP best-effort email send. Skips silently if not configured.
 *
 * @param {string} missionId
 * @param {object} campaignData
 * @param {{ prisma?: any, userId?: string, toEmail?: string, subject?: string, bodyText?: string }} options
 * @returns {Promise<{ ok: boolean, skipped?: boolean, error?: string }>}
 */
export async function sendCampaignEmail(missionId, campaignData, options = {}) {
  const prisma = options.prisma ?? getPrismaClient();
  const toEmail =
    (typeof options.toEmail === 'string' && options.toEmail.trim()) ||
    (await resolveOwnerEmail(prisma, options.userId ?? '')) ||
    null;

  const baseUrl = typeof process.env.GMAIL_MCP_URL === 'string' ? process.env.GMAIL_MCP_URL.trim() : '';
  const token = typeof process.env.GMAIL_MCP_TOKEN === 'string' ? process.env.GMAIL_MCP_TOKEN.trim() : '';
  if (!baseUrl || !token || !toEmail) {
    emitHealthProbe('external_action', { missionId, action: 'gmail', ok: false, skipped: true });
    return { ok: false, skipped: true };
  }

  await emitReasoning(missionId, prisma, '📧 Sending campaign notification...');

  const title = typeof campaignData?.title === 'string' ? campaignData.title.trim() : '';
  const subject =
    typeof options.subject === 'string' && options.subject.trim()
      ? options.subject.trim()
      : `Your campaign is live${title ? `: ${title}` : ''}`;
  const bodyText =
    typeof options.bodyText === 'string' && options.bodyText.trim()
      ? options.bodyText.trim()
      : `Your campaign is live.\n\nSummary:\n${JSON.stringify(campaignData ?? {}, null, 2)}\n\nNext steps:\n- Review channels\n- Share link / QR\n`;

  try {
    // JSON-RPC-like MCP envelope; actual Gmail MCP method may differ.
    // If the MCP is not compatible, this fails safely and we skip.
    const trimmedBase = baseUrl.replace(/\/+$/, '');
    const res = await fetch(`${trimmedBase}/message`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: `gmail_${Date.now()}`,
        method: 'tools/call',
        params: {
          name: 'send_email',
          arguments: { to: toEmail, subject, body: bodyText },
        },
      }),
    });
    const json = await res.json().catch(() => ({}));
    const ok = Boolean(res.ok && !json?.error);
    emitHealthProbe('external_action', { missionId, action: 'gmail', ok });
    if (!ok) {
      return { ok: false, error: json?.error?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    emitHealthProbe('external_action', { missionId, action: 'gmail', ok: false });
    return { ok: false, error: e?.message ?? String(e) };
  }
}

/**
 * Create a Google Calendar event via existing tool executor (OAuthConnection required).
 *
 * @param {string} missionId
 * @param {{ summary: string, startDateTime: string, endDateTime: string, timeZone?: string, description?: string, location?: string }} eventData
 * @param {{ prisma?: any, userId?: string }} options
 * @returns {Promise<{ ok: boolean, skipped?: boolean, eventId?: string|null, htmlLink?: string|null, error?: string }>}
 */
export async function createCalendarEvent(missionId, eventData, options = {}) {
  const prisma = options.prisma ?? getPrismaClient();
  const userId = typeof options.userId === 'string' ? options.userId.trim() : '';
  if (!userId) {
    emitHealthProbe('external_action', { missionId, action: 'calendar', ok: false, skipped: true });
    return { ok: false, skipped: true };
  }
  await emitReasoning(missionId, prisma, '📅 Scheduling campaign end reminder...');
  try {
    const dr = await createGoogleCalendarEvent({ ...eventData, userId }, { userId });
    const ok = dr?.status === 'ok';
    emitHealthProbe('external_action', { missionId, action: 'calendar', ok });
    if (!ok) {
      return { ok: false, error: dr?.error?.message ?? dr?.blocker?.message ?? 'calendar_failed' };
    }
    const data = asObject(dr.output?.data);
    return { ok: true, eventId: data.id ?? null, htmlLink: data.htmlLink ?? null };
  } catch (e) {
    emitHealthProbe('external_action', { missionId, action: 'calendar', ok: false });
    return { ok: false, error: e?.message ?? String(e) };
  }
}

/**
 * Create a Stripe coupon (best-effort). Skips silently if STRIPE_SECRET_KEY missing.
 *
 * @param {string} missionId
 * @param {{ title: string, discountPercent: number }} promoData
 * @param {{}} options
 * @returns {Promise<{ ok: boolean, skipped?: boolean, couponId?: string|null, error?: string }>}
 */
export async function createStripePromotion(missionId, promoData, options = {}) {
  const secret = typeof process.env.STRIPE_SECRET_KEY === 'string' ? process.env.STRIPE_SECRET_KEY.trim() : '';
  if (!secret) {
    emitHealthProbe('external_action', { missionId, action: 'stripe', ok: false, skipped: true });
    return { ok: false, skipped: true };
  }
  try {
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(secret, { apiVersion: '2024-06-20' });
    const title = typeof promoData?.title === 'string' ? promoData.title.trim() : 'Cardbey promotion';
    const pct = Number(promoData?.discountPercent);
    const discountPercent = Number.isFinite(pct) ? Math.max(1, Math.min(100, Math.round(pct))) : 10;
    const coupon = await stripe.coupons.create({
      percent_off: discountPercent,
      duration: 'once',
      name: title.slice(0, 80),
      max_redemptions: 100,
    });
    emitHealthProbe('external_action', { missionId, action: 'stripe', ok: true });
    return { ok: true, couponId: coupon?.id ?? null };
  } catch (e) {
    emitHealthProbe('external_action', { missionId, action: 'stripe', ok: false });
    return { ok: false, error: e?.message ?? String(e) };
  }
}

