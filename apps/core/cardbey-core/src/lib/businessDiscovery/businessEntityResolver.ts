/**
 * TypeScript facade — canonical runtime is businessEntityResolver.js
 */

import type { BusinessDiscoveryCandidate } from './businessDiscoveryTypes.js';

export {
  buildDedupeKey,
  matchCandidates,
  findDuplicate,
} from './businessEntityResolver.js';

export interface DedupeFields {
  name: string | null;
  phone: string | null;
  website: string | null;
  location: string | null;
}

export interface MatchSignal {
  matched: boolean;
  score: number;
  reasons: string[];
}

export type { BusinessDiscoveryCandidate };
