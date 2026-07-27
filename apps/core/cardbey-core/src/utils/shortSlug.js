/**
 * Collision-safe short slug for promos (e.g. 8-char alphanumeric).
 * Retries on collision up to maxAttempts.
 */

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const DEFAULT_LENGTH = 8;
const MAX_ATTEMPTS = 5;

function randomChar() {
  return ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
}

/**
 * Generate a random short slug of given length.
 * @param {number} length
 * @returns {string}
 */
export function generateShortSlug(length = DEFAULT_LENGTH) {
  let s = '';
  for (let i = 0; i < length; i++) s += randomChar();
  return s;
}

/**
 * Generate a unique short slug using Prisma to check collision. Retries up to maxAttempts.
 * @param {object} prisma - PrismaClient instance
 * @param {number} length
 * @param {number} maxAttempts
 * @returns {Promise<string>} - unique slug
 */
export async function generateUniqueShortSlug(prisma, length = DEFAULT_LENGTH, maxAttempts = MAX_ATTEMPTS) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const slug = generateShortSlug(length);
    const existing = await prisma.storePromo.findUnique({ where: { slug } });
    if (!existing) return slug;
  }
  // Fallback: longer slug with timestamp hint to reduce collision
  return generateShortSlug(length + 4);
}
