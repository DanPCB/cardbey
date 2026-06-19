import type { BusinessCandidate } from '../types/index.js';

const WEIGHTS = {
  website: 20,
  phone: 20,
  address: 15,
  location: 15,
  category: 15,
  social: 15,
} as const;

export function computeDiscoveryScore(candidate: BusinessCandidate): number {
  let score = 0;

  if (candidate.website) score += WEIGHTS.website;
  if (candidate.phone) score += WEIGHTS.phone;
  if (candidate.address) score += WEIGHTS.address;
  if (candidate.latitude != null && candidate.longitude != null) score += WEIGHTS.location;
  if (candidate.category) score += WEIGHTS.category;
  if (candidate.socialProfiles?.length) score += WEIGHTS.social;

  const confidenceBoost = Math.round((candidate.confidence ?? 0) * 5);
  return Math.min(100, score + confidenceBoost);
}

export function applyDiscoveryScore(candidate: BusinessCandidate): BusinessCandidate {
  const discoveryScore = computeDiscoveryScore(candidate);
  return {
    ...candidate,
    metadata: {
      ...candidate.metadata,
      discoveryScore,
    },
  };
}

export function applyDiscoveryScores(candidates: BusinessCandidate[]): BusinessCandidate[] {
  return candidates.map(applyDiscoveryScore);
}
