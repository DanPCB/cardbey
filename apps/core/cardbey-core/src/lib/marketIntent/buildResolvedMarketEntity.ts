import { randomUUID } from 'node:crypto';
import { websiteHost } from '../businessDiscovery/businessDataNormalizer.runtime.js';
import type {
  EntityCandidate,
  EntityEvidence,
  ResolutionStatus,
  ResolvedMarketEntity,
} from './entityTypes.js';
import type { ResolutionHints } from './entityTypes.js';
import type { MarketEntityKind } from './entityTypes.js';

const STRONG_THRESHOLD = 0.72;
const PLAUSIBLE_THRESHOLD = 0.45;
const AMBIGUITY_GAP = 0.12;

export type BusinessEntityResolverResult = {
  candidates: EntityCandidate[];
  selectedCandidate?: EntityCandidate | null;
  confidence: number;
  requiresOwnerConfirmation: boolean;
  resolutionNotes: string[];
};

export function mapResolverCandidate(raw: {
  entityId: string;
  name: string;
  website?: string | null;
  location?: string | null;
  phone?: string | null;
  placeId?: string | null;
  confidence: number;
  matchReasons?: string[];
  source?: string;
}): EntityCandidate {
  return {
    entityId: raw.entityId,
    name: raw.name,
    website: raw.website ?? null,
    location: raw.location ?? null,
    phone: raw.phone ?? null,
    placeId: raw.placeId ?? null,
    confidence: raw.confidence,
    matchReasons: raw.matchReasons ?? [],
    source: raw.source ?? 'unknown',
  };
}

export function deriveResolutionStatus(
  candidates: EntityCandidate[],
  hints: ResolutionHints,
  entityKind: MarketEntityKind,
): { status: ResolutionStatus; confidence: number; notes: string[] } {
  const notes: string[] = [];

  if (entityKind !== 'BUSINESS') {
    return { status: 'NOT_APPLICABLE', confidence: 0, notes: ['Entity kind is not a researchable business'] };
  }

  const top = candidates[0];
  const second = candidates[1];

  if (!hints.businessName || hints.businessName.length < 2) {
    notes.push('No business name available for resolution');
    return { status: 'UNRESOLVED', confidence: 0, notes };
  }

  if (/^abc$/i.test(hints.businessName.trim()) || hints.businessName.trim().length <= 3) {
    notes.push('Business name too generic for confident resolution');
    if (candidates.length > 1) {
      return { status: 'AMBIGUOUS', confidence: top?.confidence ?? 0.2, notes };
    }
    return { status: 'AMBIGUOUS', confidence: 0.25, notes };
  }

  if (!candidates.length) {
    if (hints.websiteHint) {
      notes.push('Website hint only — partial resolution without Places corroboration');
      return { status: 'PARTIALLY_RESOLVED', confidence: 0.55, notes };
    }
    notes.push('No public entity candidates found');
    return { status: 'UNRESOLVED', confidence: 0, notes };
  }

  const ambiguous =
    candidates.length > 1 &&
    second &&
    top &&
    top.confidence >= PLAUSIBLE_THRESHOLD &&
    second.confidence >= PLAUSIBLE_THRESHOLD &&
    top.confidence - second.confidence < AMBIGUITY_GAP;

  if (ambiguous) {
    notes.push('Multiple plausible businesses — ambiguous resolution');
    return { status: 'AMBIGUOUS', confidence: top.confidence, notes };
  }

  if (top.confidence >= STRONG_THRESHOLD && candidates.length === 1) {
    notes.push('Single strong entity match');
    return { status: 'RESOLVED', confidence: top.confidence, notes };
  }

  if (top.confidence >= PLAUSIBLE_THRESHOLD) {
    notes.push('Plausible match with corroborating evidence');
    return { status: 'PARTIALLY_RESOLVED', confidence: top.confidence, notes };
  }

  notes.push('Candidates below confidence threshold');
  return { status: 'UNRESOLVED', confidence: top.confidence, notes };
}

export function buildResolvedMarketEntity(params: {
  signalId: string;
  entityKind: MarketEntityKind;
  hints: ResolutionHints;
  resolverResult?: BusinessEntityResolverResult | null;
  status: ResolutionStatus;
  confidence: number;
  notes: string[];
}): ResolvedMarketEntity {
  const candidates = params.resolverResult?.candidates ?? [];
  const selected = params.resolverResult?.selectedCandidate ?? candidates[0] ?? null;

  const canonicalName =
    selected?.name ?? params.hints.businessName ?? null;
  const website = selected?.website ?? params.hints.websiteHint ?? null;
  const location = selected?.location ?? params.hints.location ?? null;

  const domains: string[] = [];
  const host = websiteHost(website ?? '');
  if (host) domains.push(host);

  const socialProfiles: Array<{ platform: string; url: string }> = [];
  if (params.hints.socialProfileUrl) {
    const sh = websiteHost(params.hints.socialProfileUrl);
    socialProfiles.push({
      platform: sh?.split('.')[0] ?? 'social',
      url: params.hints.socialProfileUrl,
    });
  }

  const externalIdentifiers: Array<{ type: string; value: string }> = [];
  if (selected?.placeId) {
    externalIdentifiers.push({ type: 'google_place_id', value: selected.placeId });
  }

  const evidence: EntityEvidence[] = [];
  if (params.hints.businessName) {
    evidence.push({
      statement: `Business name hint: ${params.hints.businessName}`,
      span: params.hints.businessName,
      basis: 'FACT',
      confidence: 0.85,
      source: 'g1_hint',
    });
  }
  for (const c of candidates.slice(0, 3)) {
    evidence.push({
      statement: `Candidate "${c.name}" from ${c.source} (confidence ${c.confidence.toFixed(2)})`,
      basis: c.confidence >= STRONG_THRESHOLD ? 'FACT' : 'INFERENCE',
      confidence: c.confidence,
      source: c.source,
    });
  }

  return {
    signalId: params.signalId,
    resolvedEntityRef: `mktent_${randomUUID().slice(0, 12)}`,
    entityKind: params.entityKind,
    resolutionStatus: params.status,
    confidence: params.confidence,
    canonicalName,
    website,
    domains,
    socialProfiles,
    location,
    externalIdentifiers,
    evidence,
    candidateEntities: candidates,
    selectedCandidateId: selected?.entityId ?? null,
    resolutionNotes: [
      ...params.notes,
      ...(params.resolverResult?.resolutionNotes ?? []),
    ],
  };
}

export function shouldProceedToResearch(
  entityKind: MarketEntityKind,
  status: ResolutionStatus,
): boolean {
  if (!isBusinessResearchApplicable(entityKind)) return false;
  return status === 'RESOLVED' || status === 'PARTIALLY_RESOLVED';
}

function isBusinessResearchApplicable(entityKind: MarketEntityKind): boolean {
  return entityKind === 'BUSINESS';
}

export { STRONG_THRESHOLD, PLAUSIBLE_THRESHOLD };
