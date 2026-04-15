/**
 * Screen lookup helper
 * Ensures consistent screen lookups across all routes
 */

/**
 * Get a screen by ID or return null
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} id - Screen ID
 * @param {{ includeDeleted?: boolean, tenantId?: string }} [options] - Options
 * @returns {Promise<import('@prisma/client').Screen | null>}
 */
export async function getScreenOr404(prisma, id, options = {}) {
  const { includeDeleted = false, tenantId } = options;

  const where = { id };
  
  if (!includeDeleted) {
    where.deletedAt = null;
  }

  // Add tenantId filter if provided (for multi-tenant support)
  if (tenantId) {
    where.tenantId = tenantId;
  }

  const scr = await prisma.screen.findFirst({ where });
  
  if (!scr) {
    return null;
  }
  
  return scr;
}

