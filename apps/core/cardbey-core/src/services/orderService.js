/**
 * Cardbey Order Handshake Facade (SPRINT-STABLE CONTRACT)
 *
 * Purpose
 * - This file is the shared handshake boundary between:
 *   - Cursor-owned order migration (domain + API + UI validation)
 *   - Claude Code-owned agent execution layer (kernelLite + orderManagerSkill)
 * - It MUST remain stable for the current sprint.
 *
 * Stable exports (DO NOT CHANGE without coordination)
 * - browseSellerOrders({ sellerId, status, page, size })
 * - changeOrderStatus({ orderId, status })
 * - pushNotification({ object_id, object_type, target_id, target_type, summary, meta })
 *
 * Normalized return shapes (raw legacy payloads MUST NOT leak)
 *
 * browseSellerOrders(...) => {
 *   items: [
 *     {
 *       orderId,        // contract uses orderId (not id)
 *       sellerId,
 *       buyerId,        // contract uses buyerId (not buyerUserId)
 *       customerName,   // nullable (legacy-provided when available)
 *       customerPhone,  // nullable (legacy-provided when available)
 *       status,         // normalized Cardbey status
 *       rawStatus,      // original upstream status string (for audit/debug only)
 *       createdAt,
 *       totalAmount,
 *       currency
 *     }
 *   ],
 *   page,
 *   size,
 *   total
 * }
 *
 * changeOrderStatus(...) => {
 *   ok: true,
 *   orderId,
 *   previousStatus, // may be null when upstream does not return it
 *   currentStatus,  // normalized Cardbey status when determinable
 *   rawStatus,      // requested status/action input
 *   code,
 *   message
 * }
 *
 * pushNotification(...) => {
 *   ok: true,
 *   code,
 *   message
 * }
 *
 * Rules (MANDATORY)
 * - Legacy status/action normalization happens ONLY inside this boundary.
 * - Do not leak raw legacy responses past this facade (normalize here).
 * - Do not add alternate order-mutation paths (agent direct legacy, route-level logic, direct DB writes)
 *   without coordination between Cursor + Claude Code.
 *
 * Sprint constraint
 * - Keep this facade legacy-backed for this sprint.
 * - Do NOT wire native domain mutation yet: actor context is not part of the handshake contract.
 */

import { normalizeLegacyStatus, toLegacyAction } from './orders/orderStatusMap.js';

function env(name) {
  const v = process.env[name];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

const LEGACY_API_URL = env('LEGACY_API_URL');
const LEGACY_API_TOKEN = env('LEGACY_API_TOKEN');
const NOTIFICATION_API_URL = env('NOTIFICATION_API_URL');

function logError(tag, err, extra) {
  const message = err?.message || String(err || 'unknown_error');
  console.error(`[orderService] ${tag}`, { message, ...(extra || {}) });
}

async function legacyFetchJson(path, init = {}) {
  if (!LEGACY_API_URL) throw new Error('LEGACY_API_URL not configured');
  const url = `${LEGACY_API_URL.replace(/\/+$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
  const headers = {
    Accept: 'application/json',
    ...(LEGACY_API_TOKEN ? { Authorization: `Bearer ${LEGACY_API_TOKEN}` } : {}),
    ...(init.headers || {}),
  };
  const res = await fetch(url, { ...init, headers });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(`legacy ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 300)}` : ''}`);
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

/**
 * browseSellerOrders({ sellerId, status, page, size })
 * Returns normalized Cardbey shape (no raw legacy leak).
 */
export async function browseSellerOrders({ sellerId, status, page, size }) {
  const p = Math.max(1, Number(page || 1));
  const s = Math.max(1, Math.min(200, Number(size || 50)));

  // Legacy path (for sprint): use legacy API if configured.
  if (LEGACY_API_URL) {
    try {
      const qs = new URLSearchParams();
      if (status) qs.set('status', String(status));
      qs.set('page[size]', String(s));
      // legacy likely uses page[number] or offset; keep minimal and stable
      qs.set('page[number]', String(p));

      const data = await legacyFetchJson(`/n_sellers/${encodeURIComponent(sellerId)}/orders?${qs.toString()}`);
      const rawItems = Array.isArray(data?.items) ? data.items : Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];

      const items = rawItems.map((o) => {
        const rawStatus = o?.status ?? o?.state ?? o?.rawStatus ?? '';
        const norm = normalizeLegacyStatus(rawStatus);
        return {
          orderId: String(o?.id ?? o?.orderId ?? ''),
          sellerId: String(o?.seller_id ?? o?.sellerId ?? sellerId ?? ''),
          buyerId: String(o?.buyer_id ?? o?.buyerId ?? o?.customer_id ?? o?.customerId ?? ''),
          customerName: o?.customer_name ?? o?.customerName ?? null,
          customerPhone: o?.customer_phone ?? o?.customerPhone ?? null,
          status: norm.status,
          rawStatus: norm.rawStatus,
          createdAt: o?.created_at ?? o?.createdAt ?? null,
          totalAmount: o?.total_amount ?? o?.totalAmount ?? o?.total ?? null,
        };
      }).filter((x) => x.orderId);

      return {
        items,
        page: p,
        size: s,
        total: Number(data?.total ?? data?.totalItems ?? items.length),
      };
    } catch (err) {
      logError('browseSellerOrders legacy failed', err, { sellerId });
      return { items: [], page: p, size: s, total: 0, ok: false, code: 'legacy_error', message: err?.message || 'legacy_error' };
    }
  }

  // Fallback: new domain (only browse; mutation remains legacy until actor contract exists)
  try {
    const { browseSellerOrders: browse } = await import('./order/application/queries/browseSellerOrders.ts');
    const result = await browse({
      sellerUserId: String(sellerId),
      status: status ? String(status) : null,
      page: p,
      pageSize: s,
    });
    return {
      items: (result.items || []).map((o) => ({
        orderId: o.id,
        sellerId: o.sellerUserId,
        buyerId: o.buyerUserId,
        customerName: null,
        customerPhone: null,
        status: o.status,
        rawStatus: o.status,
        createdAt: o.createdAt,
        totalAmount: o.totalAmount,
      })),
      page: result.page,
      size: result.pageSize,
      total: result.totalItems,
    };
  } catch (err) {
    logError('browseSellerOrders domain failed', err, { sellerId });
    return { items: [], page: p, size: s, total: 0, ok: false, code: 'domain_error', message: err?.message || 'domain_error' };
  }
}

/**
 * changeOrderStatus({ orderId, status })
 * status is normalized Cardbey target (confirmed/completed/cancelled) or action (accept_cancel/deny_cancel).
 */
export async function changeOrderStatus({ orderId, status }) {
  const desired = String(status || '').trim();
  if (!orderId || !desired) {
    return { ok: false, orderId, previousStatus: null, currentStatus: null, rawStatus: null, code: 'validation_error', message: 'orderId and status are required' };
  }

  // Legacy path (for sprint): map normalized -> legacy action token.
  if (LEGACY_API_URL) {
    try {
      const legacyAction = toLegacyAction(desired);
      if (!legacyAction) {
        return { ok: false, orderId, previousStatus: null, currentStatus: null, rawStatus: desired, code: 'validation_error', message: `Unsupported status/action: ${desired}` };
      }
      // Legacy signature: POST /orders/{orderId}/items/{status}
      await legacyFetchJson(`/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(legacyAction)}`, { method: 'POST' });
      // We don't assume resulting status; return best-effort mapping
      const norm = normalizeLegacyStatus(desired);
      return { ok: true, orderId, previousStatus: null, currentStatus: norm.status || desired, rawStatus: desired, code: 'ok', message: 'Status change requested' };
    } catch (err) {
      logError('changeOrderStatus legacy failed', err, { orderId, desired });
      return { ok: false, orderId, previousStatus: null, currentStatus: null, rawStatus: desired, code: 'legacy_error', message: err?.message || 'legacy_error' };
    }
  }

  // Domain mutation path is intentionally not enabled yet (missing actor in handshake).
  console.warn('[orderService] changeOrderStatus not implemented for domain path (handshake lacks actor context).', { orderId, desired });
  return { ok: false, orderId, previousStatus: null, currentStatus: null, rawStatus: desired, code: 'not_implemented', message: 'Domain mutation not enabled (configure legacy API or extend handshake with actor context)' };
}

/**
 * pushNotification(...)
 * For sprint: forward to NOTIFICATION_API_URL if configured.
 */
export async function pushNotification({ object_id, object_type, target_id, target_type, summary, meta }) {
  if (!NOTIFICATION_API_URL) {
    console.warn('[orderService] NOTIFICATION_API_URL not configured; notification not sent.', { object_type, target_type });
    return { ok: false, code: 'not_configured', message: 'NOTIFICATION_API_URL not configured' };
  }
  try {
    const res = await fetch(NOTIFICATION_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        data: { object_id, object_type, target_id, target_type, summary, meta: meta ?? null },
      }),
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      throw new Error(`notify ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 300)}` : ''}`);
    }
    return { ok: true, code: 'ok', message: 'Notification sent' };
  } catch (err) {
    logError('pushNotification failed', err, { object_type, target_type, target_id });
    return { ok: false, code: 'notify_error', message: err?.message || 'notify_error' };
  }
}

