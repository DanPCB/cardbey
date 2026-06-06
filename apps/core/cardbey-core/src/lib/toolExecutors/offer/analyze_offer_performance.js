/**
 * analyze_offer_performance — Synthetic offer metrics (Phase 4: deterministic per store).
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

/**
 * @param {object} metrics
 * @returns {string[]}
 */
function deriveWeakPoints(metrics) {
  /** @type {string[]} */
  const weakPoints = [];
  const impressions = metrics.impressions || 0;
  const clicks = metrics.clicks || 0;
  const conversions = metrics.conversions || 0;
  const ctr = impressions > 0 ? clicks / impressions : 0;
  const conversionRate = clicks > 0 ? conversions / clicks : 0;

  if (impressions < 500) weakPoints.push('low impressions');
  if (ctr < 0.03) weakPoints.push('low CTR');
  if (conversionRate < 0.08) weakPoints.push('low conversions');
  if (conversions < 5) weakPoints.push('weak CTA');

  if (weakPoints.length === 0) {
    weakPoints.push('stale creative');
  }

  return weakPoints;
}

/**
 * @param {object} [input]
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  return await executeAnalysisTool({
    toolName: 'analyze_offer_performance',
    input,
    context,
    analyzer: (inp, ctx) => {
      const storeId =
        (typeof inp?.storeId === 'string' && inp.storeId.trim()) ||
        (typeof ctx?.storeId === 'string' && ctx.storeId.trim()) ||
        'unknown-store';

      const offerId =
        (typeof inp?.offerId === 'string' && inp.offerId.trim()) ||
        (typeof inp?.campaignId === 'string' && inp.campaignId.trim()) ||
        `offer-${hashSeed(storeId).toString(16).slice(0, 8)}`;

      const lookbackRaw = Number(inp?.lookbackDays);
      const days =
        Number.isFinite(lookbackRaw) && lookbackRaw > 0 ? Math.min(Math.floor(lookbackRaw), 90) : 7;

      const seed = hashSeed(`${storeId}:${offerId}:${days}`);
      const impressions = seededInt(seed, 120, 2400);
      const clicks = seededInt(seed >> 3, Math.floor(impressions * 0.01), Math.floor(impressions * 0.12));
      const conversions = seededInt(seed >> 5, 0, Math.max(1, Math.floor(clicks * 0.25)));
      const conversionRate = impressions > 0 ? Number((clicks / impressions).toFixed(4)) : 0;
      const revenue = Number((conversions * seededInt(seed >> 7, 8, 45)).toFixed(2));

      const metrics = {
        impressions,
        clicks,
        conversions,
        conversionRate,
        revenue,
      };

      const to = new Date();
      const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
      const weakPoints = deriveWeakPoints(metrics);

      return {
        analysis: {
          storeId,
          offerId,
          period: {
            days,
            from: from.toISOString(),
            to: to.toISOString(),
          },
          metrics,
          topPerformingAsset: weakPoints.includes('stale creative') ? null : `asset-${(seed % 99) + 1}`,
          weakPoints,
        },
        analysisId: randomUUID(),
      };
    },
    isEmpty: (result) => !result?.analysis?.metrics,
    countRecords: (result) => result?.analysis?.weakPoints?.length ?? 1,
  });
}

export default execute;
