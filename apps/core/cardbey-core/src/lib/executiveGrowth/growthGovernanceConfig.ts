/**
 * Growth Command Center governance — Discovery Engine V1 is canonical for store creation.
 */

/** When false (default), Growth must not create DraftStore/Business rows. */
export function isLegacyGrowthStoreCreationEnabled(): boolean {
  const raw = process.env.ENABLE_LEGACY_GROWTH_STORE_CREATION?.trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

export const LEGACY_STORE_CREATION_DISABLED_MESSAGE =
  'Store Auto-Creation Disabled — Discovery Engine V1 is now the canonical onboarding system. Use Discovery promotion instead.';
