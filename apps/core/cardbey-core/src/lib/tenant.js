/**
 * Canonical tenant derivation for the API.
 * Use this helper everywhere tenantId is derived from the current user so tenant
 * logic stays in one place (avoid spreading user.business?.id ?? user.id across routes).
 *
 * Elsewhere you may see req.user.tenantId or ad-hoc derivation; align those to
 * getTenantId(req.user) when touching those routes.
 */

/**
 * @param {object} [user] - Authenticated user (e.g. req.user) with id and optionally business.id
 * @returns {string | null} - tenantId (business.id when present, else user.id, else null)
 */
export function getTenantId(user) {
  return user?.business?.id ?? user?.id ?? null;
}

/**
 * Consistent store (Business) ownership check for campaign and other tenant-scoped APIs.
 * - If tenantKey is a Business.id (user has business): storeId must equal tenantKey.
 * - If tenantKey is user.id (no business): Business with id storeId must have userId === user.id.
 *
 * @param {object} prisma - Prisma client
 * @param {{ tenantKey: string | null, user: { id: string, business?: { id: string } | null }, storeId: string }} params
 * @returns {Promise<boolean>}
 */
export async function canAccessBusiness(prisma, { tenantKey, user, storeId }) {
  if (!tenantKey || !storeId || !user?.id) return false;
  if (tenantKey === user?.business?.id) {
    return storeId === tenantKey;
  }
  const business = await prisma.business.findUnique({
    where: { id: storeId },
    select: { userId: true },
  });
  return business?.userId === user.id;
}
