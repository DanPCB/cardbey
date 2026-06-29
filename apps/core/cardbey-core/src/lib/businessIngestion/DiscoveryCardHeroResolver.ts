/**
 * Hero media resolution for public Discovery Cards.
 * Uses category vocabulary with business name — never unrelated generic food stock.
 */

import type { IngestedSeedRecord } from './types.js';
import { resolveSeedRepresentativeHero } from '../businessCandidate/media/resolveSeedRepresentativeHero.js';

export type DiscoveryHeroSource =
  | 'website'
  | 'open_graph'
  | 'social_profile'
  | 'logo'
  | 'category_template'
  | 'generic'
  | 'representative';

export function resolveDiscoveryCardHero(seed: IngestedSeedRecord): {
  heroImageUrl: string;
  heroImageSource: DiscoveryHeroSource;
} {
  const { heroImageUrl, categoryKey } = resolveSeedRepresentativeHero(seed);
  return {
    heroImageUrl,
    heroImageSource: categoryKey === 'unknown' ? 'generic' : 'representative',
  };
}
