/**
 * Loyalty From Card Service
 * Business service that uses AI engines to process loyalty cards
 * Calls VisionEngine and TextEngine via abstraction layer
 */

import { getVisionEngine, getTextEngine } from '../../ai/engines/index.js';
import { callTool } from '../runtime/toolExecutor.js';
import { logger } from './logger.js';
import { getEventEmitter } from '../../engines/loyalty/events.js';

/**
 * Process loyalty card image and create program
 * 
 * @param {Object} input - Service input
 * @param {string} input.tenantId
 * @param {string} input.storeId
 * @param {string} input.imageUrl
 * @param {string} [input.themePreference]
 * @param {Object} [ctx] - Execution context
 * @returns {Promise<Object>} LoyaltyFromCardResult format
 */
export async function runLoyaltyFromCard(input, ctx) {
  const { tenantId, storeId, imageUrl, themePreference } = input;

  logger.info('[LoyaltyFromCardService] Starting', {
    tenantId,
    storeId,
    imageUrl: imageUrl ? 'provided' : 'missing',
  });

  try {
    // 1. Use VisionEngine to analyze image
    const vision = getVisionEngine();
    const visionResult = await vision.analyzeImage({
      imageUrl,
      task: 'loyalty_card',
    });

    const ocrText = visionResult.text || '';
    logger.info('[LoyaltyFromCardService] Vision analysis complete', {
      textLength: ocrText.length,
    });

    // 2. Use TextEngine to interpret OCR text into rules
    const text = getTextEngine();
    
    const rulesPrompt = `You are analyzing a loyalty card. Extract the following information from this OCR text:

${ocrText}

Return a JSON object with:
- stampsRequired: number (how many stamps/holes needed)
- rewardDescription: string (what the reward is)
- expiryPolicy: string (optional, if mentioned)
- notes: string (optional, any other relevant info)

Return ONLY valid JSON, no markdown.`;

    const rulesResult = await text.generateText({
      systemPrompt: 'You are a loyalty program analyzer. Always return valid JSON only.',
      userPrompt: rulesPrompt,
      temperature: 0.2,
    });

    let rules;
    try {
      rules = JSON.parse(rulesResult.text);
    } catch (parseError) {
      logger.warn('[LoyaltyFromCardService] Failed to parse rules JSON, using defaults', {
        error: parseError.message,
      });
      rules = {
        stampsRequired: 10,
        rewardDescription: 'Free drink',
        expiryPolicy: undefined,
        notes: undefined,
      };
    }

    logger.info('[LoyaltyFromCardService] Rules extracted', {
      stampsRequired: rules.stampsRequired,
      reward: rules.rewardDescription,
    });

    // 3. Use TextEngine to suggest ideas
    const ideasPrompt = `Based on this loyalty card program (${rules.stampsRequired} stamps for ${rules.rewardDescription}), suggest 3 creative ideas for:
- Promotion ideas
- Upsell opportunities
- Retention strategies

Return a JSON array of ideas, each with:
- id: string
- title: string
- description: string
- category: "promotion" | "upsell" | "retention" | "other"

Return ONLY valid JSON array, no markdown.`;

    const ideasResult = await text.generateText({
      systemPrompt: 'You are a creative marketing assistant. Always return valid JSON arrays only.',
      userPrompt: ideasPrompt,
      temperature: 0.7,
    });

    let ideas;
    try {
      ideas = JSON.parse(ideasResult.text);
      if (!Array.isArray(ideas)) {
        ideas = [];
      }
    } catch (parseError) {
      logger.warn('[LoyaltyFromCardService] Failed to parse ideas JSON', {
        error: parseError.message,
      });
      ideas = [];
    }

    logger.info('[LoyaltyFromCardService] Ideas generated', {
      ideaCount: ideas.length,
    });

    // 4. Configure loyalty program using engine tool
    const programRes = await callTool(
      'loyalty.configure-program',
      {
        tenantId,
        storeId,
        programId: null,
        name: 'Stamp Rewards',
        stampsRequired: rules.stampsRequired,
        reward: rules.rewardDescription,
        expiresAt: null,
      },
      ctx
    );

    if (!programRes.ok || !programRes.data) {
      throw new Error(programRes.error || 'Failed to configure loyalty program');
    }

    const programId = programRes.data.programId;

    // 5. Generate assets
    const assets = await callTool(
      'loyalty.generate-assets',
      {
        tenantId,
        storeId,
        programId,
        theme: themePreference || 'default',
        format: ['qr', 'card', 'pdf'],
      },
      ctx
    );

    if (!assets.ok || !assets.data) {
      throw new Error(assets.error || 'Failed to generate assets');
    }

    // 6. Build standardized result
    const result = {
      version: 'v1',
      type: 'loyalty',
      confidence: 0.9,
      payload: {
        rules: {
          stampsRequired: rules.stampsRequired,
          rewardDescription: rules.rewardDescription,
          expiryPolicy: rules.expiryPolicy,
          notes: rules.notes,
        },
        ideas: ideas.map((idea, index) => ({
          id: idea.id || `idea-${index}`,
          title: idea.title || 'Untitled Idea',
          description: idea.description || '',
          category: idea.category || 'other',
        })),
      },
      raw: {
        vision: visionResult.raw,
        text: {
          rules: rulesResult.raw,
          ideas: ideasResult.raw,
        },
        programId,
        assets: assets.data,
      },
    };

    // 7. Emit event
    try {
      const events = ctx?.services?.events || getEventEmitter();
      await events.emit('loyalty.flow_completed', {
        tenantId,
        storeId,
        programId,
      });
    } catch (eventError) {
      logger.warn('[LoyaltyFromCardService] Failed to emit event', {
        error: eventError.message,
      });
    }

    logger.info('[LoyaltyFromCardService] Complete', {
      programId,
      ideaCount: ideas.length,
    });

    return result;
  } catch (error) {
    logger.error('[LoyaltyFromCardService] Error', {
      error: error.message,
      stack: error.stack,
      input: { tenantId, storeId, imageUrl: imageUrl ? 'provided' : 'missing' },
    });

    throw error;
  }
}

