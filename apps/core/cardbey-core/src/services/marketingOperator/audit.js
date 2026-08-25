/**
 * Marketing operator audit — AuditEvent + optional MarketingOperatorRun.
 * Never persist access tokens or secrets in metadata.
 */

import { prisma } from '../../lib/prisma.js';

const SECRET_KEY_RE =
  /(access[_-]?token|refresh[_-]?token|page[_-]?token|app[_-]?secret|client[_-]?secret|authorization|bearer|password|api[_-]?key)/i;

/**
 * @param {unknown} value
 * @returns {unknown}
 */
export function redactSecrets(value) {
  if (value == null) return value;
  if (typeof value === 'string') {
    if (/EA[A-Za-z0-9]{20,}/.test(value) || /Bearer\s+\S+/i.test(value)) {
      return '[REDACTED]';
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (typeof value === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEY_RE.test(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redactSecrets(v);
      }
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
 * @param {string} [args.campaignId]
 * @param {string} [args.runType]
 * @param {boolean} [args.createOperatorRun]
 */
export async function appendMarketingAudit(args) {
  const {
    entityType,
    entityId,
    action,
    fromStatus = null,
    toStatus = null,
    actorId = null,
    actorType = actorId ? 'human' : 'system',
    reason = null,
    correlationId = null,
    metadata = null,
    campaignId = null,
    runType = null,
    createOperatorRun = false,
  } = args;

  const safeMeta = metadata ? /** @type {object} */ (redactSecrets(metadata)) : null;

  try {
    await prisma.auditEvent.create({
      data: {
        entityType: entityType || 'MarketingOperator',
        entityId: entityId || 'unknown',
        action,
        fromStatus,
        toStatus,
        actorType,
        actorId,
        correlationId,
        reason,
        metadata: safeMeta,
      },
    });
  } catch (err) {
    console.warn('[marketingOperator/audit] AuditEvent failed (non-fatal):', err?.message || err);
  }

  if (createOperatorRun && prisma.marketingOperatorRun) {
    try {
      await prisma.marketingOperatorRun.create({
        data: {
          campaignId: campaignId || null,
          runType: runType || action,
          status: toStatus || 'COMPLETED',
          actorId,
          summary: reason || action,
          metadata: safeMeta,
          completedAt: new Date(),
        },
      });
    } catch (err) {
      console.warn('[marketingOperator/audit] OperatorRun failed (non-fatal):', err?.message || err);
    }
  }
}

export default appendMarketingAudit;
