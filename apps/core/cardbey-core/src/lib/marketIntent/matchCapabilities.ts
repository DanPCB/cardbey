import type { CardbeyCapabilityMatch, CapabilityFitLevel, CapabilityAvailability } from './opportunityTypes.js';
import type { MarketCapabilityDefinition } from './marketCapabilityCatalog.js';
import { getMarketCapabilityCatalog, UNAVAILABLE_DESIRED_CAPABILITIES } from './marketCapabilityCatalog.js';
import type { ExtractedNeed } from './extractNeeds.js';
import type { ResolvedMarketEntity } from './entityTypes.js';

function availabilityToFitLevel(
  availability: CapabilityAvailability,
  relevanceScore: number,
  requiresStore: boolean,
  entityKind: string,
): CapabilityFitLevel {
  if (availability === 'UNAVAILABLE') return 'NOT_AVAILABLE';
  if (relevanceScore < 0.25) return 'WEAK_MATCH';

  if (requiresStore && entityKind === 'BUSINESS') {
    if (availability === 'STUBBED') return 'WEAK_MATCH';
    return relevanceScore >= 0.55 ? 'SUPPORTING_MATCH' : 'WEAK_MATCH';
  }

  if (availability === 'AVAILABLE' && relevanceScore >= 0.6) return 'DIRECT_MATCH';
  if (availability === 'AVAILABLE' && relevanceScore >= 0.4) return 'SUPPORTING_MATCH';
  if (availability === 'PARTIAL' && relevanceScore >= 0.45) return 'SUPPORTING_MATCH';
  if (availability === 'STUBBED') return 'WEAK_MATCH';
  return 'WEAK_MATCH';
}

function scoreCapabilityRelevance(cap: MarketCapabilityDefinition, needs: ExtractedNeed[]): number {
  if (!needs.length) return 0;
  let score = 0;
  let weightSum = 0;
  for (const need of needs) {
    const tagHit = cap.needTags.some(
      (tag) => tag.includes(need.key) || need.key.includes(tag) || need.label.toLowerCase().includes(tag),
    );
    const descHit = cap.semanticDescription.toLowerCase().includes(need.key.replace(/_/g, ' '));
    if (tagHit || descHit) {
      score += need.weight;
      weightSum += need.weight;
    }
  }
  if (weightSum === 0) return 0;
  return Math.min(1, score / Math.max(1, needs.length * 0.5));
}

export function matchCapabilitiesToNeeds(
  needs: ExtractedNeed[],
  resolved: ResolvedMarketEntity,
): {
  matches: CardbeyCapabilityMatch[];
  unavailableDesired: Array<{ need: string; reason: string }>;
} {
  const catalog = getMarketCapabilityCatalog();
  const matches: CardbeyCapabilityMatch[] = [];

  for (const cap of catalog) {
    const relevance = scoreCapabilityRelevance(cap, needs);
    if (relevance < 0.2 && cap.availability !== 'AVAILABLE') continue;

    const fitLevel = availabilityToFitLevel(
      cap.availability,
      relevance,
      cap.requiresStore,
      resolved.entityKind,
    );
    if (fitLevel === 'NOT_AVAILABLE') continue;

    const matchScore = Math.round(
      relevance *
        100 *
        (cap.availability === 'AVAILABLE' ? 1 : cap.availability === 'PARTIAL' ? 0.75 : 0.5),
    );

    if (matchScore < 15 && fitLevel === 'WEAK_MATCH') continue;

    matches.push({
      capabilityId: cap.capabilityId,
      capabilityName: cap.capabilityName,
      availability: cap.availability,
      fitLevel,
      rank: 0,
      score: matchScore,
      reason: buildMatchReason(cap, needs, fitLevel),
      inputRequirements: cap.requiresStore ? ['storeId or onboarding via create_store'] : [],
      executionMode: cap.executionPath,
      approvalRequired: cap.approvalRequired,
      evidence: [
        {
          statement: `Matched via intakeToolRegistry: ${cap.capabilityId}`,
          source: 'capability_authority',
          confidence: matchScore / 100,
        },
      ],
      limitations: [...cap.limitations],
    });
  }

  matches.sort((a, b) => b.score - a.score);
  matches.forEach((m, i) => {
    m.rank = i + 1;
  });

  const unavailableDesired: Array<{ need: string; reason: string }> = [];
  for (const need of needs) {
    for (const unavail of UNAVAILABLE_DESIRED_CAPABILITIES) {
      if (need.key.includes(unavail.needKey) || unavail.needKey.includes(need.key)) {
        unavailableDesired.push({ need: unavail.label, reason: unavail.reason });
      }
    }
  }

  return { matches, unavailableDesired };
}

function buildMatchReason(
  cap: MarketCapabilityDefinition,
  needs: ExtractedNeed[],
  fitLevel: CapabilityFitLevel,
): string {
  const matchedNeeds = needs
    .filter((n) =>
      cap.needTags.some((t) => t.includes(n.key) || n.key.includes(t)),
    )
    .map((n) => n.label)
    .slice(0, 3);
  const needStr = matchedNeeds.length ? matchedNeeds.join(', ') : 'general business growth';
  return `${fitLevel}: ${cap.capabilityName} can assist with ${needStr} (${cap.availability})`;
}

export function splitMatches(matches: CardbeyCapabilityMatch[]): {
  primary: CardbeyCapabilityMatch[];
  supporting: CardbeyCapabilityMatch[];
} {
  const primary = matches.filter(
    (m) => m.fitLevel === 'DIRECT_MATCH' || (m.fitLevel === 'SUPPORTING_MATCH' && m.score >= 50),
  );
  const supporting = matches.filter((m) => !primary.includes(m));
  return {
    primary: primary.slice(0, 5),
    supporting: supporting.slice(0, 5),
  };
}
