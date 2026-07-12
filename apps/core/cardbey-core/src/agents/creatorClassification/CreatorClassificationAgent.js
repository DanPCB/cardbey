/**
 * CreatorClassificationAgent — structured classification (rule-based v1).
 * Does NOT publish content. Produces CreatorClassificationResult contract.
 */

import { randomUUID } from 'crypto';
import {
  CLASSIFICATION_RECOMMENDATION,
  CREATOR_PUBLISHABLE_TYPES,
  MODEL_VERSION,
  POLICY_VERSION,
  PUBLISHING_DESTINATIONS,
} from '../../lib/creator/publishing/creatorPublishingTypes.js';

const CATEGORY_KEYWORDS = Object.freeze({
  food: ['food', 'recipe', 'cooking', 'coffee', 'restaurant', 'cafe', 'kitchen'],
  technology: ['tech', 'software', 'code', 'ai', 'programming', 'developer'],
  business: ['business', 'startup', 'marketing', 'entrepreneur', 'brand'],
  education: ['learn', 'tutorial', 'course', 'education', 'how to', 'guide'],
  travel: ['travel', 'trip', 'destination', 'hotel', 'flight'],
  fashion: ['fashion', 'style', 'outfit', 'beauty', 'makeup'],
  entertainment: ['fun', 'comedy', 'music', 'game', 'entertainment'],
});

/**
 * @param {string} text
 */
function detectCategories(text) {
  const lower = String(text || '').toLowerCase();
  const matches = [];
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) matches.push(category);
  }
  return matches.length ? matches : ['general'];
}

/**
 * @param {object} evidence
 * @returns {{ blockers: string[], complete: boolean }}
 */
export function validateClassificationEvidence(evidence) {
  const blockers = [];
  if (!evidence?.contentId) blockers.push('missing_content_id');
  if (!evidence?.creatorId) blockers.push('missing_creator_id');
  if (!evidence?.title?.trim()) blockers.push('missing_title');

  const type = String(evidence?.declaredType || '').toUpperCase();
  if (type === CREATOR_PUBLISHABLE_TYPES.VIDEO || type === CREATOR_PUBLISHABLE_TYPES.LIVESTREAM) {
    if (!evidence?.mediaAsset?.mediaUrl) blockers.push('missing_media_asset');
    if (!evidence?.mediaAsset?.durationSeconds) blockers.push('missing_duration');
  }
  if (type === CREATOR_PUBLISHABLE_TYPES.ARTICLE) {
    const body = evidence?.article?.body || evidence?.description || '';
    if (!String(body).trim()) blockers.push('missing_article_body');
  }

  return { blockers, complete: blockers.length === 0 };
}

/**
 * @param {object} evidence
 */
export function classifyCreatorContent(evidence) {
  const validation = validateClassificationEvidence(evidence);
  if (!validation.complete) {
    return {
      incomplete: true,
      blockers: validation.blockers,
    };
  }

  const declaredType = String(evidence.declaredType || 'VIDEO').toUpperCase();
  const text = `${evidence.title} ${evidence.description || ''} ${evidence.article?.body || ''}`;
  const categories = detectCategories(text);
  const primaryCategory = categories[0];
  const metadataScore = scoreMetadataCompleteness(evidence);
  const qualityScore = scoreQuality(evidence, metadataScore);
  const risk = assessRisk(evidence, text);
  const originality = assessOriginality(evidence);
  const confidence = computeConfidence(qualityScore, metadataScore, risk, originality);
  const recommendation = recommendAction(qualityScore, risk, metadataScore, evidence.creatorContext);

  const classificationId = randomUUID();
  const now = new Date().toISOString();

  return {
    classificationId,
    contentId: evidence.contentId,
    creatorId: evidence.creatorId,
    modelVersion: MODEL_VERSION,
    policyVersion: POLICY_VERSION,
    createdAt: now,
    detectedType: declaredType,
    primaryCategory,
    secondaryCategories: categories.slice(1),
    tags: buildTags(evidence, categories),
    language: {
      primary: evidence.language || 'en',
      confidence: evidence.language ? 0.99 : 0.7,
      additional: [],
    },
    audience: {
      segments: ['creator_community'],
      businessCategories: categories,
    },
    originality,
    quality: {
      score: qualityScore,
      productionQuality: qualityScore,
      metadataCompleteness: metadataScore,
      usefulness: Math.min(1, qualityScore + 0.05),
      concerns: metadataScore < 0.6 ? ['Metadata is incomplete'] : [],
    },
    risk,
    commerce: {
      suitableForMarketplace: qualityScore >= 0.6 && risk.overall !== 'HIGH',
      suitableForBusinessDiscovery: categories.includes('business'),
      suitableForSearch: metadataScore >= 0.5,
      suitableForRecommendations: qualityScore >= 0.7 && risk.overall === 'LOW',
    },
    suggestedDestinations: buildDestinations(declaredType, categories, risk),
    recommendation,
    confidence,
    summary: buildSummary(recommendation, primaryCategory, risk, qualityScore),
    suggestedCreatorFeedback: recommendation === CLASSIFICATION_RECOMMENDATION.CHANGES_REQUESTED
      ? buildChangeFeedback(evidence, metadataScore)
      : undefined,
  };
}

function scoreMetadataCompleteness(evidence) {
  let score = 0;
  if (evidence.title?.trim()) score += 0.25;
  if (evidence.description?.trim()) score += 0.25;
  if (evidence.language) score += 0.1;
  if (evidence.mediaAsset?.mediaUrl || evidence.article?.body) score += 0.25;
  if (evidence.mediaAsset?.posterUrl || evidence.thumbnail) score += 0.15;
  return Math.min(1, score);
}

function scoreQuality(evidence, metadataScore) {
  let score = metadataScore * 0.5;
  const duration = Number(evidence.mediaAsset?.durationSeconds);
  if (Number.isFinite(duration)) {
    if (duration >= 30 && duration <= 3600) score += 0.3;
    else if (duration > 0) score += 0.15;
  } else if (evidence.article?.body) {
    score += String(evidence.article.body).length > 200 ? 0.35 : 0.2;
  } else {
    score += 0.2;
  }
  const rejections = Number(evidence.creatorContext?.previousRejections ?? 0);
  if (rejections > 2) score -= 0.15;
  return Math.max(0, Math.min(1, score));
}

function assessRisk(evidence, text) {
  const lower = text.toLowerCase();
  const flagged = ['weapon', 'drug', 'porn', 'nude', 'hate', 'scam'].some((w) => lower.includes(w));
  const spammy = !evidence.description && evidence.title?.length < 5;
  const copyrightConcern = lower.includes('copyright') || lower.includes('official trailer');

  const scores = {
    adult: flagged ? 0.8 : 0.05,
    violence: lower.includes('violence') ? 0.6 : 0.05,
    hate: lower.includes('hate') ? 0.7 : 0.03,
    harassment: 0.03,
    selfHarm: 0.02,
    illegalActivity: flagged ? 0.5 : 0.02,
    misinformation: 0.05,
    privacy: 0.04,
    copyright: copyrightConcern ? 0.65 : 0.08,
    spam: spammy ? 0.7 : 0.1,
    fraud: 0.03,
    regulatedGoods: 0.02,
  };

  const maxRisk = Math.max(...Object.values(scores));
  let overall = 'LOW';
  if (maxRisk >= 0.7) overall = 'CRITICAL';
  else if (maxRisk >= 0.45) overall = 'HIGH';
  else if (maxRisk >= 0.25) overall = 'MEDIUM';

  const reasons = [];
  if (copyrightConcern) reasons.push('Possible copyright indicators in text');
  if (spammy) reasons.push('Title/description may be too thin');
  if (flagged) reasons.push('Policy-sensitive keywords detected');

  return { overall, ...scores, reasons };
}

function assessOriginality(evidence) {
  const generic = ['test', 'untitled', 'my video', 'video 1'];
  const title = String(evidence.title || '').toLowerCase();
  const isGeneric = generic.some((g) => title === g || title.startsWith(g));
  const score = isGeneric ? 0.45 : 0.85;
  return {
    score,
    confidence: 0.75,
    signals: isGeneric ? ['generic_title'] : ['distinct_title'],
    concerns: isGeneric ? ['Title appears generic'] : [],
  };
}

function computeConfidence(quality, metadata, risk, originality) {
  const riskPenalty = risk.overall === 'LOW' ? 0 : risk.overall === 'MEDIUM' ? 0.1 : 0.25;
  return Math.max(0, Math.min(1, (quality + metadata + originality.score) / 3 - riskPenalty));
}

function recommendAction(quality, risk, metadata, creatorContext = {}) {
  if (risk.overall === 'CRITICAL') return CLASSIFICATION_RECOMMENDATION.ESCALATE;
  if (risk.overall === 'HIGH') return CLASSIFICATION_RECOMMENDATION.HUMAN_REVIEW_REQUIRED;
  if (metadata < 0.5) return CLASSIFICATION_RECOMMENDATION.CHANGES_REQUESTED;
  if (quality >= 0.75 && risk.overall === 'LOW' && Number(creatorContext.previousRejections ?? 0) === 0) {
    return CLASSIFICATION_RECOMMENDATION.READY_TO_PUBLISH;
  }
  if (quality >= 0.55 && risk.overall === 'LOW') return CLASSIFICATION_RECOMMENDATION.READY_TO_PUBLISH;
  return CLASSIFICATION_RECOMMENDATION.HUMAN_REVIEW_REQUIRED;
}

function buildTags(evidence, categories) {
  const tags = [...categories, String(evidence.declaredType || 'VIDEO').toLowerCase()];
  if (evidence.language) tags.push(evidence.language);
  return [...new Set(tags)];
}

function buildDestinations(type, categories, risk) {
  const destinations = [
    PUBLISHING_DESTINATIONS.CREATOR_PROFILE,
    PUBLISHING_DESTINATIONS.CREATOR_FEED,
    PUBLISHING_DESTINATIONS.SEARCH,
  ];
  if (risk.overall === 'LOW') destinations.push(PUBLISHING_DESTINATIONS.RECOMMENDATIONS);
  if (categories.includes('business')) destinations.push(PUBLISHING_DESTINATIONS.BUSINESS_DISCOVERY);
  if (type === CREATOR_PUBLISHABLE_TYPES.CREATOR_SERVICE || type === CREATOR_PUBLISHABLE_TYPES.DIGITAL_PRODUCT) {
    destinations.push(PUBLISHING_DESTINATIONS.MARKETPLACE);
  }
  return [...new Set(destinations)];
}

function buildSummary(recommendation, category, risk, quality) {
  return `Classified as ${category} with ${risk.overall.toLowerCase()} risk and ${Math.round(quality * 100)}% quality. Recommendation: ${recommendation.replace(/_/g, ' ').toLowerCase()}.`;
}

function buildChangeFeedback(evidence, metadataScore) {
  const feedback = [];
  if (!evidence.description?.trim()) feedback.push('Add a clear description');
  if (!evidence.language) feedback.push('Select a language');
  if (metadataScore < 0.5) feedback.push('Complete required metadata before resubmitting');
  return feedback.length ? feedback : ['Improve title and metadata clarity'];
}

export default { classifyCreatorContent, validateClassificationEvidence };
