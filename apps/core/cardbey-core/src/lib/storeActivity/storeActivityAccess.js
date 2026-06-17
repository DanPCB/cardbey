import prisma from '../prisma.js';
import { isPlatformAdmin } from '../authorization.js';

/**
 * Verify the requester may subscribe to a store activity stream.
 * @param {import('express').Request} req
 * @param {string} storeId
 */
export async function assertStoreActivityAccess(req, storeId) {
  const id = String(storeId ?? '').trim();
  if (!id) {
    return { ok: false, status: 400, error: 'storeId required' };
  }

  const store = await prisma.business.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });
  if (!store) {
    return { ok: false, status: 404, error: 'Store not found' };
  }

  const userId = req.userId ?? req.user?.id ?? null;
  if (userId && store.userId === userId) {
    return { ok: true, store };
  }
  if (isPlatformAdmin(req.user)) {
    return { ok: true, store };
  }

  return { ok: false, status: 403, error: 'forbidden' };
}
