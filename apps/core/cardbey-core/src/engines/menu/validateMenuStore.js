/**
 * Ensure a menu operation targets an existing store the caller may access.
 * @param {import('@prisma/client').PrismaClient} db
 * @param {string} storeId
 * @param {string | null | undefined} userId
 */
export async function validateMenuStore(db, storeId, userId) {
  const id = String(storeId || '').trim();
  if (!id) {
    const err = new Error('storeId is required');
    err.code = 'STORE_NOT_FOUND';
    throw err;
  }

  const business = await db.business.findUnique({
    where: { id },
    select: { id: true, userId: true, isActive: true },
  });

  if (!business) {
    const err = new Error(`Store not found: ${id}`);
    err.code = 'STORE_NOT_FOUND';
    throw err;
  }

  if (userId && business.userId !== userId) {
    const isDev = process.env.NODE_ENV !== 'production';
    if (!isDev) {
      const err = new Error('You do not have access to this store');
      err.code = 'STORE_FORBIDDEN';
      throw err;
    }
  }

  return business;
}
