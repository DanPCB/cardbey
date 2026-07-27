/**
 * Category-safe representative hero for seeds without BusinessCandidate media evidence.
 */

import type { IngestedSeedRecord } from '../../businessIngestion/types.js';
import {
  categoryRepresentativeHeroUrl,
  resolvePilotCategoryKey,
} from './categoryMediaVocabulary.js';

export function resolveSeedRepresentativeHero(seed: IngestedSeedRecord): {
  heroImageUrl: string;
  categoryKey: ReturnType<typeof resolvePilotCategoryKey>;
} {
  const n = seed.normalized;
  const categoryKey = resolvePilotCategoryKey(n.category, n.businessName);
  return {
    heroImageUrl: categoryRepresentativeHeroUrl(categoryKey),
    categoryKey,
  };
}
