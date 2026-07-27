/**
 * @typedef {Object} DbCapabilities
 * @property {'sqlite' | 'postgres' | 'postgresql' | 'mysql' | 'unknown'} provider
 * @property {boolean} isSqlite
 * @property {boolean} isPostgres
 * @property {boolean} isProductionTarget
 * @property {boolean} supportsCreateManySkipDuplicates
 * @property {boolean} supportsInteractiveTransactions
 * @property {boolean} supportsSerializableIsolation
 * @property {boolean} supportsJsonFiltering
 * @property {boolean} supportsReturning
 * @property {boolean} supportsBatchInsert
 * @property {boolean} supportsExtendedBusinessFields
 * @property {boolean} supportsCaseInsensitiveMode
 * @property {number} createManyMaxRows
 */

export {};
