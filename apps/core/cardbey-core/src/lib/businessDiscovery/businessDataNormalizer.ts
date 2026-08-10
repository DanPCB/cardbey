/**
 * TypeScript facade — canonical runtime is businessDataNormalizer.runtime.js
 * (must not re-export ./businessDataNormalizer.js — tsx remaps that to this .ts and cycles).
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
} from './businessDataNormalizer.runtime.js';

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
