/**
 * Hybrid routing audit — writes AuditEvent records for publish/delete governance.
 */

/**
 * @param {object} args
 * @param {string|null|undefined} args.userId
 * @param {string|null|undefined} args.itemId
 * @param {string} args.itemType
 * @param {'direct'|'ai_review'} args.executionPath
 * @param {boolean} args.confirmed
 * @param {boolean} args.success
 * @param {string[]} [args.suggestions]
 * @param {string|null} [args.missionId]
 * @param {string|null} [args.operation]
 * @param {string|null} [args.path]
 * @param {string|null} [args.method]
 */
export async function logHybridPublish(args) {
  const {
    userId,
    itemId,
    itemType,
    executionPath,
    confirmed,
    success,
    suggestions = [],
    missionId = null,
    operation = null,
    path = null,
    method = null,
  } = args;

  try {
    const { getPrismaClient } = await import('../prisma.js');
    const prisma = getPrismaClient();
    await prisma.auditEvent.create({
      data: {
        entityType: itemType || 'HybridOperation',
        entityId: itemId || 'unknown',
        action: operation || 'hybrid_operation',
        actorType: userId ? 'user' : 'system',
        actorId: userId || null,
        reason: 'HYBRID_ROUTING',
        metadata: {
          executionPath,
          confirmed: confirmed === true,
          success: success === true,
          suggestions,
          missionId,
          path,
          method,
        },
      },
    });
  } catch (err) {
    console.warn('[hybridAudit] AuditEvent create failed (non-fatal):', err?.message || err);
  }
}

/**
 * Infer entity metadata from an Express-like request.
 * @param {import('express').Request} req
 * @param {string} [operation]
 */
export function inferHybridAuditContext(req, operation) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const params = req.params && typeof req.params === 'object' ? req.params : {};
  const path = String(req.originalUrl || req.path || '').toLowerCase();
  const method = String(req.method || 'POST').toUpperCase();

  let itemType = 'content';
  let itemId =
    params.storeId ||
    params.id ||
    params.draftId ||
    params.cardId ||
    body.storeId ||
    body.draftStoreId ||
    body.draftId ||
    null;

  if (path.includes('store') || operation?.includes('store')) itemType = 'store';
  else if (path.includes('draft')) itemType = 'draft';
  else if (path.includes('mini-website') || path.includes('website')) itemType = 'website';
  else if (path.includes('docs')) itemType = 'document';
  else if (path.includes('product')) itemType = 'product';
  else if (method === 'DELETE') itemType = 'resource';

  return {
    itemId: itemId ? String(itemId) : null,
    itemType,
    path: req.originalUrl || req.path || null,
    method,
    operation: operation || null,
  };
}
