/**
 * Normalized store-name duplicate detection for create_store intake paths.
 */

/**
 * @param {string | null | undefined} name
 * @returns {string}
 */
export function normalizeStoreNameForDuplicateCheck(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d'`]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string | null | undefined} location
 * @returns {string}
 */
export function normalizeLocationForDuplicateCheck(location) {
  return String(location ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d'`]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {{ city?: string | null; suburb?: string | null; region?: string | null; formattedAddress?: string | null }} row
 * @returns {string}
 */
function locationHintFromBusinessRow(row) {
  const parts = [row.city, row.suburb, row.region, row.formattedAddress]
    .map((p) => (p != null ? String(p).trim() : ''))
    .filter(Boolean);
  return normalizeLocationForDuplicateCheck(parts.join(' '));
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function locationsOverlap(a, b) {
  if (!a || !b) return true;
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * Find an existing business for the same owner with a matching normalized name.
 *
 * @param {import('../prisma.js').PrismaClient} prisma
 * @param {{
 *   userId?: string | null;
 *   businessName?: string | null;
 *   location?: string | null;
 * }} input
 * @returns {Promise<{ id: string; name: string; city?: string | null; suburb?: string | null; region?: string | null } | null>}
 */
export async function findDuplicateStoreForUser(prisma, input = {}) {
  const uid = typeof input.userId === 'string' ? input.userId.trim() : '';
  const normalizedName = normalizeStoreNameForDuplicateCheck(input.businessName);
  if (!uid || !normalizedName) return null;

  const normalizedLocation = normalizeLocationForDuplicateCheck(input.location);

  try {
    const rows = await prisma.business.findMany({
      where: { userId: uid, isActive: true },
      select: {
        id: true,
        name: true,
        city: true,
        suburb: true,
        region: true,
        formattedAddress: true,
      },
    });

    let nameOnlyMatch = null;
    for (const row of rows) {
      if (normalizeStoreNameForDuplicateCheck(row?.name) !== normalizedName) continue;
      if (!normalizedLocation) return row;
      const rowLocation = locationHintFromBusinessRow(row);
      if (!rowLocation || locationsOverlap(rowLocation, normalizedLocation)) {
        return row;
      }
      if (!nameOnlyMatch) nameOnlyMatch = row;
    }
    return nameOnlyMatch;
  } catch {
    return null;
  }
}
