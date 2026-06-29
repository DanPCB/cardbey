/**
 * Business Health Score — evidence-backed readiness pillars for discovered businesses.
 * Never fabricates reviews, rankings, or post-claim commerce activation.
 */

import type { BusinessCandidateRecord } from '../types.js';
import type { VisibilityScores } from './types.js';
import type { SelectedCandidateMedia } from '../media/types.js';

export type MetricEvidenceStatus =
  | 'evidence_found'
  | 'not_found'
  | 'insufficient_evidence'
  | 'post_claim';

export interface HealthSubMetric {
  key: string;
  label: string;
  score: number | null;
  status: MetricEvidenceStatus;
  detail: string;
}

export interface HealthPillar {
  key: string;
  label: string;
  score: number | null;
  subMetrics: HealthSubMetric[];
}

export interface BusinessHealthScore {
  overallReadiness: number;
  confidenceLevel: VisibilityScores['confidenceLevel'];
  pillars: HealthPillar[];
}

export interface HealthScoreSignals {
  hasName: boolean;
  hasAddress: boolean;
  hasPhone: boolean;
  hasEmail: boolean;
  hasWebsite: boolean;
  hasCoordinates: boolean;
  hasCategory: boolean;
  hasLogo: boolean;
  hasBusinessImages: boolean;
  hasRepresentativeImagesOnly: boolean;
  hasDescription: boolean;
  hasServices: boolean;
  hasProducts: boolean;
  hasHours: boolean;
  hasReviews: boolean;
  reviewCount: number | null;
  ownerVerified: boolean;
  dataConsistencyScore: number;
  hasSocial: boolean;
  hasDigitalAssets: boolean;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function avgScores(scores: Array<number | null>): number | null {
  const usable = scores.filter((s): s is number => s != null);
  if (!usable.length) return null;
  return clamp(usable.reduce((a, b) => a + b, 0) / usable.length);
}

function metric(
  key: string,
  label: string,
  score: number | null,
  status: MetricEvidenceStatus,
  detail: string,
): HealthSubMetric {
  return { key, label, score, status, detail };
}

function hasReviewEvidence(candidate: BusinessCandidateRecord): {
  hasReviews: boolean;
  reviewCount: number | null;
} {
  const raw = candidate.rawSourceJson;
  if (!raw || typeof raw !== 'object') {
    return { hasReviews: false, reviewCount: null };
  }

  const r = raw as Record<string, unknown>;
  const count =
    typeof r.user_ratings_total === 'number'
      ? r.user_ratings_total
      : typeof r.reviewCount === 'number'
        ? r.reviewCount
        : null;
  const rating = typeof r.rating === 'number' ? r.rating : null;
  const hasReviews = (count != null && count > 0) || rating != null;
  return { hasReviews, reviewCount: count };
}

function scoreDataConsistency(candidate: BusinessCandidateRecord): number {
  let matches = 0;
  let checks = 0;

  const raw = candidate.rawSourceJson;
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    if (typeof r.name === 'string' && candidate.name) {
      checks += 1;
      if (r.name.toLowerCase().includes(candidate.name.toLowerCase().slice(0, 6))) matches += 1;
    }
    if (typeof r.formatted_address === 'string' && candidate.address) {
      checks += 1;
      if (candidate.address.toLowerCase().includes(String(r.formatted_address).toLowerCase().slice(0, 8))) {
        matches += 1;
      }
    }
  }

  if (candidate.name && candidate.businessType) {
    checks += 1;
    matches += 1;
  }
  if (candidate.phone && candidate.website) {
    checks += 1;
    matches += 1;
  }

  if (!checks) return candidate.confidenceScore >= 0.6 ? 70 : 40;
  return clamp((matches / checks) * 100);
}

export function buildHealthScoreSignals(
  candidate: BusinessCandidateRecord,
  media: SelectedCandidateMedia | null,
): HealthScoreSignals {
  const raw = candidate.rawSourceJson;
  const hasHours = Boolean(
    raw && typeof raw === 'object' && ('opening_hours' in raw || 'openingHours' in raw),
  );
  const { hasReviews, reviewCount } = hasReviewEvidence(candidate);

  const menuItems = candidate.fetchedMenu
    ? Array.isArray((candidate.fetchedMenu as { items?: unknown }).items)
      ? (candidate.fetchedMenu as { items: unknown[] }).items
      : Object.keys(candidate.fetchedMenu).length > 0
        ? [candidate.fetchedMenu]
        : []
    : [];

  const hasProducts = menuItems.length > 0;

  const ownerVerified =
    candidate.ownerMatched ||
    candidate.status === 'VERIFIED' ||
    candidate.status === 'CLAIM_PENDING';

  const hasBusinessImages = Boolean(
    media?.heroImage && !media.representativeDisclosureRequired,
  );
  const hasRepresentativeImagesOnly = Boolean(
    media?.representativeDisclosureRequired && media?.heroImage,
  );

  const hasDigitalAssets =
    Boolean(candidate.website) ||
    candidate.socialLinks.length > 0 ||
    hasBusinessImages;

  return {
    hasName: Boolean(candidate.name?.trim()),
    hasAddress: Boolean(candidate.address?.trim()),
    hasPhone: Boolean(candidate.phone?.trim()),
    hasEmail: Boolean(candidate.email?.trim()),
    hasWebsite: Boolean(candidate.website?.trim()),
    hasCoordinates: Boolean(candidate.coordinates),
    hasCategory: Boolean(candidate.businessType?.trim()),
    hasLogo: Boolean(media?.logoImage),
    hasBusinessImages,
    hasRepresentativeImagesOnly,
    hasDescription: Boolean(
      candidate.originalContent?.description &&
        String(candidate.originalContent.description).trim(),
    ),
    hasServices: candidate.fetchedServices.length > 0,
    hasProducts,
    hasHours,
    hasReviews,
    reviewCount,
    ownerVerified,
    dataConsistencyScore: scoreDataConsistency(candidate),
    hasSocial: candidate.socialLinks.length > 0,
    hasDigitalAssets,
  };
}

export function buildBusinessHealthScore(
  candidate: BusinessCandidateRecord,
  media: SelectedCandidateMedia | null,
  visibility: VisibilityScores,
): BusinessHealthScore {
  const s = buildHealthScoreSignals(candidate, media);

  const visibilityPillar: HealthPillar = {
    key: 'visibility',
    label: 'Visibility',
    score: avgScores([visibility.seoReadiness, visibility.geoReadiness]),
    subMetrics: [
      metric(
        'seo',
        'SEO',
        visibility.seoReadiness,
        visibility.seoReadiness > 0 ? 'evidence_found' : 'not_found',
        'Search engine discoverability from website, contact, hours, and profile signals.',
      ),
      metric(
        'geo',
        'GEO',
        visibility.geoReadiness,
        visibility.geoReadiness > 0 ? 'evidence_found' : 'not_found',
        'AI assistant readiness from category, description, services, and structured public data.',
      ),
    ],
  };

  const contactFields = [s.hasPhone, s.hasEmail, s.hasWebsite, s.hasAddress].filter(Boolean).length;
  const contactCompleteness = clamp((contactFields / 4) * 100);

  const trustPillar: HealthPillar = {
    key: 'trust',
    label: 'Trust',
    score: avgScores([
      s.ownerVerified ? 100 : 0,
      s.dataConsistencyScore,
      contactCompleteness,
    ]),
    subMetrics: [
      metric(
        'identity_verification',
        'Identity verification',
        s.ownerVerified ? 100 : 0,
        s.ownerVerified ? 'evidence_found' : 'not_found',
        s.ownerVerified
          ? 'Owner identity verified on Cardbey.'
          : 'Owner has not verified this business yet.',
      ),
      metric(
        'data_consistency',
        'Data consistency',
        s.dataConsistencyScore,
        s.dataConsistencyScore >= 60 ? 'evidence_found' : 'not_found',
        'Consistency across name, address, and provider-supplied fields.',
      ),
      metric(
        'contact_completeness',
        'Contact completeness',
        contactCompleteness,
        contactFields > 0 ? 'evidence_found' : 'not_found',
        `${contactFields} of 4 contact channels on file (phone, email, website, address).`,
      ),
    ],
  };

  const contentPillar: HealthPillar = {
    key: 'content',
    label: 'Content',
    score: avgScores([
      s.hasLogo ? 100 : 0,
      s.hasBusinessImages ? 100 : s.hasRepresentativeImagesOnly ? 35 : 0,
      s.hasProducts ? 100 : null,
      s.hasServices ? 100 : 0,
      s.hasDescription ? 100 : 0,
    ]),
    subMetrics: [
      metric('logo', 'Logo', s.hasLogo ? 100 : 0, s.hasLogo ? 'evidence_found' : 'not_found', s.hasLogo ? 'Logo asset detected.' : 'No logo on file.'),
      metric(
        'images',
        'Images',
        s.hasBusinessImages ? 100 : s.hasRepresentativeImagesOnly ? 35 : 0,
        s.hasBusinessImages
          ? 'evidence_found'
          : s.hasRepresentativeImagesOnly
            ? 'insufficient_evidence'
            : 'not_found',
        s.hasBusinessImages
          ? 'Business-specific images available.'
          : s.hasRepresentativeImagesOnly
            ? 'Only representative category image until owner verifies.'
            : 'No business images on file.',
      ),
      metric(
        'products',
        'Products',
        s.hasProducts ? 100 : null,
        s.hasProducts ? 'evidence_found' : 'insufficient_evidence',
        s.hasProducts ? 'Product or menu data detected.' : 'Not enough evidence — no product catalog found.',
      ),
      metric('services', 'Services', s.hasServices ? 100 : 0, s.hasServices ? 'evidence_found' : 'not_found', s.hasServices ? 'Services identified.' : 'No structured services on file.'),
      metric('description', 'Business description', s.hasDescription ? 100 : 0, s.hasDescription ? 'evidence_found' : 'not_found', s.hasDescription ? 'Description available.' : 'No business description on file.'),
    ],
  };

  const responseScore = clamp(
    (s.hasPhone ? 40 : 0) + (s.hasEmail ? 30 : 0) + (s.hasWebsite ? 30 : 0),
  );

  const customerExperiencePillar: HealthPillar = {
    key: 'customer_experience',
    label: 'Customer Experience',
    score: avgScores([
      s.hasReviews ? clamp(Math.min(100, 50 + (s.reviewCount ?? 1) * 2)) : null,
      s.hasHours ? 100 : 0,
      responseScore,
    ]),
    subMetrics: [
      metric(
        'reviews',
        'Reviews available',
        s.hasReviews ? clamp(Math.min(100, 50 + (s.reviewCount ?? 1) * 2)) : null,
        s.hasReviews ? 'evidence_found' : 'insufficient_evidence',
        s.hasReviews
          ? `Public review data detected${s.reviewCount != null ? ` (${s.reviewCount} reviews)` : ''}.`
          : 'Not enough evidence — no review data in provider sources.',
      ),
      metric('opening_hours', 'Opening hours', s.hasHours ? 100 : 0, s.hasHours ? 'evidence_found' : 'not_found', s.hasHours ? 'Opening hours available.' : 'Opening hours not available.'),
      metric('response_information', 'Response information', responseScore, responseScore > 0 ? 'evidence_found' : 'not_found', 'Customer contact channels for enquiries.'),
    ],
  };

  const commercePillar: HealthPillar = {
    key: 'commerce_readiness',
    label: 'Commerce Readiness',
    score: avgScores([
      0,
      0,
      0,
      0,
      s.hasDigitalAssets ? clamp((s.hasWebsite ? 40 : 0) + (s.hasSocial ? 30 : 0) + (s.hasBusinessImages ? 30 : 0)) : 0,
    ]),
    subMetrics: [
      metric('promotions', 'Promotions', 0, 'post_claim', 'Available after claiming and activating your Business Space.'),
      metric('loyalty', 'Loyalty', 0, 'post_claim', 'Available after claiming — not yet activated.'),
      metric('ai_performer', 'AI Performer', 0, 'post_claim', 'Available after claim and verification.'),
      metric('online_ordering', 'Online ordering', 0, 'post_claim', 'Not enough evidence — requires owner activation.'),
      metric(
        'digital_assets',
        'Digital assets',
        s.hasDigitalAssets
          ? clamp((s.hasWebsite ? 40 : 0) + (s.hasSocial ? 30 : 0) + (s.hasBusinessImages ? 30 : 0))
          : 0,
        s.hasDigitalAssets ? 'evidence_found' : 'not_found',
        'Website, social, and visual assets for digital commerce.',
      ),
    ],
  };

  const pillars = [
    visibilityPillar,
    trustPillar,
    contentPillar,
    customerExperiencePillar,
    commercePillar,
  ];

  const pillarScores = pillars.map((p) => p.score).filter((x): x is number => x != null);
  const overallReadiness =
    pillarScores.length > 0
      ? clamp(pillarScores.reduce((a, b) => a + b, 0) / pillarScores.length)
      : 0;

  return {
    overallReadiness,
    confidenceLevel: visibility.confidenceLevel,
    pillars,
  };
}

export function formatHealthScoreMarkdown(health: BusinessHealthScore): string[] {
  const lines = [
    `## Business Health Score`,
  ];

  for (const pillar of health.pillars) {
    lines.push(``, `### ${pillar.label}`, pillar.score != null ? `Pillar score: ${pillar.score}%` : 'Not enough evidence');
    for (const sub of pillar.subMetrics) {
      const scoreLabel = sub.score != null ? `${sub.score}%` : 'Not enough evidence';
      lines.push(`- ${sub.label}: ${scoreLabel} — ${sub.detail}`);
    }
  }

  lines.push(``, `**Overall Business Readiness: ${health.overallReadiness}%**`);
  return lines;
}
