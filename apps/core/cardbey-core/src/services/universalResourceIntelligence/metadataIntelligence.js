/**
 * AI Metadata Intelligence — always separates source / AI / reviewed metadata.
 */

import { invokeAiModality } from './aiProviderRegistry.js';
import { upsertResourceRecord } from './resourceIndex.js';
import { AI_MODALITY, ANALYSIS_TIER } from './types.js';

/**
 * @param {object} record
 * @param {object} [intent]
 */
export async function enrichWithAiMetadata(record, intent = {}) {
  const tier = intent.analysisTier || ANALYSIS_TIER.LIGHT_AI;
  // Phase 1: skip FULL/DEEP unless requested — performance tiers
  if (
    tier === ANALYSIS_TIER.DEEP ||
    tier === ANALYSIS_TIER.CAPABILITY_EXTRACTION
  ) {
    // Still only light enrichment in foundation
  }

  const baseText = [
    record.title,
    record.sourceMetadata?.summary,
    intent.utterance,
    intent.industry,
    intent.purpose,
  ]
    .filter(Boolean)
    .join(' · ');

  const classified = await invokeAiModality(AI_MODALITY.CLASSIFICATION, { text: baseText });
  const classification = classified.classification || {};

  const aiMetadata = {
    title: record.title,
    description: null,
    summary: `Candidate for ${intent.purpose || 'reuse'} in ${intent.industry || classification.industries?.[0] || 'general'}`,
    keywords: [
      intent.industry,
      intent.mediaType,
      intent.preferences?.mood,
      ...(classification.industries || []),
    ].filter(Boolean),
    industry: record.industry || classification.industries?.[0] || null,
    topics: classification.industries || [],
    visualStyle: intent.preferences?.style || null,
    language: intent.language || 'en',
    useCases: [intent.purpose, intent.channel].filter(Boolean),
    mood: intent.preferences?.mood || classification.mood || null,
    technicalSuitability: {
      channel: intent.channel || null,
      mediaType: record.mediaType || classification.mediaType || null,
    },
    confidence: classified.ok ? 0.55 : 0.3,
    tier: classified.tier || ANALYSIS_TIER.LIGHT_AI,
    generatedAt: new Date().toISOString(),
    authority: 'ai_metadata_intelligence',
    notReviewed: true,
  };

  return upsertResourceRecord({
    ...record,
    aiMetadata,
    // Never overwrite reviewed metadata here
    reviewedMetadata: record.reviewedMetadata || null,
    sourceMetadata: record.sourceMetadata || {},
  });
}
