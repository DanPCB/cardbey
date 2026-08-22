import { randomUUID } from 'node:crypto';
import type { BusinessCandidateRecord } from '../businessCandidate/types.js';
import { slugify } from '../../utils/slug.js';
import {
  getPrebuiltDraftById,
  getPrebuiltDraftByCandidateId,
  savePrebuiltDraft,
} from './draftRepository.js';
import { getPreviewTokenRecord } from './previewTokenService.js';
import type {
  ConversionPlan,
  EvidenceClass,
  PrebuiltAssetDraft,
  PrebuiltFieldEvidence,
  PrebuiltOfferingDraft,
  PrebuiltStoreDraft,
} from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function buildDraftSlug(candidate: BusinessCandidateRecord): string {
  const base =
    slugify(`${candidate.name ?? 'business'}-${candidate.suburb ?? candidate.city ?? ''}`) || 'business';
  return `${base}-${candidate.id.replace(/-/g, '').slice(-6).toLowerCase()}`;
}

function toEvidence(
  fieldPath: string,
  value: unknown,
  source: string,
  evidenceClass: EvidenceClass = 'SOURCE_CONFIRMED',
  extras: Partial<PrebuiltFieldEvidence> = {},
): PrebuiltFieldEvidence {
  return {
    id: randomUUID(),
    fieldPath,
    evidenceClass,
    source,
    valueSummary:
      value == null
        ? null
        : typeof value === 'string'
          ? value
          : JSON.stringify(value),
    ownerAccepted: extras.ownerAccepted,
    blockedReason: extras.blockedReason ?? null,
    conflictSummary: extras.conflictSummary ?? null,
    updatedAt: nowIso(),
  };
}

function buildConfirmedOfferings(candidate: BusinessCandidateRecord): PrebuiltOfferingDraft[] {
  return candidate.fetchedServices
    .map((service, index) => {
      const title =
        typeof service.name === 'string'
          ? service.name
          : typeof service.title === 'string'
            ? service.title
            : null;
      if (!title) return null;
      return {
        id: `offering_confirmed_${index + 1}`,
        title,
        description: typeof service.description === 'string' ? service.description : null,
        priceText: null,
        evidenceClass: 'SOURCE_CONFIRMED' as const,
        ownerAccepted: true,
        source: 'candidate.fetchedServices',
        included: true,
      };
    })
    .filter((value): value is PrebuiltOfferingDraft => value !== null);
}

function buildAiSuggestions(candidate: BusinessCandidateRecord): PrebuiltOfferingDraft[] {
  const businessType = candidate.category ?? candidate.businessType;
  if (!businessType) return [];
  return [
    {
      id: 'offering_ai_1',
      title: `${titleCase(businessType)} offering`,
      description: 'Suggested draft only. Owner confirmation required before conversion.',
      priceText: null,
      evidenceClass: 'AI_SUGGESTED',
      ownerAccepted: false,
      source: 'ai_suggestion_stub',
      included: false,
    },
  ];
}

function buildAssets(candidate: BusinessCandidateRecord): PrebuiltAssetDraft[] {
  if (!candidate.heroImageUrl) return [];
  return [
    {
      id: 'asset_hero_1',
      kind: 'hero',
      url: candidate.heroImageUrl,
      source: candidate.heroImageSource ?? 'candidate.heroImageUrl',
      evidenceClass: 'SOURCE_CONFIRMED',
      ownerAccepted: true,
      altText: candidate.name ? `${candidate.name} hero image` : 'Business hero image',
      isPrimary: true,
    },
  ];
}

function buildFieldEvidence(candidate: BusinessCandidateRecord): PrebuiltFieldEvidence[] {
  const rows: PrebuiltFieldEvidence[] = [
    toEvidence('businessName', candidate.name, 'candidate.name'),
    toEvidence('category', candidate.category ?? candidate.businessType, 'candidate.category'),
    toEvidence('address', candidate.address, 'candidate.address'),
    toEvidence('locality', candidate.suburb ?? candidate.city, 'candidate.locality'),
    toEvidence('countryCode', candidate.country, 'candidate.country'),
    toEvidence('publicPhone', candidate.phone, 'candidate.phone'),
    toEvidence('officialWebsite', candidate.website, 'candidate.website'),
    toEvidence('officialSocialLinks', candidate.socialLinks, 'candidate.socialLinks'),
  ];

  if (candidate.openingHours) {
    rows.push(toEvidence('openingHours', candidate.openingHours, 'candidate.openingHours'));
  }
  if (candidate.description) {
    rows.push(toEvidence('description', candidate.description, 'candidate.description'));
  }
  if (candidate.heroImageUrl) {
    rows.push(toEvidence('assets.hero', candidate.heroImageUrl, 'candidate.heroImageUrl'));
  }
  if (candidate.storeId) {
    rows.push(
      toEvidence('candidate.storeId', candidate.storeId, 'candidate.storeId', 'BLOCKED', {
        ownerAccepted: false,
        blockedReason: 'Candidate already linked to an existing canonical store',
      }),
    );
  }
  return rows.filter((row) => row.valueSummary !== null || row.evidenceClass === 'BLOCKED');
}

function derivePublicFeedExcluded(_candidate: BusinessCandidateRecord): boolean {
  // Private prebuilt drafts must never appear in public store feed/search.
  void _candidate;
  return true;
}

export async function generateDraftFromCandidate(
  candidate: BusinessCandidateRecord,
  options: { allowAiSuggestions?: boolean } = {},
): Promise<PrebuiltStoreDraft> {
  const existing = await getPrebuiltDraftByCandidateId(candidate.id);
  const now = nowIso();
  const confirmedOfferings = buildConfirmedOfferings(candidate);
  const aiSuggestions = options.allowAiSuggestions ? buildAiSuggestions(candidate) : [];
  const fieldEvidence = buildFieldEvidence(candidate);
  const blocked = fieldEvidence.some((row) => row.evidenceClass === 'BLOCKED');
  const nextStatus = blocked ? 'BLOCKED' : existing?.status ?? 'READY_FOR_REVIEW';

  const next: PrebuiltStoreDraft = {
    id: existing?.id ?? randomUUID(),
    candidateId: candidate.id,
    cardId: existing?.cardId ?? null,
    seedId: candidate.seedId ?? null,
    status: nextStatus,
    businessName: candidate.name?.trim() || 'Unnamed business',
    slug: existing?.slug ?? buildDraftSlug(candidate),
    category: candidate.category ?? candidate.businessType,
    address: candidate.address,
    locality: candidate.suburb ?? candidate.city,
    countryCode: candidate.country,
    publicPhone: candidate.phone,
    officialWebsite: candidate.website,
    officialSocialLinks: candidate.socialLinks,
    openingHours: candidate.openingHours ?? null,
    description: candidate.description ?? null,
    offerings: [...confirmedOfferings, ...aiSuggestions],
    assets: buildAssets(candidate),
    fieldEvidence,
    publicFeedExcluded: derivePublicFeedExcluded(candidate),
    claimStartedAt: existing?.claimStartedAt ?? null,
    claimVerifiedAt: existing?.claimVerifiedAt ?? null,
    convertedAt: existing?.convertedAt ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  return savePrebuiltDraft(next);
}

export async function getDraftByPreviewToken(token: string): Promise<PrebuiltStoreDraft | null> {
  const record = await getPreviewTokenRecord(token);
  if (!record) return null;
  return getPrebuiltDraftById(record.draftId);
}

export async function markClaimStarted(draftId: string): Promise<PrebuiltStoreDraft> {
  const draft = await getPrebuiltDraftById(draftId);
  if (!draft) {
    throw new Error(`Prebuilt draft not found: ${draftId}`);
  }
  if (draft.status === 'CLAIM_STARTED' || draft.status === 'CLAIM_VERIFIED' || draft.status === 'CONVERTED') {
    return draft;
  }
  const now = nowIso();
  return savePrebuiltDraft({
    ...draft,
    status: 'CLAIM_STARTED',
    claimStartedAt: draft.claimStartedAt ?? now,
    updatedAt: now,
  });
}

export async function markClaimVerified(draftId: string): Promise<PrebuiltStoreDraft> {
  const draft = await getPrebuiltDraftById(draftId);
  if (!draft) {
    throw new Error(`Prebuilt draft not found: ${draftId}`);
  }
  if (draft.status === 'CLAIM_VERIFIED' || draft.status === 'CONVERTED') {
    return draft;
  }
  const now = nowIso();
  return savePrebuiltDraft({
    ...draft,
    status: 'CLAIM_VERIFIED',
    claimStartedAt: draft.claimStartedAt ?? now,
    claimVerifiedAt: draft.claimVerifiedAt ?? now,
    updatedAt: now,
  });
}

export async function markConverted(draftId: string): Promise<PrebuiltStoreDraft> {
  const draft = await getPrebuiltDraftById(draftId);
  if (!draft) {
    throw new Error(`Prebuilt draft not found: ${draftId}`);
  }
  if (draft.status === 'CONVERTED') {
    return draft;
  }
  const now = nowIso();
  return savePrebuiltDraft({
    ...draft,
    status: 'CONVERTED',
    convertedAt: draft.convertedAt ?? now,
    updatedAt: now,
  });
}

export function assertConversionAllowed(params: {
  draft: PrebuiltStoreDraft;
  candidate: BusinessCandidateRecord;
  claimVerified: boolean;
}): void {
  const { draft, candidate, claimVerified } = params;
  if (!claimVerified) {
    throw new Error('Verified claim is required before conversion');
  }
  if (candidate.storeId) {
    throw new Error('Candidate already linked to a canonical store');
  }
  if (draft.status === 'BLOCKED' || draft.status === 'WITHDRAWN' || draft.status === 'EXPIRED') {
    throw new Error(`Draft cannot convert from ${draft.status}`);
  }
  const unresolvedEvidence = draft.fieldEvidence.filter(
    (row) =>
      (row.evidenceClass === 'BLOCKED' || row.evidenceClass === 'CONFLICTING') &&
      row.ownerAccepted !== true,
  );
  if (unresolvedEvidence.length > 0) {
    throw new Error('Draft has unresolved blocked or conflicting fields');
  }
  const unacceptedAiOfferings = draft.offerings.filter(
    (row) => row.evidenceClass === 'AI_SUGGESTED' && row.ownerAccepted !== true,
  );
  if (unacceptedAiOfferings.length > 0) {
    throw new Error('AI suggested offerings require explicit owner acceptance');
  }
  const unacceptedAiAssets = draft.assets.filter(
    (row) => row.evidenceClass === 'AI_SUGGESTED' && row.ownerAccepted !== true,
  );
  if (unacceptedAiAssets.length > 0) {
    throw new Error('AI suggested assets require explicit owner acceptance');
  }
}

export function buildConversionPlan(params: {
  draft: PrebuiltStoreDraft;
  candidate: BusinessCandidateRecord;
  claimVerified: boolean;
}): ConversionPlan {
  assertConversionAllowed(params);
  const { draft, candidate } = params;
  return {
    mode: 'stub',
    draftId: draft.id,
    candidateId: candidate.id,
    slug: draft.slug,
    businessName: draft.businessName,
    category: draft.category,
    claimVerified: true,
    acceptedFields: {
      businessName: draft.businessName,
      category: draft.category,
      address: draft.address,
      locality: draft.locality,
      countryCode: draft.countryCode,
      publicPhone: draft.publicPhone ?? null,
      officialWebsite: draft.officialWebsite ?? null,
      officialSocialLinks: draft.officialSocialLinks ?? [],
      openingHours: draft.openingHours ?? null,
      description: draft.description ?? null,
    },
    acceptedOfferings: draft.offerings
      .filter((row) => row.included && row.evidenceClass !== 'BLOCKED')
      .filter((row) => row.evidenceClass !== 'AI_SUGGESTED' || row.ownerAccepted === true)
      .map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description ?? null,
        priceText: row.priceText ?? null,
        source: row.source,
      })),
    acceptedAssets: draft.assets
      .filter((row) => row.evidenceClass !== 'BLOCKED')
      .filter((row) => row.evidenceClass !== 'AI_SUGGESTED' || row.ownerAccepted === true)
      .map((row) => ({
        id: row.id,
        kind: row.kind,
        url: row.url,
        source: row.source,
      })),
    createdAt: nowIso(),
  };
}

export function convertToCanonicalStore(params: {
  draft: PrebuiltStoreDraft;
  candidate: BusinessCandidateRecord;
  claimVerified: boolean;
}): ConversionPlan {
  return buildConversionPlan(params);
}
