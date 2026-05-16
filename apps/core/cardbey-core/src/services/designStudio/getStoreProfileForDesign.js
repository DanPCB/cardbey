/**
 * Load merchant-facing fields for AI design generation (brandKit / canvas context).
 * @param {string} storeId Business.id
 * @returns {Promise<null | {
 *   storeId: string,
 *   name: string,
 *   tagline: string | null,
 *   primaryColor: string | null,
 *   secondaryColor: string | null,
 *   logoUrl: string | null,
 *   qrCodeUrl: string | null,
 * }>}
 */
import { getPrismaClient } from '../../lib/prisma.js';

export async function getStoreProfileForDesign(storeId) {
  if (!storeId || typeof storeId !== 'string') return null;
  const prisma = getPrismaClient();
  const b = await prisma.business.findUnique({
    where: { id: storeId.trim() },
    select: {
      id: true,
      name: true,
      tagline: true,
      primaryColor: true,
      secondaryColor: true,
      logo: true,
      avatarImageUrl: true,
    },
  });
  if (!b) return null;

  let logoUrl = typeof b.avatarImageUrl === 'string' && b.avatarImageUrl.trim() ? b.avatarImageUrl.trim() : null;
  if (!logoUrl && typeof b.logo === 'string' && b.logo.trim()) {
    try {
      const parsed = JSON.parse(b.logo);
      const u = parsed?.url ?? parsed?.href;
      if (typeof u === 'string' && u.trim()) logoUrl = u.trim();
    } catch {
      /* ignore invalid logo JSON */
    }
  }

  return {
    storeId: b.id,
    name: b.name,
    tagline: b.tagline ?? null,
    primaryColor: b.primaryColor ?? null,
    secondaryColor: b.secondaryColor ?? null,
    logoUrl,
    qrCodeUrl: null,
  };
}
