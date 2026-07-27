/**
 * Runtime Business table column availability (SQLite schema drift guard).
 * Probes PRAGMA table_info once per process; Postgres assumes full schema.
 */
import { createRequire } from 'node:module';
import { getDbCapabilities } from './persistence/dbCapabilityRegistry.js';
import { resolveSqliteDatabasePath } from './sqliteDbPath.js';

const require = createRequire(import.meta.url);

/** @type {Set<string> | null} */
let cachedColumns = null;

/** Postgres Business columns — must match prisma/postgres/schema.prisma model Business */
const POSTGRES_BUSINESS_COLUMNS = new Set([
  'id',
  'userId',
  'name',
  'type',
  'slug',
  'description',
  'showOwnerProfile',
  'translations',
  'logo',
  'region',
  'isActive',
  'tradingHours',
  'address',
  'addressLine2',
  'suburb',
  'city',
  'state',
  'postcode',
  'country',
  'formattedAddress',
  'locationSource',
  'locationConfidence',
  'osmPlaceId',
  'phone',
  'email',
  'websiteUrl',
  'mapUrl',
  'lat',
  'lng',
  'primaryColor',
  'secondaryColor',
  'tagline',
  'heroText',
  'heroImageUrl',
  'avatarImageUrl',
  'publishedAt',
  'transactionMode',
  'catalogLabel',
  'ctaLabel',
  'stylePreferences',
  'storefrontSettings',
  'socialLinks',
  'brandTone',
  'brandStyle',
  'brandColors',
  'provenance',
  'claimStatus',
  'captureCount',
  'capturedByUserId',
  'isGuestDraft',
  'expiresAt',
  'createdAt',
  'updatedAt',
]);

function openReadonlySqlite(absolutePath) {
  const { DatabaseSync } = require('node:sqlite');
  return new DatabaseSync(absolutePath, { readonly: true });
}

/**
 * @returns {Set<string>}
 */
export function getBusinessTableColumns() {
  if (cachedColumns) return cachedColumns;

  const { isSqlite } = getDbCapabilities();
  if (!isSqlite) {
    cachedColumns = POSTGRES_BUSINESS_COLUMNS;
    return cachedColumns;
  }

  const dbPath = resolveSqliteDatabasePath();
  if (!dbPath) {
    cachedColumns = new Set();
    return cachedColumns;
  }

  try {
    const db = openReadonlySqlite(dbPath);
    cachedColumns = new Set(
      db.prepare('PRAGMA table_info("Business")').all().map((row) => row.name),
    );
    db.close();

    const optionalMissing = [
      'heroImageUrl',
      'avatarImageUrl',
      'publishedAt',
      'storefrontSettings',
      'socialLinks',
      'showOwnerProfile',
    ].filter((name) => !cachedColumns.has(name));
    if (optionalMissing.length > 0) {
      console.warn('[DB] Business optional columns missing — public reads use safe projection', {
        optionalMissing,
        dbPath,
      });
    }
  } catch (error) {
    console.warn('[DB] Failed to probe Business columns:', error?.message || error);
    cachedColumns = new Set();
  }

  return cachedColumns;
}

/** @param {string} columnName */
export function hasBusinessColumn(columnName) {
  const columns = getBusinessTableColumns();
  return columns.has(columnName);
}

/**
 * @returns {{ heroImageUrl: boolean; avatarImageUrl: boolean; publishedAt: boolean; storefrontSettings: boolean; socialLinks: boolean; showOwnerProfile: boolean }}
 */
export function getBusinessColumnSupport() {
  return {
    heroImageUrl: hasBusinessColumn('heroImageUrl'),
    avatarImageUrl: hasBusinessColumn('avatarImageUrl'),
    publishedAt: hasBusinessColumn('publishedAt'),
    storefrontSettings: hasBusinessColumn('storefrontSettings'),
    socialLinks: hasBusinessColumn('socialLinks'),
    showOwnerProfile: hasBusinessColumn('showOwnerProfile'),
  };
}

/** Reset probe cache (tests). */
export function resetBusinessColumnSupportCache() {
  cachedColumns = null;
}
