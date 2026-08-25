/**
 * Competitor / business-comparison discovery — D7.1.
 * Uses context-derived queries; shows DIRECT / ADJACENT / POSSIBLE comparisons.
 */

import {
  isGooglePlacesConfigured,
  searchGooglePlaces,
} from '../businessDiscovery/businessDiscoverySources.runtime.js';
import { isGenericBusinessLabel } from './businessContextSufficiency.js';
import { buildComparisonSearchQueries } from './comparisonQueries.js';
import { KNOWLEDGE_STATES } from './knowledgeStates.js';
import { resolveVerticalArchetype, VERTICAL_ARCHETYPES } from './verticalPacks.js';

export const COMPARISON_CLASS = Object.freeze({
  DIRECT_COMPARISON: 'DIRECT_COMPARISON',
  ADJACENT_COMPARISON: 'ADJACENT_COMPARISON',
  POSSIBLE_COMPARISON: 'POSSIBLE_COMPARISON',
  /** @deprecated use POSSIBLE_COMPARISON */
  LOW_CONFIDENCE: 'POSSIBLE_COMPARISON',
  REJECTED: 'REJECTED',
});

/**
 * @param {{
 *   businessName?: string | null,
 *   businessType?: string | null,
 *   category?: string | null,
 *   location?: string | null,
 *   subjectPlaceIds?: string[],
 *   offerings?: string[],
 *   operatingModel?: string | null,
 *   sourceText?: string | null,
 *   typeClarificationAnswer?: string | null,
 *   mode?: string | null,
 * }} input
 * @param {{ searchGooglePlaces?: typeof searchGooglePlaces }} [deps]
 */
export async function discoverCompetitorCandidates(input, deps = {}) {
  const location = clean(input.location);
  const subjectName = clean(input.businessName);
  const subjectIds = new Set((input.subjectPlaceIds || []).filter(Boolean));
  const vertical = resolveVerticalArchetype({
    mode: input.mode || 'EXISTING',
    context: {
      sourceText: input.sourceText,
      identity: {
        name: subjectName,
        businessType: input.businessType,
        category: input.category,
        operatingModel: input.operatingModel,
        location,
      },
      knowledge: input.typeClarificationAnswer
        ? [{ field: 'typeClarificationAnswer', value: input.typeClarificationAnswer }]
        : [],
    },
    snapshot: {
      offerings: {
        items: (input.offerings || []).map((name) => ({ name })),
      },
    },
  });

  const queries = buildComparisonSearchQueries({
    businessName: subjectName,
    businessType: input.businessType,
    category: input.category,
    location,
    sourceText: input.sourceText,
    operatingModel: input.operatingModel,
    offerings: input.offerings,
    verticalId: vertical.id,
    typeClarificationAnswer: input.typeClarificationAnswer,
  });

  const discoveryAttempted = Boolean(location && queries.length > 0);

  if (!location || queries.length === 0) {
    return emptyResult({
      location,
      skipped: true,
      reason: 'missing_type_or_location',
      discoveryAttempted: false,
      candidateFoundRate: 0,
    });
  }

  const search = deps.searchGooglePlaces || searchGooglePlaces;
  if (!deps.searchGooglePlaces && !isGooglePlacesConfigured()) {
    return emptyResult({
      location,
      skipped: true,
      reason: 'places_not_configured',
      discoveryAttempted: true,
      candidateFoundRate: 0,
    });
  }

  /** @type {Map<string, object>} */
  const rowByKey = new Map();
  for (const query of queries) {
    let raw = [];
    try {
      raw = await search(query, location);
    } catch {
      raw = [];
    }
    for (const row of (Array.isArray(raw) ? raw : []).map(unwrap).filter(Boolean)) {
      const key = clean(row.placeId || row.sourceId) || `n_${slug(row.name || row.businessName)}`;
      if (!rowByKey.has(key)) rowByKey.set(key, row);
    }
  }

  const rawCount = rowByKey.size;
  const offeringTokens = tokens((input.offerings || []).join(' '));
  const sourceText = [input.sourceText, input.typeClarificationAnswer].filter(Boolean).join(' ');
  const typeHint =
    clean(input.typeClarificationAnswer) ||
    (input.businessType && !isGenericBusinessLabel(input.businessType)
      ? clean(input.businessType)
      : null) ||
    clean(input.category);

  /** @type {object[]} */
  const shown = [];
  /** @type {object[]} */
  const rejected = [];

  for (const row of rowByKey.values()) {
    const name = clean(row.name || row.businessName);
    const placeId = clean(row.placeId || row.sourceId);
    if (!name) continue;
    if (placeId && subjectIds.has(placeId)) continue;
    if (subjectName && namesLikelySame(subjectName, name)) continue;

    const scored = scoreRelevance({
      candidateName: name,
      candidateTypes: row.types || row.categories || [],
      typeHint,
      category: input.category,
      sourceText,
      vertical,
      offeringTokens,
      candidateWebsite: row.website,
      candidateDescription: row.description || row.editorialSummary || null,
    });

    const base = {
      id: placeId || `cmp_${slug(name)}`,
      name,
      location: clean(row.location || row.address) || location,
      website: row.website || null,
      comparisonClass: scored.comparisonClass,
      classification: mapLegacyClassification(scored.comparisonClass),
      whyRelevant: scored.why,
      whyRejected: scored.whyRejected || null,
      supportingOverlap: scored.supportingOverlap,
      evidenceSource: 'google_places_text_search',
      knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
      confidence: scored.score,
      distanceImplied: false,
      distanceWeight: 'low',
      note: noteForClass(scored.comparisonClass),
      limitations: scored.limitations || null,
    };

    if (scored.comparisonClass === COMPARISON_CLASS.REJECTED) {
      rejected.push(base);
      continue;
    }
    shown.push(base);
  }

  const limited = shown.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  const count = limited.length;
  const directCount = limited.filter((c) => c.comparisonClass === COMPARISON_CLASS.DIRECT_COMPARISON).length;
  const adjacentCount = limited.filter(
    (c) => c.comparisonClass === COMPARISON_CLASS.ADJACENT_COMPARISON,
  ).length;
  const possibleCount = limited.filter(
    (c) => c.comparisonClass === COMPARISON_CLASS.POSSIBLE_COMPARISON,
  ).length;

  const marketContext = {
    similarBusinessCount: count,
    areaLabel: location,
    statement:
      count > 0
        ? `Cardbey identified ${count} business${count === 1 ? '' : 'es'} worth comparing in the selected area.`
        : 'No sufficiently relevant comparison businesses were verified.',
    knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
    limitations:
      'These are evidence-backed comparison candidates — not rankings or confirmed competitors. Distance alone has low evidentiary weight.',
  };

  return {
    ok: true,
    candidates: limited,
    rejected: rejected.slice(0, 20),
    marketContext,
    skipped: false,
    reason: count ? null : 'no_verified_comparisons',
    verticalId: vertical.id,
    discoveryMetrics: {
      discoveryAttempted,
      queriesUsed: queries.length,
      rawCandidateCount: rawCount,
      candidateFoundRate: rawCount > 0 ? 1 : 0,
      displayedCount: count,
      directCount,
      adjacentCount,
      possibleCount,
      rejectedCount: rejected.length,
      isGeneralVertical: vertical.id === VERTICAL_ARCHETYPES.GENERAL,
    },
  };
}

function emptyResult({ location, skipped, reason, discoveryAttempted, candidateFoundRate }) {
  return {
    ok: true,
    candidates: [],
    rejected: [],
    marketContext: {
      similarBusinessCount: null,
      areaLabel: location || null,
      statement: null,
      knowledgeState: KNOWLEDGE_STATES.ASSUMPTION,
      limitations:
        reason === 'places_not_configured'
          ? 'Places search is not configured in this environment.'
          : 'Insufficient type/location to search for comparison businesses.',
    },
    skipped,
    reason,
    discoveryMetrics: {
      discoveryAttempted,
      queriesUsed: 0,
      rawCandidateCount: 0,
      candidateFoundRate,
      displayedCount: 0,
      directCount: 0,
      adjacentCount: 0,
      possibleCount: 0,
      rejectedCount: 0,
      isGeneralVertical: null,
    },
  };
}

function mapLegacyClassification(comparisonClass) {
  if (comparisonClass === COMPARISON_CLASS.DIRECT_COMPARISON) return 'competitor_candidate';
  return 'possible_comparison_business';
}

function noteForClass(comparisonClass) {
  if (comparisonClass === COMPARISON_CLASS.DIRECT_COMPARISON) {
    return 'Direct comparison — strong offering/category overlap; not a ranking.';
  }
  if (comparisonClass === COMPARISON_CLASS.ADJACENT_COMPARISON) {
    return 'Adjacent comparison — related offering or customer overlap.';
  }
  if (comparisonClass === COMPARISON_CLASS.POSSIBLE_COMPARISON) {
    return 'Possible comparison — useful for exploration; insufficient evidence for a stronger claim.';
  }
  return 'Rejected — not shown.';
}

function scoreRelevance({
  candidateName,
  candidateTypes,
  typeHint,
  category,
  sourceText,
  vertical,
  offeringTokens,
  candidateWebsite,
  candidateDescription,
}) {
  const hintTokens = tokens(`${typeHint || ''} ${category || ''}`);
  const sourceTokens = tokens(sourceText || '');
  const nameTokens = tokens(candidateName);
  const typeTokens = tokens(
    Array.isArray(candidateTypes) ? candidateTypes.join(' ') : String(candidateTypes || ''),
  );
  const descTokens = tokens(candidateDescription || '');
  const pool = new Set([...nameTokens, ...typeTokens, ...descTokens]);

  const rejectTokens = vertical?.rejectTokens || [];
  for (const t of rejectTokens) {
    if ([...pool].some((p) => p.includes(t) || t.includes(p))) {
      return rejectResult(`Name/types conflict with ${vertical.id} (reject token "${t}")`);
    }
  }

  let hits = overlapCount(hintTokens, pool);
  let sourceHits = overlapCount(sourceTokens, pool);
  const verticalHits = (vertical?.competitorTokens || []).filter((t) =>
    [...pool].some((p) => p.includes(t) || t.includes(p)),
  ).length;
  const offeringHits = overlapCount(offeringTokens || [], pool);

  let score = 0.15;
  score += Math.min(0.35, hits * 0.12);
  score += Math.min(0.25, sourceHits * 0.1);
  score += Math.min(0.25, verticalHits * 0.1);
  score += Math.min(0.2, offeringHits * 0.08);
  if (candidateWebsite) score += 0.03;

  const hasOverlap = hits >= 1 || verticalHits >= 1 || sourceHits >= 2 || offeringHits >= 1;
  if (!hasOverlap) {
    return rejectResult('Appeared in Places search without offering/category/source overlap');
  }

  const whyParts = [];
  const supportingOverlap = [];
  if (verticalHits > 0) {
    whyParts.push(`Category overlap (${verticalHits} vertical signals)`);
    supportingOverlap.push('business-category overlap');
  }
  if (hits > 0) {
    whyParts.push(`Type/category token overlap (${hits})`);
    supportingOverlap.push('offering/category overlap');
  }
  if (sourceHits > 0) {
    whyParts.push(`Business-context token overlap (${sourceHits})`);
    supportingOverlap.push('operating-model similarity');
  }
  if (offeringHits > 0) {
    whyParts.push(`Offering token overlap (${offeringHits})`);
    supportingOverlap.push('offering overlap');
  }
  whyParts.push('Source: public Places text search');
  whyParts.push('Geographic relevance: selected market');

  let comparisonClass = COMPARISON_CLASS.POSSIBLE_COMPARISON;
  if (score >= 0.72 && (verticalHits >= 1 || hits >= 2 || (hits >= 1 && offeringHits >= 1))) {
    comparisonClass = COMPARISON_CLASS.DIRECT_COMPARISON;
  } else if (score >= 0.55 && (verticalHits >= 1 || hits >= 1 || sourceHits >= 2)) {
    comparisonClass = COMPARISON_CLASS.ADJACENT_COMPARISON;
  } else if (score >= 0.38 && hasOverlap) {
    comparisonClass = COMPARISON_CLASS.POSSIBLE_COMPARISON;
  } else {
    return rejectResult('Insufficient semantic overlap for display');
  }

  return {
    score: Math.min(0.95, score),
    comparisonClass,
    why: whyParts.join('. '),
    supportingOverlap,
    limitations:
      comparisonClass === COMPARISON_CLASS.POSSIBLE_COMPARISON
        ? 'Not promoted to a factual competitor claim.'
        : null,
  };
}

function rejectResult(whyRejected) {
  return {
    score: 0.1,
    comparisonClass: COMPARISON_CLASS.REJECTED,
    why: 'Rejected by relevance filter',
    whyRejected,
    supportingOverlap: [],
  };
}

function overlapCount(tokenList, pool) {
  let n = 0;
  for (const t of tokenList || []) {
    if (pool.has(t)) n += 1;
    else if ([...pool].some((p) => p.includes(t) || t.includes(p))) n += 1;
  }
  return n;
}

function unwrap(row) {
  if (!row || typeof row !== 'object') return null;
  if (row.raw && typeof row.raw === 'object') return { ...row.raw, ...row };
  return row;
}

function namesLikelySame(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

function normalizeName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\b(pty|ltd|inc|llc|co|the)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}

const STOP = new Set([
  'and',
  'the',
  'for',
  'with',
  'from',
  'business',
  'company',
  'service',
  'services',
  'want',
  'create',
  'start',
  'planning',
]);

function clean(v) {
  const s = String(v ?? '').trim();
  return s || null;
}

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .slice(0, 40);
}
