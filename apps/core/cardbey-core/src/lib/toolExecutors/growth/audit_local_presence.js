/**
 * audit_local_presence — Deterministic local presence scoring (Phase 5).
 */

import { randomUUID } from 'node:crypto';
import { executeAnalysisTool } from '../executeAnalysisTool.js';

/**
 * @param {string} seed
 * @returns {number}
 */
function hashSeed(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * @param {number} seed
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function seededInt(seed, min, max) {
  const span = max - min + 1;
  return min + (seed % span);
}

/** @type {Array<{ key: string, weight: number, gap: string }>} */
const SCORE_DIMENSIONS = [
  { key: 'profileCompleteness', weight: 0.3, gap: 'profile incomplete' },
  { key: 'contentFreshness', weight: 0.25, gap: 'low content freshness' },
  { key: 'offerActivity', weight: 0.2, gap: 'no active offer' },
  { key: 'socialPresence', weight: 0.15, gap: 'no social links' },
  { key: 'displayPresence', weight: 0.1, gap: 'no display device' },
];

const SCORE_RANGES = {
  profileCompleteness: [40, 100],
  contentFreshness: [20, 90],
  offerActivity: [10, 80],
  socialPresence: [30, 100],
  displayPresence: [0, 70],
};

/**
 * @param {object} scores
 * @returns {{ gaps: string[], topOpportunity: string }}
 */
function deriveGaps(scores) {
  /** @type {string[]} */
  const gaps = [];
  let lowestKey = SCORE_DIMENSIONS[0].key;
  let lowestScore = scores[lowestKey] ?? 100;

  for (const dim of SCORE_DIMENSIONS) {
    const value = Number(scores[dim.key] ?? 0);
    if (value < 60) gaps.push(dim.gap);
    if (value < lowestScore) {
      lowestScore = value;
      lowestKey = dim.key;
    }
  }

  const topDim = SCORE_DIMENSIONS.find((d) => d.key === lowestKey);
  const topOpportunity = topDim?.gap ?? 'low content freshness';

  return { gaps, topOpportunity };
}

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  return await executeAnalysisTool({
    toolName: 'audit_local_presence',
    input,
    context,
    analyzer: (inp, ctx) => {
      const storeId =
        (typeof inp?.storeId === 'string' && inp.storeId.trim()) ||
        (typeof ctx?.storeId === 'string' && ctx.storeId.trim()) ||
        'unknown-store';

      const seed = hashSeed(storeId);
      /** @type {Record<string, number>} */
      const scores = {};

      for (const dim of SCORE_DIMENSIONS) {
        const [min, max] = SCORE_RANGES[dim.key];
        scores[dim.key] = seededInt(seed ^ hashSeed(dim.key), min, max);
      }

      let overallScore = 0;
      for (const dim of SCORE_DIMENSIONS) {
        overallScore += (scores[dim.key] ?? 0) * dim.weight;
      }
      overallScore = Math.round(overallScore);

      const { gaps, topOpportunity } = deriveGaps(scores);

      return {
        audit: {
          storeId,
          auditedAt: new Date().toISOString(),
          scores,
          overallScore,
          gaps,
          topOpportunity,
          includeCompetitors: inp?.includeCompetitors === true,
          auditId: randomUUID(),
        },
      };
    },
    isEmpty: (result) => !result?.audit?.auditId,
    countRecords: (result) => Object.keys(result?.audit?.scores ?? {}).length,
  });
}

export default execute;
