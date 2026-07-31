/**
 * TypeScript facade — canonical runtime is businessDataNormalizer.js
 * (plain Node ESM / production create-store path).
 */

import type {
  BusinessDiscoveryCandidate,
  DiscoverySource,
  OpeningHours,
} from './businessDiscoveryTypes.js';

export {
  cleanString,
  normalizePhone,
  normalizeWebsite,
  websiteHost,
  normalizeOpeningHours,
  normalizePhotos,
  clampConfidence,
  computeConfidence,
  normalizeFacts,
} from './businessDataNormalizer.js';

export type NormalizedFacts = Pick<
  BusinessDiscoveryCandidate,
  | 'name'
  | 'category'
  | 'address'
  | 'phone'
  | 'website'
  | 'openingHours'
  | 'photos'
  | 'rating'
  | 'reviewCount'
  | 'location'
  | 'socialLinks'
>;

export type { DiscoverySource, OpeningHours };
