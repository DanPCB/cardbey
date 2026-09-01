import { cleanString } from '../businessDiscovery/businessDataNormalizer.runtime.js';
import type { EntityCandidate } from './entityTypes.js';
import type { ResolutionHints } from './entityTypes.js';
import type { ExternalMarketSignal, MarketIntentAnalysis } from './types.js';

export type CandidateCoherenceDecision =
  | 'MATCH'
  | 'POSSIBLE_MATCH'
  | 'INSUFFICIENT_EVIDENCE'
  | 'CONTRADICTED';

export type CandidateCoherenceReview = {
  candidate: EntityCandidate;
  decision: CandidateCoherenceDecision;
  identityMatchConfidence: number;
  providerCandidateConfidence: number;
  reasons: string[];
};

const PERSON_HONORIFIC_PREFIX = /^(em|chị|anh|cô|chú|bác|bạn|mr|mrs|ms|dr)\s+/i;

const BUSINESS_NAME_MARKERS =
  /\b(security|doors|shutters|accounting|cleaning|bakery|restaurant|beef|jerky|studio|salon|spa|gym|fitness|company|corp|ltd|pty|shop|store|services?)\b/i;

const OFFERING_CLUSTERS: Record<string, RegExp[]> = {
  fitness_wellness: [
    /\bfitness\b/i,
    /\bgym\b/i,
    /\bslim/i,
    /\bslimming\b/i,
    /\bbody\s*shap/i,
    /\btoning\b/i,
    /\bwellness\b/i,
    /\byoga\b/i,
    /\bpilates\b/i,
    /\beo\s*gọn/i,
    /\bdáng\s*(đẹp|xinh)/i,
    /\bgiảm\s*cân/i,
    /\bwaist\b/i,
    /\bworkout\b/i,
    /\bpersonal\s*train/i,
  ],
  beauty_personal: [/\bsalon\b/i, /\bbeauty\b/i, /\bnail\b/i, /\bhair\b/i, /\bspa\b/i, /\bmakeup\b/i],
  food_retail: [
    /\bbeef\b/i,
    /\bjerky\b/i,
    /\bfood\b/i,
    /\bmeat\b/i,
    /\bbakery\b/i,
    /\bbánh\b/i,
    /\bnhà\s*hàng/i,
    /\brestaurant\b/i,
    /\bcafe\b/i,
    /\bcoffee\b/i,
    /\bsquare\.site\b/i,
  ],
  security_install: [
    /\broller\s*shutter/i,
    /\bsecurity\s*door/i,
    /\bshutter\b/i,
    /\binstallation\b/i,
    /\bmeasur(e|ing)\b/i,
  ],
  accounting: [/\bkế\s*toán/i, /\btax\b/i, /\baccounting\b/i, /\bbookkeep/i],
};

const CONTRADICTING_CLUSTER_PAIRS: Array<[string, string]> = [
  ['fitness_wellness', 'food_retail'],
  ['beauty_personal', 'food_retail'],
  ['fitness_wellness', 'accounting'],
  ['accounting', 'food_retail'],
  ['security_install', 'food_retail'],
  ['security_install', 'beauty_personal'],
];

function slugTokens(value: string): string[] {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

export function isPersonalActorName(value: string | null | undefined): boolean {
  const t = cleanString(value);
  if (!t) return false;
  if (BUSINESS_NAME_MARKERS.test(t)) return false;

  const core = t.replace(PERSON_HONORIFIC_PREFIX, '').trim();
  const tokens = core.split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;

  if (tokens.length === 1 && tokens[0].length <= 15) return true;

  if (
    tokens.length === 2 &&
    tokens.every((tok) => /^[\p{L}'-]+$/u.test(tok) && tok.length <= 20)
  ) {
    return true;
  }

  return false;
}

function detectOfferingClusters(text: string): Set<string> {
  const clusters = new Set<string>();
  for (const [cluster, patterns] of Object.entries(OFFERING_CLUSTERS)) {
    if (patterns.some((re) => re.test(text))) clusters.add(cluster);
  }
  return clusters;
}

export function collectSignalOfferingText(
  signal: ExternalMarketSignal,
  analysis: MarketIntentAnalysis,
  hints: ResolutionHints,
): string {
  const parts: string[] = [signal.rawText ?? ''];
  if (hints.category) parts.push(hints.category);
  for (const item of analysis.has) {
    if (item.label) parts.push(item.label);
  }
  for (const item of analysis.wants) {
    if (item.label) parts.push(item.label);
  }
  if (analysis.businessHint) parts.push(analysis.businessHint);
  return parts.join(' ');
}

function collectCandidateOfferingText(candidate: EntityCandidate): string {
  return [candidate.name, candidate.category, candidate.website, candidate.location]
    .filter(Boolean)
    .join(' ');
}

function evaluateCategoryCompatibility(
  signalText: string,
  candidateText: string,
): 'compatible' | 'contradicted' | 'unknown' {
  const signalClusters = detectOfferingClusters(signalText);
  const candidateClusters = detectOfferingClusters(candidateText);

  if (!signalClusters.size || !candidateClusters.size) return 'unknown';

  for (const [a, b] of CONTRADICTING_CLUSTER_PAIRS) {
    if (
      (signalClusters.has(a) && candidateClusters.has(b)) ||
      (signalClusters.has(b) && candidateClusters.has(a))
    ) {
      return 'contradicted';
    }
  }

  for (const cluster of signalClusters) {
    if (candidateClusters.has(cluster)) return 'compatible';
  }

  return 'unknown';
}

function normalizePhoneDigits(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '');
}

function evaluateNameCompatibility(
  hints: ResolutionHints,
  candidate: EntityCandidate,
): { level: 'strong' | 'moderate' | 'weak' | 'none'; reasons: string[] } {
  const reasons: string[] = [];
  const hintName = cleanString(hints.businessName) ?? cleanString(hints.actorHint);
  const candidateName = cleanString(candidate.name);
  if (!hintName || !candidateName) {
    return { level: 'none', reasons: ['no_name_hint'] };
  }

  const hintTokens = slugTokens(hintName);
  const candidateTokens = slugTokens(candidateName);
  const hintSlug = hintTokens.join('-');
  const candidateSlug = candidateTokens.join('-');

  if (hintSlug && candidateSlug && hintSlug === candidateSlug) {
    reasons.push('exact_name_match');
    return { level: 'strong', reasons };
  }

  if (hints.actorHintKind === 'PERSON' || isPersonalActorName(hints.actorHint)) {
    const personalToken = slugTokens(cleanString(hints.actorHint)?.replace(PERSON_HONORIFIC_PREFIX, '') ?? '')[0];
    if (personalToken && candidateSlug.includes(personalToken) && hintTokens.length <= 2) {
      reasons.push('weak_person_name_only');
      reasons.push('person_name_substring_match');
      return { level: 'weak', reasons };
    }
  }

  const shared = hintTokens.filter((t) => candidateTokens.includes(t));
  if (shared.length >= 2) {
    reasons.push('multi_token_name_overlap');
    return { level: 'moderate', reasons };
  }

  if (hintSlug.length >= 5 && (candidateSlug.includes(hintSlug) || hintSlug.includes(candidateSlug))) {
    reasons.push('partial_name_match');
    return { level: 'moderate', reasons };
  }

  if (shared.length === 1 && hintTokens.length === 1) {
    reasons.push('single_token_partial_match');
    return { level: 'weak', reasons };
  }

  reasons.push('name_mismatch');
  return { level: 'none', reasons };
}

function signalSupportsGeography(hints: ResolutionHints, analysis: MarketIntentAnalysis): boolean {
  return Boolean(
    cleanString(hints.location) ||
      cleanString(analysis.locationHint) ||
      /\b(australia|victoria|melbourne|sydney|usa|uk)\b/i.test(
        [analysis.locationHint, hints.location].filter(Boolean).join(' '),
      ),
  );
}

function candidateImpliesAustralia(candidate: EntityCandidate): boolean {
  const text = [candidate.location, candidate.name, candidate.website].filter(Boolean).join(' ');
  return /\baustralia\b/i.test(text) || /\b(vic|nsw|qld)\b/i.test(text);
}

function evaluateGeographyCompatibility(
  hints: ResolutionHints,
  analysis: MarketIntentAnalysis,
  candidate: EntityCandidate,
): 'compatible' | 'contradicted' | 'unknown' {
  const signalHasGeo = signalSupportsGeography(hints, analysis);
  const candidateGeo = cleanString(candidate.location);
  if (!candidateGeo) return 'unknown';
  if (!signalHasGeo && candidateImpliesAustralia(candidate)) {
    return 'contradicted';
  }
  const hintLoc = cleanString(hints.location) ?? cleanString(analysis.locationHint);
  if (hintLoc && candidateGeo.toLowerCase().includes(hintLoc.toLowerCase().slice(0, 4))) {
    return 'compatible';
  }
  return 'unknown';
}

function evaluatePhoneCompatibility(
  hints: ResolutionHints,
  candidate: EntityCandidate,
): 'match' | 'mismatch' | 'unknown' {
  const hintDigits = normalizePhoneDigits(hints.phoneHint);
  const candidateDigits = normalizePhoneDigits(candidate.phone);
  if (!hintDigits || hintDigits.length < 8) return 'unknown';
  if (!candidateDigits || candidateDigits.length < 8) return 'unknown';
  if (hintDigits === candidateDigits) return 'match';
  if (hintDigits.endsWith(candidateDigits.slice(-8)) || candidateDigits.endsWith(hintDigits.slice(-8))) {
    return 'match';
  }
  return 'mismatch';
}

export function evaluateCandidateCoherence(params: {
  signal: ExternalMarketSignal;
  analysis: MarketIntentAnalysis;
  hints: ResolutionHints;
  candidate: EntityCandidate;
}): CandidateCoherenceReview {
  const { signal, analysis, hints, candidate } = params;
  const reasons: string[] = [];
  const providerCandidateConfidence = candidate.confidence;

  const signalOfferingText = collectSignalOfferingText(signal, analysis, hints);
  const candidateOfferingText = collectCandidateOfferingText(candidate);
  const categoryFit = evaluateCategoryCompatibility(signalOfferingText, candidateOfferingText);
  const nameFit = evaluateNameCompatibility(hints, candidate);
  const geoFit = evaluateGeographyCompatibility(hints, analysis, candidate);
  const phoneFit = evaluatePhoneCompatibility(hints, candidate);

  if (categoryFit === 'contradicted') {
    reasons.push('OFFERING_CATEGORY_CONTRADICTION');
  }
  if (nameFit.reasons.includes('weak_person_name_only')) {
    reasons.push('PERSON_NAME_ONLY_IDENTITY_HINT');
  }
  if (nameFit.level === 'weak' || nameFit.level === 'none') {
    reasons.push('WEAK_NAME_MATCH');
  }
  if (geoFit === 'contradicted') {
    reasons.push('GEOGRAPHY_UNSUPPORTED_BY_SIGNAL');
  }
  if (phoneFit === 'mismatch') {
    reasons.push('PHONE_CONFLICT');
  }

  const strongPositive =
    phoneFit === 'match' ||
    (nameFit.level === 'strong' && categoryFit !== 'contradicted') ||
    (nameFit.level === 'moderate' &&
      categoryFit === 'compatible' &&
      (geoFit === 'compatible' || geoFit === 'unknown'));

  if (phoneFit === 'mismatch') {
    return {
      candidate: {
        ...candidate,
        providerCandidateConfidence,
        identityMatchConfidence: 0.05,
        coherenceDecision: 'CONTRADICTED',
        coherenceReasons: reasons,
        candidateGeography: candidate.location ?? null,
      },
      decision: 'CONTRADICTED',
      identityMatchConfidence: 0.05,
      providerCandidateConfidence,
      reasons,
    };
  }

  if (categoryFit === 'contradicted') {
    const identityMatchConfidence =
      nameFit.level === 'strong' && phoneFit === 'match' ? 0.35 : 0.08;
    return {
      candidate: {
        ...candidate,
        providerCandidateConfidence,
        identityMatchConfidence,
        coherenceDecision: 'CONTRADICTED',
        coherenceReasons: reasons,
        candidateGeography: candidate.location ?? null,
      },
      decision: 'CONTRADICTED',
      identityMatchConfidence,
      providerCandidateConfidence,
      reasons,
    };
  }

  if (strongPositive) {
    const identityMatchConfidence = Math.min(
      1,
      Math.max(
        0.72,
        candidate.confidence,
        phoneFit === 'match' ? 0.85 : 0,
        nameFit.level === 'strong' ? 0.8 : 0,
      ),
    );
    return {
      candidate: {
        ...candidate,
        providerCandidateConfidence,
        identityMatchConfidence,
        coherenceDecision: 'MATCH',
        coherenceReasons: reasons.length ? reasons : ['coherent_identity_evidence'],
        candidateGeography: candidate.location ?? null,
      },
      decision: 'MATCH',
      identityMatchConfidence,
      providerCandidateConfidence,
      reasons: reasons.length ? reasons : ['coherent_identity_evidence'],
    };
  }

  if (
    nameFit.level === 'moderate' &&
    categoryFit !== 'contradicted' &&
    geoFit !== 'contradicted'
  ) {
    const identityMatchConfidence = Math.min(0.7, Math.max(0.45, candidate.confidence * 0.85));
    return {
      candidate: {
        ...candidate,
        providerCandidateConfidence,
        identityMatchConfidence,
        coherenceDecision: 'POSSIBLE_MATCH',
        coherenceReasons: reasons,
        candidateGeography: candidate.location ?? null,
      },
      decision: 'POSSIBLE_MATCH',
      identityMatchConfidence,
      providerCandidateConfidence,
      reasons,
    };
  }

  if (
    (nameFit.level === 'weak' || hints.actorHintKind === 'PERSON') &&
    categoryFit === 'unknown' &&
    geoFit !== 'contradicted'
  ) {
    return {
      candidate: {
        ...candidate,
        providerCandidateConfidence,
        identityMatchConfidence: Math.min(0.35, candidate.confidence * 0.5),
        coherenceDecision: 'INSUFFICIENT_EVIDENCE',
        coherenceReasons: reasons.length ? reasons : ['insufficient_identity_evidence'],
        candidateGeography: candidate.location ?? null,
      },
      decision: 'INSUFFICIENT_EVIDENCE',
      identityMatchConfidence: Math.min(0.35, candidate.confidence * 0.5),
      providerCandidateConfidence,
      reasons: reasons.length ? reasons : ['insufficient_identity_evidence'],
    };
  }

  return {
    candidate: {
      ...candidate,
      providerCandidateConfidence,
      identityMatchConfidence: 0.1,
      coherenceDecision: 'CONTRADICTED',
      coherenceReasons: reasons.length ? reasons : ['identity_not_coherent'],
      candidateGeography: candidate.location ?? null,
    },
    decision: 'CONTRADICTED',
    identityMatchConfidence: 0.1,
    providerCandidateConfidence,
    reasons: reasons.length ? reasons : ['identity_not_coherent'],
  };
}

export function applyCandidateCoherenceGate(params: {
  signal: ExternalMarketSignal;
  analysis: MarketIntentAnalysis;
  hints: ResolutionHints;
  candidates: EntityCandidate[];
}): {
  acceptedCandidates: EntityCandidate[];
  rejectedCandidates: EntityCandidate[];
  reviews: CandidateCoherenceReview[];
} {
  const reviews = params.candidates.map((candidate) =>
    evaluateCandidateCoherence({
      signal: params.signal,
      analysis: params.analysis,
      hints: params.hints,
      candidate,
    }),
  );

  const acceptedCandidates = reviews
    .filter((r) => r.decision === 'MATCH' || r.decision === 'POSSIBLE_MATCH')
    .map((r) => r.candidate)
    .sort((a, b) => (b.identityMatchConfidence ?? 0) - (a.identityMatchConfidence ?? 0));

  const rejectedCandidates = reviews
    .filter((r) => r.decision === 'CONTRADICTED' || r.decision === 'INSUFFICIENT_EVIDENCE')
    .map((r) => r.candidate);

  return { acceptedCandidates, rejectedCandidates, reviews };
}
