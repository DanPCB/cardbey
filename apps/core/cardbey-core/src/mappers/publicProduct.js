/**
 * Public Product Mapper
 * Maps Product data to safe public DTO
 */

import { getTranslatedField } from '../services/i18n/translationUtils.js';

/**
 * Map Product to PublicProduct
 * @param {Object} product - Product object from Prisma
 * @param {Object} options - Optional configuration
 * @param {string} options.lang - Language code (e.g., "en", "vi") for translations. If not provided, uses original fields.
 * @returns {Object} PublicProduct
 */
export function toPublicProduct(product, options = {}) {
  const { lang } = options;
  
  // Use translation utilities to get translated fields, falling back to originals
  const name = getTranslatedField(product, 'name', lang) || product.name;
  const description = getTranslatedField(product, 'description', lang) ?? product.description ?? null;
  const category = getTranslatedField(product, 'category', lang) ?? product.category ?? null;
  
  return {
    id: product.id,
    name,
    description,
    price: product.price ?? null,
    currency: product.currency ?? null,
    category,
    imageUrl: product.imageUrl ?? null,
  };
}
