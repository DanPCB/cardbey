/**
 * Live Market audit — append-only AuditEvent rows.
 * Never persist secrets, provider tokens, or unnecessary PII.
 */

import { getPrismaClient } from '../prisma.js';
import { LIVE_MARKET_AUDIT_REASONS } from './domain.js';

const SECRET_KEY_RE =
  /(access[_-]?token|refresh[_-]?token|secret|password|authorization|bearer|api[_-]?key|providerExternalRef|webhook)/i;

/**
 * @param {unknown} value
 * @returns {unknown}
 */
export function redactLiveMarketAuditValue(value) {
  if (value == null) return value;
  if (typeof value === 'string') {
    if (/Bearer\s+\S+/i.test(value) || /EA[A-Za-z0-9]{20,}/.test(value)) return '[REDACTED]';
    return value;
  }
  if (Array.isArray(value)) return value.map(redactLiveMarketAuditValue);
  if (typeof value === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEY_RE.test(k) ? '[REDACTED]' : redactLiveMarketAuditValue(v);
    }
    return out;
  }
  return value;
}

/**
 * @param {object} args
 * @param {string} args.entityType
 * @param {string} args.entityId
 * @param {string} args.action
 * @param {string} [args.fromStatus]
 * @param {string} [args.toStatus]
 * @param {string} [args.actorId]
 * @param {string} [args.actorType]
 * @param {string} [args.reason]
 * @param {string} [args.correlationId]
 * @param {object} [args.metadata]
 * @param {import('@prisma/client').PrismaClient} [args.prisma]
 */
export async function appendLiveMarketAudit(args) {
  const prisma = args.prisma || getPrismaClient();
  const safeMeta = args.metadata
    ? /** @type {object} */ (redactLiveMarketAuditValue(args.metadata))
    : null;

  try {
    return await prisma.auditEvent.create({
      data: {
        entityType: args.entityType || 'LiveMarketSession',
        entityId: args.entityId || 'unknown',
        action: args.action,
        fromStatus: args.fromStatus ?? null,
        toStatus: args.toStatus ?? null,
        actorType: args.actorType || (args.actorId ? 'human' : 'system'),
        actorId: args.actorId ?? null,
        correlationId: args.correlationId ?? null,
        reason: args.reason || LIVE_MARKET_AUDIT_REASONS.SESSION_TRANSITION,
        metadata: safeMeta,
      },
    });
  } catch (err) {
    console.warn('[liveMarket.audit] append failed', err?.message || err);
    return null;
  }
}
