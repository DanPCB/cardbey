/**
 * DANH: sqlite-schema-drift-fix — runtime flags for schema differences (SQLite local vs Postgres prod).
 * Pure config; no Prisma imports.
 */

import { coerceServiceCtaLabel, isServiceVertical } from './storeTransactionMode.js';

/** @type {string} */
export const DB_PROVIDER = process.env.DATABASE_PROVIDER ?? 'sqlite';

export const dbSupports = {
  /** Business.transactionMode, catalogLabel, ctaLabel (Postgres migration 20260518120000). */
  extendedBusinessFields: DB_PROVIDER !== 'sqlite',
  // DANH: sqlite-schema-drift-fix — Prisma mode:"insensitive" is Postgres-only
  caseInsensitiveMode: DB_PROVIDER !== 'sqlite',
};

// DANH: sqlite-schema-drift-fix
// Prisma mode:"insensitive" is Postgres-only.
// On SQLite, use plain equals and handle case in JS,
// or use contains without mode (SQLite string ops are
// case-insensitive for ASCII by default on LIKE queries
// but NOT on = equals).

/**
 * Returns a Prisma StringFilter that works on both SQLite and Postgres.
 * Postgres: uses mode:"insensitive" for true unicode case-insensitivity.
 * SQLite: uses contains (LIKE) which is case-insensitive for ASCII,
 *         or falls back to plain equals (caller must normalise input).
 *
 * @param {string} value - already .trim()'d search value
 * @param {'equals'|'contains'|'startsWith'} op
 */
export function caseInsensitiveFilter(value, op = 'equals') {
  // DANH: sqlite-schema-drift-fix
  if (dbSupports.caseInsensitiveMode) {
    return { [op]: value, mode: 'insensitive' };
  }
  // DANH: sqlite-schema-drift-fix — SQLite fallback: LIKE via contains is case-insensitive for ASCII.
  return op === 'equals'
    ? { contains: value }
    : { [op]: value };
}

/**
 * @param {{ transactionMode?: string, catalogLabel?: string, ctaLabel?: string } | null | undefined} commerce
 * @returns {{ transactionMode?: string, catalogLabel?: string, ctaLabel?: string }}
 */
export function extendedBusinessFieldsFromCommerce(commerce) {
  // DANH: sqlite-schema-drift-fix
  if (!dbSupports.extendedBusinessFields || !commerce) return {};
  return {
    transactionMode: commerce.transactionMode,
    catalogLabel: commerce.catalogLabel,
    ctaLabel: commerce.ctaLabel,
  };
}

/** Prisma Business select for public read routes — omits Postgres-only columns on SQLite. */
export function businessPublicReadSelect(extra = {}) {
  const base = {
    id: true,
    name: true,
    slug: true,
    type: true,
    tagline: true,
    description: true,
    heroText: true,
    heroImageUrl: true,
    avatarImageUrl: true,
    logo: true,
    publishedAt: true,
    stylePreferences: true,
    storefrontSettings: true,
    isActive: true,
    userId: true,
    primaryColor: true,
    secondaryColor: true,
    showOwnerProfile: true,
    socialLinks: true,
    createdAt: true,
    updatedAt: true,
    ...extra,
  };
  if (dbSupports.extendedBusinessFields) {
    return {
      ...base,
      transactionMode: true,
      catalogLabel: true,
      ctaLabel: true,
    };
  }
  return base;
}

/** Commerce labels for public DTO — from Business columns (Postgres) or projection/public store defaults. */
export function publicCommerceFields(business, pub = {}) {
  const type = business?.type ?? pub.type ?? null;
  const transactionMode = business?.transactionMode ?? pub.transactionMode ?? 'order';
  const isService = transactionMode === 'booking' || isServiceVertical(type);
  const rawCta = business?.ctaLabel ?? pub.ctaLabel ?? null;
  return {
    transactionMode: isService ? 'booking' : transactionMode,
    catalogLabel:
      business?.catalogLabel ?? pub.catalogLabel ?? (isService ? 'Services' : 'Products'),
    ctaLabel: coerceServiceCtaLabel({
      businessType: type,
      transactionMode: isService ? 'booking' : transactionMode,
      ctaLabel: rawCta,
    }),
  };
}
