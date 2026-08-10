/**
 * Intent Engine — natural language / structured need → canonical Intent.
 * Intent is authoritative for planning; provider queries are derived later.
 */

import { invokeAiModality } from './aiProviderRegistry.js';
import { AI_MODALITY } from './types.js';

/**
 * @param {object} input
 * @returns {Promise<object>}
 */
export async function buildCanonicalIntent(input = {}) {
  const utterance = String(input.utterance || input.query || input.text || '').trim();
  const explicit = input.intent && typeof input.intent === 'object' ? input.intent : {};

  let aiHints = {};
  if (utterance) {
    const classified = await invokeAiModality(AI_MODALITY.CLASSIFICATION, { text: utterance });
    if (classified.ok && classified.classification) {
      aiHints = classified.classification;
    }
  }

  const intent = {
    id: `intent_${Date.now().toString(36)}`,
    utterance: utterance || null,
    industry: explicit.industry || aiHints.industries?.[0] || null,
    industries: explicit.industries || aiHints.industries || [],
    purpose: explicit.purpose || aiHints.purpose || null,
    mediaType: explicit.mediaType || aiHints.mediaType || null,
    orientation: explicit.orientation || null,
    channel: explicit.channel || (aiHints.purpose === 'digital_display' ? 'display' : null),
    country: explicit.country || null,
    language: explicit.language || 'en',
    rights: explicit.rights || { preferOpenOrCleared: true, allowReference: true },
    technical: {
      minWidth: explicit.technical?.minWidth || null,
      aspectRatio: explicit.technical?.aspectRatio || null,
      maxDurationSec: explicit.technical?.maxDurationSec || null,
      ...(explicit.technical || {}),
    },
    preferences: {
      mood: explicit.preferences?.mood || aiHints.mood || null,
      style: explicit.preferences?.style || null,
      ...(explicit.preferences || {}),
    },
    analysisTier: explicit.analysisTier || 'LIGHT_AI',
    createdAt: new Date().toISOString(),
    authority: 'intent_engine',
    aiAssisted: Boolean(utterance && aiHints.industries),
  };

  return { ok: true, intent };
}
