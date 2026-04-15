/**
 * Shared loader for businessProfileService (TypeScript module).
 * Used by draftStoreService and buildCatalog to avoid circular imports.
 */
let _mod;
export async function loadBusinessProfileService() {
  try {
    return (_mod ??= await import('../businessProfileService.ts'));
  } catch (err) {
    if (err?.code === 'ERR_UNKNOWN_FILE_EXTENSION' || err?.code === 'ERR_MODULE_NOT_FOUND') return null;
    throw err;
  }
}
