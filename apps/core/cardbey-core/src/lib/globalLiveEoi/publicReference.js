/**
 * Opaque public EOI receipt reference (not the Prisma cuid).
 */

import { customAlphabet } from 'nanoid';

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
const nanoid = customAlphabet(alphabet, 10);

/**
 * @returns {string} e.g. GL7k2m9xq4ab
 */
export function generateEoiPublicReference() {
  return `GL${nanoid()}`;
}
