/**
 * Greeting Card Slug Generation
 * Generates unique share slugs for greeting cards
 */

import { slugify } from './slug.js';
import crypto from 'crypto';

/**
 * Generate a short random suffix for slugs
 * @returns {string} - 6 character alphanumeric suffix
 */
function generateShortSuffix() {
  return crypto.randomBytes(3).toString('hex');
}

/**
 * Generate a unique greeting card slug
 * @param {Object} prisma - PrismaClient instance
 * @param {Object} card - GreetingCard object (may have title, type)
 * @returns {Promise<string>} - Unique share slug
 */
export async function generateGreetingCardSlug(prisma, card) {
  let baseSlug = 'card';
  
  // If there's a title, use it as base
  if (card.title && typeof card.title === 'string' && card.title.trim().length > 0) {
    const titleSlug = slugify(card.title);
    if (titleSlug && titleSlug.length > 0) {
      baseSlug = titleSlug;
    }
  }
  
  // Add short random suffix
  const suffix = generateShortSuffix();
  let slug = `${baseSlug}-${suffix}`;
  
  // Ensure uniqueness
  let attempts = 0;
  const maxAttempts = 100;
  
  while (attempts < maxAttempts) {
    const exists = await prisma.greetingCard.findUnique({
      where: { shareSlug: slug }
    });
    
    if (!exists) {
      return slug;
    }
    
    // Regenerate suffix and try again
    const newSuffix = generateShortSuffix();
    slug = `${baseSlug}-${newSuffix}`;
    attempts++;
  }
  
  // Fallback to timestamp-based slug if too many collisions
  return `${baseSlug}-${Date.now().toString(36)}`;
}

