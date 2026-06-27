/**
 * Loyalty From Card Service — vision extraction only (no LoyaltyProgram writes).
 * Scanner convergence: dashboard calls setup_loyalty_program via Performer runtime.
 */

import { logger } from './logger.js';
import { extractLoyaltyCardFromImage } from '../../lib/toolExecutors/loyalty/loyaltyCardVisionExtract.js';
import { getTextEngine } from '../../ai/engines/index.js';

/**
 * Extract loyalty card rules from image — does NOT create LoyaltyProgram.
 *
 * @param {Object} input
 * @param {string} [input.imageUrl]
 * @param {string} [input.storeId]
 * @param {string} [input.storeName]
 * @param {Object} [ctx]
 */
export async function runLoyaltyFromCard(input, ctx) {
  const { imageUrl, storeName } = input;

  logger.info('[LoyaltyFromCardService] extract-only', {
    imageUrl: imageUrl ? 'provided' : 'missing',
    storeId: input?.storeId ?? null,
  });

  const extracted = await extractLoyaltyCardFromImage({ imageUrl, storeName });
  if (!extracted.ok) {
    throw new Error(extracted.error?.message || 'Loyalty card extraction failed');
  }

  let ideas = [];
  try {
    const text = getTextEngine();
    const preseeded = extracted.preseededDraft;
    const ideasPrompt = `Based on this loyalty card program (${preseeded.requiredStamps ?? '?'} stamps for ${preseeded.reward ?? 'reward'}), suggest 3 creative ideas.
Return JSON array with objects: id, title, description, category ("promotion"|"upsell"|"retention"|"other"). JSON only.`;
    const ideasResult = await text.generateText({
      systemPrompt: 'Return valid JSON arrays only.',
      userPrompt: ideasPrompt,
      temperature: 0.7,
    });
    const parsed = JSON.parse(ideasResult.text);
    if (Array.isArray(parsed)) ideas = parsed;
  } catch {
    ideas = [];
  }

  return {
    version: 'v2',
    type: 'loyalty_extraction',
    confidence: extracted.preseededDraft?.confidence ?? 0.5,
    preseededDraft: extracted.preseededDraft,
    payload: {
      rules: {
        stampsRequired: extracted.preseededDraft?.requiredStamps ?? null,
        rewardDescription: extracted.preseededDraft?.reward ?? null,
        expiryPolicy: extracted.preseededDraft?.expiry ?? null,
        terms: extracted.preseededDraft?.terms ?? null,
      },
      ideas: ideas.map((idea, index) => ({
        id: idea.id || `idea-${index}`,
        title: idea.title || 'Untitled Idea',
        description: idea.description || '',
        category: idea.category || 'other',
      })),
    },
    raw: {
      vision: extracted.visionRaw,
      ocrText: extracted.ocrText,
    },
    handoff: {
      action: 'setup_loyalty_program',
      source: 'dashboard_loyalty_card_scan',
      requiresOwnerReview: true,
    },
  };
}
