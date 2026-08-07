/**
 * Consumer helpers — Universal Library, Capability Engine, Performer, etc.
 * Prefer these over adding new provider-specific search paths.
 */

import { Features } from '../../config/features.js';
import { runResourceIntelligenceSearch } from './pipeline.js';

/**
 * Shared intent search entry for platform consumers.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} input
 */
export async function searchResourcesForConsumer(prisma, input = {}) {
  if (!Features.universalResourceIntelligence?.v1) {
    return { ok: false, error: 'uri_disabled', authority: 'universal_resource_intelligence' };
  }
  return runResourceIntelligenceSearch(prisma, {
    utterance: input.utterance || input.query || input.need,
    industry: input.industry || input.intent?.industry,
    mediaType: input.mediaType || input.intent?.mediaType,
    channel: input.channel || input.intent?.channel,
    purpose: input.purpose || input.intent?.purpose,
    analysisTier: input.analysisTier,
    consumer: input.consumer || null,
    userId: input.userId || null,
  });
}
