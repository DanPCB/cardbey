/**
 * Public-safe enrichment views for activation UI and Performer handoff.
 */

import type {
  EnrichmentCandidate,
  IngestedSeedRecord,
  PerformerEnrichmentHandoff,
  PublicPreparedSuggestion,
} from './types.js';
import { LOW_CONFIDENCE_THRESHOLD } from './enrichmentSafety.js';
import { listEnrichmentCandidates } from './EnrichmentCandidateStore.js';

const FIELD_LABELS: Record<string, string> = {
  description: 'Description',
  hero_image: 'Hero image',
  logo: 'Logo',
  category: 'Category',
  opening_hours: 'Opening hours',
  social_links: 'Social links',
  services: 'Services',
};

function displayValueForCandidate(candidate: EnrichmentCandidate): string {
  if (candidate.field === 'social_links' || candidate.field === 'services') {
    try {
      const parsed = JSON.parse(candidate.value);
      if (Array.isArray(parsed)) return parsed.join(', ');
      if (parsed && typeof parsed === 'object') {
        return Object.entries(parsed)
          .map(([k, v]) => `${k}: ${v}`)
          .join(' · ');
      }
    } catch {
      /* fall through */
    }
  }
  if (candidate.field === 'opening_hours') {
    try {
      const parsed = JSON.parse(candidate.value) as { weekday_text?: string[]; lines?: string[] };
      const lines = parsed.weekday_text ?? parsed.lines ?? [];
      return lines.slice(0, 3).join(' · ');
    } catch {
      return 'Hours available';
    }
  }
  return candidate.value.length > 120 ? `${candidate.value.slice(0, 117)}…` : candidate.value;
}

export function buildPublicPreparedSuggestions(
  candidates: EnrichmentCandidate[],
): PublicPreparedSuggestion[] {
  return candidates
    .filter((c) => c.status === 'suggested')
    .map((c) => ({
      id: c.id,
      kind: c.field,
      label: FIELD_LABELS[c.field] ?? c.field,
      displayValue: displayValueForCandidate(c),
      imageUrl: c.field === 'hero_image' || c.field === 'logo' ? c.value : null,
    }));
}

export async function getPublicPreparedSuggestionsForSeed(
  seedId: string,
): Promise<PublicPreparedSuggestion[]> {
  const candidates = await listEnrichmentCandidates(seedId);
  return buildPublicPreparedSuggestions(candidates);
}

export function buildPerformerEnrichmentHandoff(
  seed: IngestedSeedRecord,
  accepted: EnrichmentCandidate[],
): PerformerEnrichmentHandoff {
  const n = seed.normalized;
  const knownFacts: string[] = [];
  if (n.businessName) knownFacts.push(`Business name: ${n.businessName}`);
  if (n.category) knownFacts.push(`Category: ${n.category}`);
  if (n.city) knownFacts.push(`Location: ${n.city}`);
  if (n.website) knownFacts.push('Website on file');
  if (n.phone) knownFacts.push('Phone on file');

  const suggestedImprovements = accepted.map(
    (c) => `${FIELD_LABELS[c.field] ?? c.field}: ready to apply`,
  );

  const missingFields: string[] = [];
  if (!n.website) missingFields.push('website');
  if (!n.category) missingFields.push('category');
  if (!accepted.some((c) => c.field === 'hero_image')) missingFields.push('hero_image');
  if (!accepted.some((c) => c.field === 'description')) missingFields.push('description');
  if (!accepted.some((c) => c.field === 'logo')) missingFields.push('logo');

  const recommendedFirstActions: string[] = [
    'Review accepted profile suggestions',
    'Create first offer',
    'Generate welcome post',
  ];
  if (missingFields.includes('hero_image')) {
    recommendedFirstActions.push('Add a hero image');
  }

  return {
    knownFacts,
    suggestedImprovements,
    missingFields,
    recommendedFirstActions,
    acceptedCandidateIds: accepted.map((c) => c.id),
  };
}

export function isLowConfidenceSeedProfile(seed: IngestedSeedRecord): boolean {
  return (seed.normalized.confidenceScore ?? 0) < LOW_CONFIDENCE_THRESHOLD;
}
