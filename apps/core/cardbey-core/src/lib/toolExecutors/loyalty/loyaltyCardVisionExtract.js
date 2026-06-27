/**
 * Vision-only loyalty card extraction — no LoyaltyProgram writes.
 */

import { getVisionEngine, getTextEngine } from '../../../ai/engines/index.js';

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/**
 * @param {{ imageUrl: string, storeName?: string | null }} input
 */
export async function extractLoyaltyCardFromImage(input) {
  const imageUrl = pickString(input?.imageUrl);
  if (!imageUrl) {
    return {
      ok: false,
      error: { code: 'IMAGE_REQUIRED', message: 'imageUrl is required for loyalty card extraction' },
    };
  }

  const vision = getVisionEngine();
  const visionResult = await vision.analyzeImage({ imageUrl, task: 'loyalty_card' });
  const ocrText = pickString(visionResult?.text);

  const text = getTextEngine();
  const rulesPrompt = `You are analyzing a loyalty card. Extract the following from this OCR text:

${ocrText || '(no text detected)'}

Return JSON only:
- stampsRequired: number
- rewardDescription: string
- programName: string (optional)
- expiryPolicy: string (optional)
- terms: string (optional)
- confidence: number 0-1`;

  const rulesResult = await text.generateText({
    systemPrompt: 'You are a loyalty program analyzer. Return valid JSON only.',
    userPrompt: rulesPrompt,
    temperature: 0.2,
  });

  let rules;
  try {
    rules = JSON.parse(rulesResult.text);
  } catch {
    rules = {
      stampsRequired: null,
      rewardDescription: null,
      confidence: ocrText ? 0.45 : 0.2,
    };
  }

  const stampsRequired = Math.max(1, Number(rules.stampsRequired) || 0) || null;
  const reward = pickString(rules.rewardDescription, rules.reward);
  const storeName = pickString(input?.storeName);
  const programName =
    pickString(rules.programName) || (storeName ? `${storeName} Rewards` : 'Loyalty Rewards');
  const confidence = Math.min(1, Math.max(0, Number(rules.confidence) || (reward && stampsRequired ? 0.85 : 0.4)));

  const preseededDraft = {
    programName,
    requiredStamps: stampsRequired,
    reward: reward || null,
    rewardRule: stampsRequired && reward ? `Buy ${stampsRequired}, get ${reward}` : null,
    terms: pickString(rules.terms, rules.notes) || null,
    expiry: pickString(rules.expiryPolicy) || null,
    confidence,
    extractedFromImage: true,
    imageAssetId: imageUrl,
    programType: 'stamp_card',
  };

  return {
    ok: true,
    preseededDraft,
    ocrText,
    visionRaw: visionResult?.raw ?? null,
    rulesRaw: rulesResult?.raw ?? null,
  };
}
