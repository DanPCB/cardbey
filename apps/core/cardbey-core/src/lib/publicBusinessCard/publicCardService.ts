import { randomUUID } from 'node:crypto';
import type { BusinessCandidateRecord } from '../businessCandidate/types.js';
import { slugify } from '../../utils/slug.js';
import {
  createCorrectionReport,
  getPublicBusinessCardByCandidateId,
  getPublicBusinessCardById,
  getPublicBusinessCardBySlug,
  savePublicBusinessCard,
} from './cardRepository.js';
import type {
  CorrectionReport,
  PublicBusinessCardDto,
  PublicBusinessCardRecord,
  PublicCardStatus,
} from './types.js';
import { PUBLIC_CARD_DISCLOSURE } from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function buildCardSlug(candidate: BusinessCandidateRecord): string {
  const base = slugify(`${candidate.name ?? 'business'}-${candidate.suburb ?? candidate.city ?? ''}`) || 'business';
  return `${base}-${candidate.id.replace(/-/g, '').slice(-6).toLowerCase()}`;
}

function deriveClaimEligibility(
  candidate: BusinessCandidateRecord,
  status: PublicCardStatus,
): PublicBusinessCardRecord['claimEligibility'] {
  if (status === 'WITHDRAWN') {
    return { eligible: false, reason: 'withdrawn' };
  }
  if (status === 'SUPERSEDED_BY_CLAIMED_STORE') {
    return { eligible: false, reason: 'superseded' };
  }
  if (candidate.status === 'CLAIMABLE' || candidate.status === 'VERIFIED') {
    return {
      eligible: true,
      reason: candidate.status === 'VERIFIED' ? 'verified_claimable' : 'qa_approved',
    };
  }
  return { eligible: false, reason: 'not_eligible' };
}

function redactReporterContact(contact?: string | null): string | null {
  const trimmed = String(contact ?? '').trim();
  if (!trimmed) return null;
  if (trimmed.includes('@')) {
    const [local, domain = 'redacted'] = trimmed.split('@');
    const visible = local.slice(0, 1) || 'x';
    return `${visible}***@${domain.toLowerCase()}`;
  }
  const digits = trimmed.replace(/\D+/g, '');
  if (digits.length >= 4) {
    return `***${digits.slice(-4)}`;
  }
  return '[redacted]';
}

function toCardRecord(
  candidate: BusinessCandidateRecord,
  existing?: PublicBusinessCardRecord | null,
): PublicBusinessCardRecord {
  const now = nowIso();
  const persistedStatus =
    existing?.status === 'PUBLISHED_UNCLAIMED' ||
    existing?.status === 'WITHDRAWN' ||
    existing?.status === 'SUPERSEDED_BY_CLAIMED_STORE'
      ? existing.status
      : 'CARD_ELIGIBLE';

  return {
    id: existing?.id ?? randomUUID(),
    slug: existing?.slug ?? buildCardSlug(candidate),
    candidateId: candidate.id,
    seedId: candidate.seedId,
    status: persistedStatus,
    businessName: candidate.name?.trim() || 'Unnamed business',
    category: candidate.category ?? candidate.businessType,
    address: candidate.address,
    locality: candidate.suburb ?? candidate.city,
    countryCode: candidate.country,
    coordinates: candidate.coordinates,
    publicPhone: candidate.phone,
    officialWebsite: candidate.website,
    officialSocialLinks: candidate.socialLinks,
    openingHours: candidate.openingHours ?? null,
    imageUrl: candidate.heroImageUrl ?? null,
    imageSource: candidate.heroImageSource ?? null,
    disclosure: PUBLIC_CARD_DISCLOSURE,
    claimEligibility: deriveClaimEligibility(candidate, persistedStatus),
    publishedAt: existing?.publishedAt ?? null,
    withdrawnAt:
      persistedStatus === 'WITHDRAWN' || persistedStatus === 'SUPERSEDED_BY_CLAIMED_STORE'
        ? existing?.withdrawnAt ?? now
        : null,
    supersededStoreId:
      persistedStatus === 'SUPERSEDED_BY_CLAIMED_STORE' ? existing?.supersededStoreId ?? null : null,
    noindex:
      persistedStatus === 'WITHDRAWN' || persistedStatus === 'SUPERSEDED_BY_CLAIMED_STORE',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

function assertEligibleCandidate(candidate: BusinessCandidateRecord, qaApproved = false): void {
  if (candidate.status === 'CLAIMABLE' || candidate.status === 'VERIFIED') {
    return;
  }
  if (qaApproved) {
    return;
  }
  throw new Error(
    `Candidate ${candidate.id} is ${candidate.status}; public cards require CLAIMABLE/VERIFIED or qaApproved=true`,
  );
}

export async function prepareCardFromCandidate(
  candidate: BusinessCandidateRecord,
  options: { qaApproved?: boolean } = {},
): Promise<PublicBusinessCardRecord> {
  assertEligibleCandidate(candidate, options.qaApproved === true);
  const existing = await getPublicBusinessCardByCandidateId(candidate.id);
  const next = toCardRecord(candidate, existing);
  return savePublicBusinessCard(next);
}

export async function publishCard(cardId: string, actorId: string): Promise<PublicBusinessCardRecord> {
  void actorId;
  const card = await getPublicBusinessCardById(cardId);
  if (!card) {
    throw new Error(`Public card not found: ${cardId}`);
  }
  if (card.status === 'PUBLISHED_UNCLAIMED') {
    return card;
  }
  if (card.status !== 'CARD_ELIGIBLE') {
    throw new Error(`Cannot publish card from ${card.status}`);
  }
  const now = nowIso();
  return savePublicBusinessCard({
    ...card,
    status: 'PUBLISHED_UNCLAIMED',
    publishedAt: card.publishedAt ?? now,
    // Indexing is controlled by ENABLE_PUBLIC_UNCLAIMED_CARD_INDEXING_V1 at serve time.
    noindex: true,
    updatedAt: now,
    claimEligibility: { ...card.claimEligibility, eligible: true },
    disclosure: PUBLIC_CARD_DISCLOSURE,
  });
}

export async function withdrawCard(cardId: string, actorId: string): Promise<PublicBusinessCardRecord> {
  void actorId;
  const card = await getPublicBusinessCardById(cardId);
  if (!card) {
    throw new Error(`Public card not found: ${cardId}`);
  }
  if (card.status === 'WITHDRAWN') {
    return card;
  }
  const now = nowIso();
  return savePublicBusinessCard({
    ...card,
    status: 'WITHDRAWN',
    withdrawnAt: card.withdrawnAt ?? now,
    noindex: true,
    updatedAt: now,
    claimEligibility: { eligible: false, reason: 'withdrawn' },
  });
}

export async function supersedeCard(
  cardId: string,
  storeId: string,
): Promise<PublicBusinessCardRecord> {
  const card = await getPublicBusinessCardById(cardId);
  if (!card) {
    throw new Error(`Public card not found: ${cardId}`);
  }
  if (card.status === 'SUPERSEDED_BY_CLAIMED_STORE' && card.supersededStoreId === storeId) {
    return card;
  }
  const now = nowIso();
  return savePublicBusinessCard({
    ...card,
    status: 'SUPERSEDED_BY_CLAIMED_STORE',
    supersededStoreId: storeId,
    withdrawnAt: card.withdrawnAt ?? now,
    noindex: true,
    updatedAt: now,
    claimEligibility: { eligible: false, reason: 'superseded' },
  });
}

export async function getPublicCardDto(slug: string): Promise<PublicBusinessCardDto | null> {
  const card = await getPublicBusinessCardBySlug(slug);
  if (!card) return null;
  if (
    card.status !== 'PUBLISHED_UNCLAIMED' &&
    card.status !== 'CORRECTION_PENDING'
  ) {
    return null;
  }
  return {
    slug: card.slug,
    status: card.status,
    businessName: card.businessName,
    category: card.category,
    address: card.address,
    locality: card.locality,
    countryCode: card.countryCode,
    coordinates: card.coordinates,
    publicPhone: card.publicPhone,
    officialWebsite: card.officialWebsite,
    officialSocialLinks: card.officialSocialLinks,
    openingHours: card.openingHours,
    imageUrl: card.imageUrl,
    imageSource: card.imageSource,
    disclosure: PUBLIC_CARD_DISCLOSURE,
    claimEligibility: card.claimEligibility,
    publishedAt: card.publishedAt,
  };
}

export async function submitCorrection(
  slug: string,
  message: string,
  reporterContact?: string | null,
): Promise<CorrectionReport> {
  const card = await getPublicBusinessCardBySlug(slug);
  if (!card) {
    throw new Error(`Public card not found for slug: ${slug}`);
  }
  const trimmedMessage = String(message ?? '').trim();
  if (!trimmedMessage) {
    throw new Error('Correction message is required');
  }
  const report = await createCorrectionReport({
    cardId: card.id,
    message: trimmedMessage,
    reporterContactRedacted: redactReporterContact(reporterContact),
    status: 'OPEN',
    reviewedAt: null,
    reviewedBy: null,
    resolutionNote: null,
  });
  if (card.status === 'PUBLISHED_UNCLAIMED') {
    await savePublicBusinessCard({
      ...card,
      status: 'CORRECTION_PENDING',
      updatedAt: nowIso(),
    });
  }
  return report;
}
