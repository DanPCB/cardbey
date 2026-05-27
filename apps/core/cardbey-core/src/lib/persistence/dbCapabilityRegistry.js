/**
 * Central Prisma / database capability registry.
 * Services must use this layer — never branch on provider strings inline.
 */

/** @type {'sqlite' | 'postgres' | 'postgresql' | 'mysql' | 'unknown'} */
export function resolveDbProvider() {
  const explicit = (process.env.DATABASE_PROVIDER || '').trim().toLowerCase();
  if (explicit === 'postgres' || explicit === 'postgresql') return 'postgres';
  if (explicit === 'sqlite') return 'sqlite';
  if (explicit === 'mysql') return 'mysql';

  const url = (process.env.DATABASE_URL || '').trim().toLowerCase();
  if (url.startsWith('postgres')) return 'postgres';
  if (url.startsWith('mysql')) return 'mysql';
  if (url.startsWith('file:') || url.includes('sqlite')) return 'sqlite';
  return 'sqlite';
}

/** @typedef {import('./dbCapabilityTypes.js').DbCapabilities} DbCapabilities */

/** @type {DbCapabilities | null} */
let cachedCapabilities = null;
let capabilitiesLogged = false;

/**
 * @returns {DbCapabilities}
 */
export function getDbCapabilities() {
  if (cachedCapabilities) return cachedCapabilities;

  const provider = resolveDbProvider();
  const isSqlite = provider === 'sqlite';
  const isPostgres = provider === 'postgres';

  cachedCapabilities = {
    provider,
    isSqlite,
    isPostgres,
    isProductionTarget: isPostgres,
    supportsCreateManySkipDuplicates: isPostgres,
    supportsInteractiveTransactions: true,
    supportsSerializableIsolation: isPostgres,
    supportsJsonFiltering: isPostgres,
    supportsReturning: isPostgres,
    supportsBatchInsert: true,
    /** Business.transactionMode columns — schema drift guard (legacy dbCapabilities). */
    supportsExtendedBusinessFields: !isSqlite,
    supportsCaseInsensitiveMode: !isSqlite,
    /** Prisma createMany default max rows per call (both connectors). */
    createManyMaxRows: 1000,
  };

  return cachedCapabilities;
}

/** Reset cache (tests). */
export function resetDbCapabilitiesCache() {
  cachedCapabilities = null;
  capabilitiesLogged = false;
}

/**
 * Log capability snapshot once per process (dev / explicit flag).
 */
export function logDbCapabilitiesOnce() {
  if (capabilitiesLogged) return;
  if (process.env.NODE_ENV === 'test' && process.env.LOG_DB_CAPABILITIES !== '1') return;
  capabilitiesLogged = true;
  const caps = getDbCapabilities();
  console.log('[DB_CAPABILITIES]', JSON.stringify({
    provider: caps.provider,
    supportsCreateManySkipDuplicates: caps.supportsCreateManySkipDuplicates,
    supportsInteractiveTransactions: caps.supportsInteractiveTransactions,
    supportsSerializableIsolation: caps.supportsSerializableIsolation,
    supportsJsonFiltering: caps.supportsJsonFiltering,
    supportsReturning: caps.supportsReturning,
    supportsBatchInsert: caps.supportsBatchInsert,
    supportsExtendedBusinessFields: caps.supportsExtendedBusinessFields,
    createManyMaxRows: caps.createManyMaxRows,
  }));
}
