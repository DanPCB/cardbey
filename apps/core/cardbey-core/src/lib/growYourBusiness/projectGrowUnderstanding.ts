/**
 * Project G1 HAS/WANT analysis into a user-facing YOU HAVE / YOU WANT card.
 * Does not expose analyzer internals.
 */
import type { HasWantsItem, MarketIntentAnalysis } from '../marketIntent/types.js';
import type { GrowBusinessContext, GrowClarificationCode, GrowUnderstanding } from './growYourBusinessTypes.js';

const LOCATION_TYPES = new Set(['LOCATION', 'MARKET_ACCESS']);

function isLocationItem(item: HasWantsItem): boolean {
  return LOCATION_TYPES.has(String(item.type || '').toUpperCase());
}

function joinLabels(items: HasWantsItem[]): string {
  const labels = items
    .map((item) => String(item.label || '').trim())
    .filter(Boolean);
  const unique = [...new Set(labels)];
  return unique.join(' · ');
}

function pickLocation(items: HasWantsItem[], fallback?: string | null): string | null {
  const fromItems = items.find((item) => isLocationItem(item) && item.label?.trim());
  if (fromItems?.label?.trim()) return fromItems.label.trim();
  const trimmed = String(fallback || '').trim();
  return trimmed || null;
}

function capabilityItems(items: HasWantsItem[]): HasWantsItem[] {
  return items.filter((item) => !isLocationItem(item) && String(item.label || '').trim());
}

function confidenceBand(value: number): GrowUnderstanding['confidence'] {
  if (value >= 0.85) return 'high';
  if (value >= 0.6) return 'medium';
  return 'low';
}

export function mergeBusinessContextIntoHas(
  has: HasWantsItem[],
  context: GrowBusinessContext | null,
): { has: HasWantsItem[]; usedBusinessContext: boolean } {
  if (!context) return { has, usedBusinessContext: false };

  const next = [...has];
  let used = false;
  const blob = next.map((item) => item.label.toLowerCase()).join(' ');

  if (context.name && !blob.includes(context.name.toLowerCase())) {
    next.push({
      type: 'BUSINESS',
      label: context.name,
      confidence: 0.8,
      basis: 'INFERRED',
      evidence: [],
    });
    used = true;
  }
  if (context.type && !blob.includes(context.type.toLowerCase())) {
    next.push({
      type: 'CAPABILITY',
      label: context.type,
      confidence: 0.72,
      basis: 'INFERRED',
      evidence: [],
    });
    used = true;
  } else if (context.tagline && !blob.includes(context.tagline.toLowerCase())) {
    next.push({
      type: 'CAPABILITY',
      label: context.tagline,
      confidence: 0.7,
      basis: 'INFERRED',
      evidence: [],
    });
    used = true;
  }
  const locationLabel = [context.city, context.country].filter(Boolean).join(', ');
  const hasLocation = next.some((item) => isLocationItem(item));
  if (locationLabel && !hasLocation) {
    next.push({
      type: 'LOCATION',
      label: locationLabel,
      confidence: 0.78,
      basis: 'INFERRED',
      evidence: [],
    });
    used = true;
  }

  return { has: next, usedBusinessContext: used };
}

export function projectGrowUnderstanding(
  analysis: MarketIntentAnalysis,
  options?: { usedBusinessContext?: boolean },
): GrowUnderstanding {
  const hasCapabilities = capabilityItems(analysis.has);
  const wantCapabilities = capabilityItems(analysis.wants);
  const hasLocation = pickLocation(analysis.has, analysis.locationHint);
  const wantLocation = pickLocation(analysis.wants, null);

  return {
    youHave: {
      label: joinLabels(hasCapabilities) || joinLabels(analysis.has) || analysis.businessHint || '',
      location: hasLocation,
    },
    youWant: {
      label: joinLabels(wantCapabilities) || joinLabels(analysis.wants) || '',
      location: wantLocation,
    },
    usedBusinessContext: Boolean(options?.usedBusinessContext),
    confidence: confidenceBand(analysis.classificationConfidence),
  };
}

export function resolveGrowClarification(
  analysis: MarketIntentAnalysis,
  understanding: GrowUnderstanding,
): GrowClarificationCode | null {
  if (analysis.outcome === 'NON_COMMERCIAL') return 'not_business_goal';
  if (analysis.classification === 'AMBIGUOUS' || analysis.outcome === 'AMBIGUOUS') {
    return 'low_confidence';
  }
  const hasLabel = understanding.youHave.label.trim();
  const wantLabel = understanding.youWant.label.trim();
  if (!hasLabel && !wantLabel) return 'low_confidence';
  if (!hasLabel) return 'missing_has';
  if (!wantLabel) return 'missing_want';
  if (understanding.confidence === 'low' || analysis.classificationConfidence < 0.55) {
    return 'low_confidence';
  }
  return null;
}
