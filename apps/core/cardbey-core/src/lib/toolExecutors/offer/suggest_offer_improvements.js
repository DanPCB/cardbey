/**
 * suggest_offer_improvements — Ranked optimization suggestions from analysis weak points.
 */

import { randomUUID } from 'node:crypto';
import { executeAnalysisTool } from '../executeAnalysisTool.js';

/** @type {Record<string, { type: string, title: string, description: string, expectedLift: string }>} */
const WEAK_POINT_TEMPLATES = {
  'low CTR': {
    type: 'copy',
    title: 'Strengthen call-to-action',
    description: 'Replace passive CTA with action-led language and a clearer value proposition.',
    expectedLift: '+15% CTR',
  },
  'weak CTA': {
    type: 'copy',
    title: 'Add urgency to CTA',
    description: 'Use limited-time wording and a single prominent button to drive immediate action.',
    expectedLift: '+12% clicks',
  },
  'low impressions': {
    type: 'timing',
    title: 'Shift to peak hours',
    description: 'Schedule posts and in-store display loops during local lunch and evening peaks.',
    expectedLift: '+20% impressions',
  },
  'low conversions': {
    type: 'discount_value',
    title: 'Increase offer value',
    description: 'Test a slightly higher discount or bundle to improve conversion from interested clicks.',
    expectedLift: '+18% conversions',
  },
  'stale creative': {
    type: 'media',
    title: 'Refresh campaign visuals',
    description: 'Swap hero imagery and slideshow frames with newer on-brand creative.',
    expectedLift: '+10% engagement',
  },
};

const DEFAULT_SUGGESTIONS = [
  {
    type: 'media',
    title: 'Refresh campaign visuals',
    description: 'Update imagery to match current season and brand tone.',
    expectedLift: '+10% engagement',
  },
  {
    type: 'audience',
    title: 'Refine target audience',
    description: 'Narrow audience to highest-converting local customer segment.',
    expectedLift: '+8% conversions',
  },
  {
    type: 'timing',
    title: 'Extend peak-hour exposure',
    description: 'Run the offer during high-traffic windows on social and in-store displays.',
    expectedLift: '+12% impressions',
  },
];

/**
 * @param {string[]} weakPoints
 * @param {string} tone
 * @returns {Array<object>}
 */
function buildSuggestions(weakPoints, tone) {
  /** @type {Array<object>} */
  const suggestions = [];
  const seen = new Set();

  for (const point of weakPoints) {
    const template = WEAK_POINT_TEMPLATES[point];
    if (!template || seen.has(template.type)) continue;
    seen.add(template.type);
    suggestions.push({
      id: randomUUID(),
      rank: suggestions.length + 1,
      ...template,
      description: `${template.description} (tone: ${tone}).`,
      autoApply: false,
    });
    if (suggestions.length >= 3) break;
  }

  for (const fallback of DEFAULT_SUGGESTIONS) {
    if (suggestions.length >= 3) break;
    if (seen.has(fallback.type)) continue;
    seen.add(fallback.type);
    suggestions.push({
      id: randomUUID(),
      rank: suggestions.length + 1,
      ...fallback,
      description: `${fallback.description} (tone: ${tone}).`,
      autoApply: false,
    });
  }

  return suggestions.map((s, index) => ({ ...s, rank: index + 1 }));
}

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  return await executeAnalysisTool({
    toolName: 'suggest_offer_improvements',
    input,
    context,
    analyzer: (inp, ctx) => {
      const storeId =
        (typeof inp?.storeId === 'string' && inp.storeId.trim()) ||
        (typeof ctx?.storeId === 'string' && ctx.storeId.trim()) ||
        null;

      const analysis = inp?.analysis && typeof inp.analysis === 'object' ? inp.analysis : {};
      const tone =
        String(inp?.tone ?? inp?.brandKit?.tone ?? analysis?.tone ?? 'friendly').trim() ||
        'friendly';
      const weakPoints = Array.isArray(analysis?.weakPoints) ? analysis.weakPoints : ['stale creative'];

      const suggestions = buildSuggestions(weakPoints, tone);

      return { storeId, suggestions };
    },
    isEmpty: (result) => !Array.isArray(result?.suggestions) || result.suggestions.length === 0,
    countRecords: (result) => result?.suggestions?.length ?? 0,
  });
}

export default execute;
