/**
 * Evidence-backed Business Intelligence Brief with SEO/GEO visibility analysis.
 * Never fabricates rankings, traffic, revenue, or review data.
 */

import { randomUUID } from 'node:crypto';
import type { BusinessCandidateRecord } from '../types.js';
import type {
  CandidateIntelligenceBrief,
  VisibilityEstimate,
  VisibilityScores,
  BusinessHealthScore,
} from './types.js';
import { selectBestCandidateMedia } from '../media/selectBestCandidateMedia.js';
import { resolvePilotCategoryKey } from '../media/categoryMediaVocabulary.js';
import { getBriefByCandidateId, getBriefBySeedId, newBriefId, saveBrief } from './briefRepository.js';
import {
  buildBusinessHealthScore,
  formatHealthScoreMarkdown,
} from './businessHealthScore.js';

const DISCLAIMER =
  'This brief is generated from publicly available or provider-supplied information and should be verified by the business owner.';

const SEO_EXPLANATION =
  'Search Engine Optimization (SEO) helps customers find your business through Google and other search engines. Better SEO generally increases website visits, enquiries, and local visibility.';

const GEO_EXPLANATION =
  'Generative Engine Optimization (GEO) helps AI assistants such as ChatGPT, Gemini, Claude, and other AI search experiences understand and recommend your business accurately. As AI-powered search becomes more common, GEO improves the likelihood that your business appears in AI-generated recommendations.';

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

type EvidenceSignals = {
  hasName: boolean;
  hasAddress: boolean;
  hasPhone: boolean;
  hasWebsite: boolean;
  hasCoordinates: boolean;
  hasCategory: boolean;
  hasProvider: boolean;
  hasBusinessImages: boolean;
  hasLogo: boolean;
  hasSocial: boolean;
  hasServices: boolean;
  hasHours: boolean;
  hasDescription: boolean;
};

function buildSignals(
  candidate: BusinessCandidateRecord,
  media: Awaited<ReturnType<typeof selectBestCandidateMedia>>,
): EvidenceSignals {
  const raw = candidate.rawSourceJson;
  const hasHours = Boolean(
    raw &&
      typeof raw === 'object' &&
      ('opening_hours' in raw || 'openingHours' in raw),
  );

  return {
    hasName: Boolean(candidate.name?.trim()),
    hasAddress: Boolean(candidate.address?.trim()),
    hasPhone: Boolean(candidate.phone?.trim()),
    hasWebsite: Boolean(candidate.website?.trim()),
    hasCoordinates: Boolean(candidate.coordinates),
    hasCategory: Boolean(candidate.businessType?.trim()),
    hasProvider: Boolean(candidate.discoveryProviderId),
    hasBusinessImages: Boolean(
      media?.heroImage && !media.representativeDisclosureRequired,
    ),
    hasLogo: Boolean(media?.logoImage),
    hasSocial: candidate.socialLinks.length > 0,
    hasServices: candidate.fetchedServices.length > 0,
    hasHours,
    hasDescription: Boolean(
      (candidate.description && String(candidate.description).trim()) ||
        (candidate.originalContent?.description &&
          String(candidate.originalContent.description).trim()),
    ),
  };
}

function scoreSeo(signals: EvidenceSignals): number {
  let score = 0;
  if (signals.hasWebsite) score += 18;
  if (signals.hasPhone) score += 14;
  if (signals.hasAddress) score += 14;
  if (signals.hasHours) score += 12;
  if (signals.hasLogo) score += 10;
  if (signals.hasBusinessImages) score += 10;
  if (signals.hasCategory) score += 10;
  if (signals.hasDescription) score += 8;
  if (signals.hasName) score += 4;
  return clamp(score);
}

function scoreGeo(signals: EvidenceSignals): number {
  let score = 0;
  if (signals.hasCategory) score += 15;
  if (signals.hasDescription) score += 15;
  if (signals.hasWebsite) score += 14;
  if (signals.hasBusinessImages) score += 12;
  if (signals.hasServices) score += 12;
  if (signals.hasSocial) score += 10;
  if (signals.hasName && signals.hasAddress) score += 10;
  if (signals.hasCoordinates) score += 6;
  if (signals.hasProvider) score += 6;
  return clamp(score);
}

function scoreOnlinePresence(signals: EvidenceSignals): number {
  let score = 0;
  if (signals.hasWebsite) score += 30;
  if (signals.hasSocial) score += 25;
  if (signals.hasPhone) score += 20;
  if (signals.hasProvider) score += 15;
  if (signals.hasBusinessImages) score += 10;
  return clamp(score);
}

function scoreProfileCompleteness(signals: EvidenceSignals): number {
  const fields = [
    signals.hasName,
    signals.hasCategory,
    signals.hasAddress,
    signals.hasPhone,
    signals.hasWebsite,
    signals.hasCoordinates,
    signals.hasLogo,
    signals.hasBusinessImages,
    signals.hasSocial,
    signals.hasHours,
    signals.hasDescription,
  ];
  const filled = fields.filter(Boolean).length;
  return clamp(Math.round((filled / fields.length) * 100));
}

function confidenceLevel(
  candidate: BusinessCandidateRecord,
  signals: EvidenceSignals,
): VisibilityScores['confidenceLevel'] {
  const evidenceCount = Object.values(signals).filter(Boolean).length;
  if (candidate.confidenceScore >= 0.75 && evidenceCount >= 6) return 'high';
  if (candidate.confidenceScore >= 0.5 && evidenceCount >= 4) return 'medium';
  if (evidenceCount >= 2) return 'low';
  return 'insufficient';
}

function buildVisibility(
  candidate: BusinessCandidateRecord,
  signals: EvidenceSignals,
): VisibilityScores {
  const seoReadiness = scoreSeo(signals);
  const geoReadiness = scoreGeo(signals);
  const onlinePresence = scoreOnlinePresence(signals);
  const profileCompleteness = scoreProfileCompleteness(signals);
  const overall = clamp(
    seoReadiness * 0.3 +
      geoReadiness * 0.25 +
      onlinePresence * 0.2 +
      profileCompleteness * 0.25,
  );

  return {
    overall,
    seoReadiness,
    geoReadiness,
    onlinePresence,
    profileCompleteness,
    confidenceLevel: confidenceLevel(candidate, signals),
  };
}

function buildEstimate(visibility: VisibilityScores, health: BusinessHealthScore): VisibilityEstimate {
  const bump = (current: number, max: number) =>
    clamp(Math.min(current + Math.round((100 - current) * 0.35), max));

  return {
    seoReadiness: {
      current: visibility.seoReadiness,
      estimatedAfterClaim: bump(visibility.seoReadiness, 93),
    },
    geoReadiness: {
      current: visibility.geoReadiness,
      estimatedAfterClaim: bump(visibility.geoReadiness, 90),
    },
    profileCompleteness: {
      current: visibility.profileCompleteness,
      estimatedAfterClaim: bump(visibility.profileCompleteness, 98),
    },
    overall: {
      current: visibility.overall,
      estimatedAfterClaim: bump(visibility.overall, 94),
    },
    overallReadiness: {
      current: health.overallReadiness,
      estimatedAfterClaim: bump(health.overallReadiness, 94),
    },
    disclaimer:
      'These are estimated readiness improvements only. Do not imply guaranteed rankings or business results. Improving these areas generally increases the likelihood that customers and AI systems can discover accurate information about your business.',
  };
}

function buildStrengths(signals: EvidenceSignals): string[] {
  const items: string[] = [];
  if (signals.hasAddress) items.push('Business address detected');
  if (signals.hasWebsite) items.push('Website found');
  if (signals.hasCategory) items.push('Business category identified');
  if (signals.hasPhone) items.push('Phone number on file');
  if (signals.hasCoordinates) items.push('Location coordinates available');
  if (signals.hasBusinessImages) items.push('Business-relevant images available');
  if (signals.hasProvider) items.push('Discovery provider matched this business');
  if (!items.length) items.push('Business identity discovered from public sources');
  return items.slice(0, 6);
}

function buildWeaknesses(signals: EvidenceSignals): string[] {
  const items: string[] = [];
  if (!signals.hasLogo) items.push('No verified logo');
  if (!signals.hasDescription) items.push('Limited business description');
  if (!signals.hasServices) items.push('No structured service information');
  if (!signals.hasBusinessImages) items.push('Few business-specific images');
  if (!signals.hasHours) items.push('Opening hours not available');
  items.push('Missing owner verification');
  return [...new Set(items)].slice(0, 6);
}

function buildEvidenceJson(
  candidate: BusinessCandidateRecord,
  signals: EvidenceSignals,
): Record<string, unknown> {
  const found: string[] = [];
  if (signals.hasAddress) found.push('address');
  if (signals.hasPhone) found.push('phone');
  if (signals.hasWebsite) found.push('website');
  if (signals.hasCoordinates) found.push('coordinates');
  if (signals.hasHours) found.push('opening_hours');
  if (signals.hasCategory) found.push('business_category');
  if (signals.hasBusinessImages) found.push('public_images');
  if (signals.hasProvider) found.push('source_provider');

  return {
    discoveryStatus: candidate.status,
    confidenceScore: candidate.confidenceScore,
    evidenceFound: found,
    sourceProvider: candidate.discoveryProviderId,
    suburb: candidate.suburb,
    address: candidate.address,
    phone: candidate.phone,
    website: candidate.website,
    coordinates: candidate.coordinates,
    category: candidate.businessType,
  };
}

function buildMissingFields(signals: EvidenceSignals): string[] {
  const missing: string[] = [];
  if (!signals.hasLogo) missing.push('logo');
  if (!signals.hasDescription) missing.push('description');
  if (!signals.hasHours) missing.push('opening_hours');
  if (!signals.hasServices) missing.push('services');
  if (!signals.hasBusinessImages) missing.push('business_images');
  if (!signals.hasSocial) missing.push('social_links');
  return missing;
}

function buildRecommendedActions(signals: EvidenceSignals): Array<{ label: string; reason: string }> {
  const actions: Array<{ label: string; reason: string }> = [
    {
      label: 'Verify ownership',
      reason: 'Unlock management tools and confirm public information',
    },
  ];
  if (!signals.hasLogo) {
    actions.push({ label: 'Upload official logo', reason: 'Strengthen brand recognition across search and AI surfaces' });
  }
  if (!signals.hasDescription) {
    actions.push({ label: 'Improve business description', reason: 'Help search engines and AI assistants understand your offer' });
  }
  if (!signals.hasServices) {
    actions.push({ label: 'Add services', reason: 'Structured services improve GEO readiness' });
  }
  if (!signals.hasHours) {
    actions.push({ label: 'Add opening hours', reason: 'Improves local SEO and customer trust' });
  }
  if (!signals.hasWebsite) {
    actions.push({ label: 'Connect website', reason: 'Primary online presence signal for SEO' });
  }
  actions.push({
    label: 'Publish first promotion',
    reason: 'Signals an active business profile after claim',
  });
  actions.push({
    label: 'Activate AI Performer',
    reason: 'Receive evidence-backed growth recommendations after verification',
  });
  return actions.slice(0, 8);
}

function buildOwnerBenefits(): string[] {
  return [
    'Verify business details',
    'Correct business information',
    'Upload official images',
    'Publish offers',
    'Activate AI Performer',
    'Receive growth recommendations',
  ];
}

function buildMarkdown(
  candidate: BusinessCandidateRecord,
  brief: Omit<CandidateIntelligenceBrief, 'generatedMarkdown' | 'generatedHtml'>,
): string {
  const name = candidate.name ?? 'Business';
  const location = [candidate.suburb, candidate.state].filter(Boolean).join(', ');
  const evidence = (brief.evidenceJson.evidenceFound as string[]) ?? [];

  const lines = [
    `# Business Intelligence Brief`,
    ``,
    `**${name}**`,
    brief.summary,
    ``,
    `## Discovery`,
    `- Status: ${candidate.status}`,
    `- Category: ${candidate.businessType ?? 'Not identified'}`,
    `- Location: ${location || 'Not available'}`,
    `- Confidence: ${brief.confidenceScore}%`,
    `- Profile completeness: ${brief.completenessScore}%`,
    `- Source provider: ${candidate.discoveryProviderId}`,
    ``,
    `## Evidence found`,
    ...evidence.map((e) => `- ${e.replace(/_/g, ' ')}`),
    ``,
    `## Missing fields`,
    ...(brief.missingFieldsJson.length
      ? brief.missingFieldsJson.map((f) => `- ${f.replace(/_/g, ' ')}`)
      : ['- None identified from public sources']),
    ``,
    `## Business Visibility Report`,
    `- Overall: ${brief.visibility.overall}%`,
    `- SEO Readiness: ${brief.visibility.seoReadiness}%`,
    `- GEO Readiness: ${brief.visibility.geoReadiness}%`,
    `- Online Presence: ${brief.visibility.onlinePresence}%`,
    `- Profile Completeness: ${brief.visibility.profileCompleteness}%`,
    `- Confidence: ${brief.visibility.confidenceLevel}`,
    ``,
    `### What is SEO?`,
    SEO_EXPLANATION,
    ``,
    `### What is GEO?`,
    GEO_EXPLANATION,
    ``,
    `### Current strengths`,
    ...brief.strengths.map((s) => `- ✓ ${s}`),
    ``,
    `### Current weaknesses`,
    ...brief.weaknesses.map((w) => `- • ${w}`),
    ``,
    `### Recommended next actions`,
    ...brief.recommendedActionsJson.map((a) => `- ${a.label}: ${a.reason}`),
    ``,
    `### Estimated improvement after claiming`,
    `- SEO: ${brief.visibilityEstimate.seoReadiness.current}% → ${brief.visibilityEstimate.seoReadiness.estimatedAfterClaim}%`,
    `- GEO: ${brief.visibilityEstimate.geoReadiness.current}% → ${brief.visibilityEstimate.geoReadiness.estimatedAfterClaim}%`,
    `- Profile: ${brief.visibilityEstimate.profileCompleteness.current}% → ${brief.visibilityEstimate.profileCompleteness.estimatedAfterClaim}%`,
    `- Overall: ${brief.visibilityEstimate.overall.current}% → ${brief.visibilityEstimate.overall.estimatedAfterClaim}%`,
    `- Business Readiness: ${brief.visibilityEstimate.overallReadiness.current}% → ${brief.visibilityEstimate.overallReadiness.estimatedAfterClaim}%`,
    ``,
    brief.visibilityEstimate.disclaimer,
    ``,
    ...formatHealthScoreMarkdown(brief.healthScore),
    ``,
    `## Owner benefits after claim`,
    ...buildOwnerBenefits().map((b) => `- ${b}`),
    ``,
    `---`,
    brief.disclaimer,
  ];
  return lines.join('\n');
}

function buildHtml(markdown: string, title: string): string {
  const body = markdown
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;line-height:1.5;color:#1e293b}
h1{color:#0f172a}h2{margin-top:1.5rem;color:#334155}ul{padding-left:1.25rem}</style></head>
<body>${body.replace(/\n\n/g, '</p><p>').replace(/^<p>/, '<p>')}</body></html>`;
}

export async function generateBusinessIntelligenceBrief(
  candidateId: string,
): Promise<CandidateIntelligenceBrief | null> {
  const { getBusinessCandidateById } = await import('../candidateRepository.js');
  const candidate = await getBusinessCandidateById(candidateId);
  if (!candidate) return null;

  const media = await selectBestCandidateMedia(candidateId, { discoverIfEmpty: true });
  const signals = buildSignals(candidate, media);
  const visibility = buildVisibility(candidate, signals);
  const healthScore = buildBusinessHealthScore(candidate, media, visibility);
  const visibilityEstimate = buildEstimate(visibility, healthScore);
  const strengths = buildStrengths(signals);
  const weaknesses = buildWeaknesses(signals);
  const evidenceJson = buildEvidenceJson(candidate, signals);
  const missingFieldsJson = buildMissingFields(signals);
  const recommendedActionsJson = buildRecommendedActions(signals);

  const confidenceScore = clamp(
    candidate.confidenceScore * 40 +
      visibility.profileCompleteness * 0.4 +
      healthScore.overallReadiness * 0.2,
  );
  const completenessScore = visibility.profileCompleteness;

  const name = candidate.name ?? 'Business';
  const categoryKey = resolvePilotCategoryKey(candidate.businessType, candidate.name);
  const summary = `Cardbey found public information for ${name} and prepared a starter brief for the owner to review. This ${categoryKey.replace(/_/g, ' ')} business has ${strengths.length} observable strength${strengths.length === 1 ? '' : 's'} and ${missingFieldsJson.length} field${missingFieldsJson.length === 1 ? '' : 's'} that may benefit from owner verification.`;

  const existing = await getBriefByCandidateId(candidateId);
  const now = new Date().toISOString();

  const base: Omit<CandidateIntelligenceBrief, 'generatedMarkdown' | 'generatedHtml'> = {
    id: existing?.id ?? newBriefId(),
    candidateId,
    seedId: candidate.seedId,
    batchId: candidate.batchId,
    title: `Business Intelligence Brief — ${name}`,
    summary,
    confidenceScore,
    completenessScore,
    evidenceJson,
    missingFieldsJson,
    recommendedActionsJson,
    mediaSummaryJson: {
      heroSource: media?.heroImage?.sourceType ?? null,
      representativeDisclosureRequired: media?.representativeDisclosureRequired ?? false,
      confidenceSummary: media?.confidenceSummary ?? null,
      missingMediaReasons: media?.missingMediaReasons ?? [],
    },
    visibility,
    visibilityEstimate,
    healthScore,
    strengths,
    weaknesses,
    seoExplanation: SEO_EXPLANATION,
    geoExplanation: GEO_EXPLANATION,
    disclaimer: DISCLAIMER,
    generatedPdfUrl: null,
    status: 'ready',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    downloadedAt: existing?.downloadedAt ?? null,
    claimStartedAt: existing?.claimStartedAt ?? null,
  };

  const generatedMarkdown = buildMarkdown(candidate, base);
  const generatedHtml = buildHtml(generatedMarkdown, base.title);

  const brief: CandidateIntelligenceBrief = {
    ...base,
    generatedMarkdown,
    generatedHtml,
  };

  await saveBrief(brief);
  return brief;
}

export async function generateBusinessIntelligenceBriefForSeed(
  seed: import('../businessIngestion/types.js').IngestedSeedRecord,
): Promise<CandidateIntelligenceBrief | null> {
  const { businessCandidateFromSeed } = await import('../seedBriefAdapter.js');
  const candidate = businessCandidateFromSeed(seed);
  const existing = await getBriefBySeedId(seed.id);
  if (existing && existing.status !== 'draft') return existing;

  const media = await selectBestCandidateMedia(candidate.id, { discoverIfEmpty: false }).catch(
    () => null,
  );
  const signals = buildSignals(candidate, media);
  const visibility = buildVisibility(candidate, signals);
  const healthScore = buildBusinessHealthScore(candidate, media, visibility);
  const visibilityEstimate = buildEstimate(visibility, healthScore);
  const strengths = buildStrengths(signals);
  const weaknesses = buildWeaknesses(signals);
  const evidenceJson = buildEvidenceJson(candidate, signals);
  const missingFieldsJson = buildMissingFields(signals);
  const recommendedActionsJson = buildRecommendedActions(signals);

  const confidenceScore = clamp(
    candidate.confidenceScore * 40 +
      visibility.profileCompleteness * 0.4 +
      healthScore.overallReadiness * 0.2,
  );
  const completenessScore = visibility.profileCompleteness;

  const name = candidate.name ?? 'Business';
  const categoryKey = resolvePilotCategoryKey(candidate.businessType, candidate.name);
  const summary = `Cardbey found public information for ${name} and prepared a starter brief for the owner to review. This ${categoryKey.replace(/_/g, ' ')} business has ${strengths.length} observable strength${strengths.length === 1 ? '' : 's'} and ${missingFieldsJson.length} field${missingFieldsJson.length === 1 ? '' : 's'} that may benefit from owner verification.`;

  const now = new Date().toISOString();
  const base: Omit<CandidateIntelligenceBrief, 'generatedMarkdown' | 'generatedHtml'> = {
    id: existing?.id ?? newBriefId(),
    candidateId: candidate.id,
    seedId: seed.id,
    batchId: seed.batchId ?? 'SEED_CLAIMABLE',
    title: `Business Intelligence Brief — ${name}`,
    summary,
    confidenceScore,
    completenessScore,
    evidenceJson,
    missingFieldsJson,
    recommendedActionsJson,
    mediaSummaryJson: {
      heroSource: media?.heroImage?.sourceType ?? 'category_stock',
      representativeDisclosureRequired: media?.representativeDisclosureRequired ?? true,
      confidenceSummary: media?.confidenceSummary ?? null,
      missingMediaReasons: media?.missingMediaReasons ?? ['No business-specific images on file'],
    },
    visibility,
    visibilityEstimate,
    healthScore,
    strengths,
    weaknesses,
    seoExplanation: SEO_EXPLANATION,
    geoExplanation: GEO_EXPLANATION,
    disclaimer: DISCLAIMER,
    generatedPdfUrl: null,
    status: 'ready',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    downloadedAt: existing?.downloadedAt ?? null,
    claimStartedAt: existing?.claimStartedAt ?? null,
  };

  const generatedMarkdown = buildMarkdown(candidate, base);
  const generatedHtml = buildHtml(generatedMarkdown, base.title);
  const brief: CandidateIntelligenceBrief = { ...base, generatedMarkdown, generatedHtml };
  await saveBrief(brief);
  return brief;
}

export function briefSummaryForPublic(brief: CandidateIntelligenceBrief) {
  return {
    title: brief.title,
    summary: brief.summary,
    confidenceScore: brief.confidenceScore,
    completenessScore: brief.completenessScore,
    evidenceFound: (brief.evidenceJson.evidenceFound as string[]) ?? [],
    missingFields: brief.missingFieldsJson,
    sourceProvider: (brief.evidenceJson.sourceProvider as string) ?? null,
    lastUpdated: brief.updatedAt,
    status: brief.status,
    visibility: brief.visibility,
    healthScore: brief.healthScore,
    strengths: brief.strengths,
    weaknesses: brief.weaknesses,
    recommendedActions: brief.recommendedActionsJson,
    visibilityEstimate: brief.visibilityEstimate,
    seoExplanation: brief.seoExplanation,
    geoExplanation: brief.geoExplanation,
    disclaimer: brief.disclaimer,
  };
}
