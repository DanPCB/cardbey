/**
 * DANH: sqlite-schema-drift-fix — runtime flags for schema differences (SQLite local vs Postgres prod).
 * Capability detection is centralized in lib/persistence/dbCapabilityRegistry.js.
 */

import { isServiceBusinessContext } from './catalog/catalogItemClassification.js';
import { classifyBusinessVertical } from './classifyBusinessVertical.js';
import { coerceServiceCtaLabel, isServiceVertical, inferCatalogSectionLabel } from './storeTransactionMode.js';
import { hasBusinessColumn } from './businessColumnCapabilities.js';
import { getDbCapabilities, resolveDbProvider } from './persistence/dbCapabilityRegistry.js';

/** @type {string} */
export const DB_PROVIDER = resolveDbProvider();

const _caps = () => getDbCapabilities();

export const dbSupports = {
  get extendedBusinessFields() {
    return _caps().supportsExtendedBusinessFields;
  },
  get caseInsensitiveMode() {
    return _caps().supportsCaseInsensitiveMode;
  },
  get createManySkipDuplicates() {
    return _caps().supportsCreateManySkipDuplicates;
  },
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

function pickBusinessSelectFields(...fields) {
  /** @type {Record<string, true>} */
  const out = {};
  for (const field of fields) {
    if (hasBusinessColumn(field)) out[field] = true;
  }
  return out;
}

/** Prisma Business select for public read routes — omits missing / Postgres-only columns. */
export function businessPublicReadSelect(extra = {}) {
  const base = {
    id: true,
    name: true,
    slug: true,
    type: true,
    isActive: true,
    userId: true,
    createdAt: true,
    updatedAt: true,
    ...pickBusinessSelectFields(
      'tagline',
      'description',
      'heroText',
      'heroImageUrl',
      'avatarImageUrl',
      'logo',
      'publishedAt',
      'stylePreferences',
      'storefrontSettings',
      'primaryColor',
      'secondaryColor',
      'showOwnerProfile',
      'socialLinks',
      'phone',
      'email',
      'websiteUrl',
      'address',
      'suburb',
      'state',
      'postcode',
      'country',
      'mapUrl',
      'region',
      'provenance',
      'claimStatus',
      'captureCount',
      'lat',
      'lng',
    ),
    ...extra,
  };
  if (dbSupports.extendedBusinessFields) {
    return {
      ...base,
      transactionMode: true,
      catalogLabel: true,
      ctaLabel: true,
      isGuestDraft: true,
      expiresAt: true,
    };
  }
  return base;
}

/** Commerce labels for public DTO — from Business columns (Postgres) or projection/public store defaults. */
export function publicCommerceFields(business, pub = {}) {
  const type = business?.type ?? pub.type ?? null;
  const name = business?.name ?? pub.name ?? null;
  const settings =
    business?.storefrontSettings && typeof business.storefrontSettings === 'object'
      ? business.storefrontSettings
      : pub.storefrontSettings && typeof pub.storefrontSettings === 'object'
        ? pub.storefrontSettings
        : {};
  const classification = classifyBusinessVertical({
    category: settings.category ?? pub.category ?? null,
    businessType: type,
    businessName: name,
    businessVertical: settings.businessVertical ?? pub.businessVertical ?? null,
    commerceMode: settings.commerceVerticalMode ?? pub.commerceVerticalMode ?? null,
  });
  let transactionMode = business?.transactionMode ?? pub.transactionMode ?? classification.transactionMode;
  if (
    (classification.businessVertical === 'food' || classification.businessVertical === 'retail') &&
    transactionMode === 'booking'
  ) {
    transactionMode = 'order';
  }
  const isService =
    classification.businessVertical !== 'food' &&
    classification.businessVertical !== 'retail' &&
    (transactionMode === 'booking' ||
      (transactionMode !== 'order' && isServiceVertical(type)) ||
      isServiceBusinessContext({ type, name }));
  const rawCta = business?.ctaLabel ?? pub.ctaLabel ?? null;
  const commerceMode = isService ? 'booking' : transactionMode === 'order' ? 'order' : 'inquiry';
  return {
    transactionMode: isService ? 'booking' : transactionMode,
    catalogLabel:
      business?.catalogLabel ??
      pub.catalogLabel ??
      classification.catalogLabel ??
      inferCatalogSectionLabel(type, commerceMode, name),
    ctaLabel: coerceServiceCtaLabel({
      businessType: type,
      transactionMode: isService ? 'booking' : transactionMode,
      ctaLabel: rawCta,
      businessName: name,
    }),
    businessVertical: classification.businessVertical,
    commerceVerticalMode: classification.commerceMode,
    feedCategory: classification.feedCategory,
  };
}
