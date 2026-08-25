/**
 * Thin Prisma accessors for Marketing* models.
 * Graceful errors when tables/models are missing (pre-migrate).
 */

import { prisma } from '../../lib/prisma.js';

export class MarketingRepoError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {unknown} [cause]
   */
  constructor(code, message, cause) {
    super(message);
    this.name = 'MarketingRepoError';
    this.code = code;
    this.cause = cause;
  }
}

function isMissingTableError(err) {
  const msg = String(err?.message || err || '');
  const code = err?.code;
  return (
    code === 'P2021' ||
    code === 'P2022' ||
    /no such table/i.test(msg) ||
    /does not exist/i.test(msg) ||
    /marketingcampaign/i.test(msg) && /unknown/i.test(msg)
  );
}

/**
 * @param {string} modelName
 * @returns {object | null}
 */
function delegate(modelName) {
  const d = prisma?.[modelName];
  if (!d || typeof d.findMany !== 'function') return null;
  return d;
}

/**
 * @template T
 * @param {string} modelName
 * @param {(d: any) => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withDelegate(modelName, fn) {
  const d = delegate(modelName);
  if (!d) {
    throw new MarketingRepoError(
      'MODEL_UNAVAILABLE',
      `Prisma model ${modelName} is not available — run prisma generate / migrate`,
    );
  }
  try {
    return await fn(d);
  } catch (err) {
    if (isMissingTableError(err)) {
      throw new MarketingRepoError(
        'TABLE_MISSING',
        `Marketing table for ${modelName} is missing — apply migrations`,
        err,
      );
    }
    throw err;
  }
}

export const marketingRepo = {
  objective: {
    create: (data) => withDelegate('marketingObjective', (d) => d.create({ data })),
    findMany: (args = {}) => withDelegate('marketingObjective', (d) => d.findMany(args)),
    findFirst: (args) => withDelegate('marketingObjective', (d) => d.findFirst(args)),
    findUnique: (args) => withDelegate('marketingObjective', (d) => d.findUnique(args)),
    update: (args) => withDelegate('marketingObjective', (d) => d.update(args)),
    count: (args = {}) => withDelegate('marketingObjective', (d) => d.count(args)),
  },
  campaign: {
    create: (data) => withDelegate('marketingCampaign', (d) => d.create({ data })),
    findMany: (args = {}) => withDelegate('marketingCampaign', (d) => d.findMany(args)),
    findFirst: (args) => withDelegate('marketingCampaign', (d) => d.findFirst(args)),
    findUnique: (args) => withDelegate('marketingCampaign', (d) => d.findUnique(args)),
    update: (args) => withDelegate('marketingCampaign', (d) => d.update(args)),
    count: (args = {}) => withDelegate('marketingCampaign', (d) => d.count(args)),
  },
  content: {
    create: (data) => withDelegate('marketingContentItem', (d) => d.create({ data })),
    findMany: (args = {}) => withDelegate('marketingContentItem', (d) => d.findMany(args)),
    findFirst: (args) => withDelegate('marketingContentItem', (d) => d.findFirst(args)),
    findUnique: (args) => withDelegate('marketingContentItem', (d) => d.findUnique(args)),
    update: (args) => withDelegate('marketingContentItem', (d) => d.update(args)),
    count: (args = {}) => withDelegate('marketingContentItem', (d) => d.count(args)),
  },
  version: {
    create: (data) => withDelegate('marketingContentVersion', (d) => d.create({ data })),
    findMany: (args = {}) => withDelegate('marketingContentVersion', (d) => d.findMany(args)),
  },
  approval: {
    create: (data) => withDelegate('marketingApproval', (d) => d.create({ data })),
    findMany: (args = {}) => withDelegate('marketingApproval', (d) => d.findMany(args)),
    findFirst: (args) => withDelegate('marketingApproval', (d) => d.findFirst(args)),
    update: (args) => withDelegate('marketingApproval', (d) => d.update(args)),
    updateMany: (args) => withDelegate('marketingApproval', (d) => d.updateMany(args)),
  },
  publication: {
    create: (data) => withDelegate('marketingPublication', (d) => d.create({ data })),
    findUnique: (args) => withDelegate('marketingPublication', (d) => d.findUnique(args)),
    findFirst: (args) => withDelegate('marketingPublication', (d) => d.findFirst(args)),
    findMany: (args = {}) => withDelegate('marketingPublication', (d) => d.findMany(args)),
    update: (args) => withDelegate('marketingPublication', (d) => d.update(args)),
    updateMany: (args) => withDelegate('marketingPublication', (d) => d.updateMany(args)),
  },
  engagement: {
    create: (data) => withDelegate('marketingEngagement', (d) => d.create({ data })),
    findMany: (args = {}) => withDelegate('marketingEngagement', (d) => d.findMany(args)),
    findUnique: (args) => withDelegate('marketingEngagement', (d) => d.findUnique(args)),
    findFirst: (args) => withDelegate('marketingEngagement', (d) => d.findFirst(args)),
    update: (args) => withDelegate('marketingEngagement', (d) => d.update(args)),
    count: (args = {}) => withDelegate('marketingEngagement', (d) => d.count(args)),
  },
  responseDraft: {
    create: (data) => withDelegate('marketingResponseDraft', (d) => d.create({ data })),
    findMany: (args = {}) => withDelegate('marketingResponseDraft', (d) => d.findMany(args)),
    update: (args) => withDelegate('marketingResponseDraft', (d) => d.update(args)),
  },
  attributionTouch: {
    create: (data) => withDelegate('marketingAttributionTouch', (d) => d.create({ data })),
    findMany: (args = {}) => withDelegate('marketingAttributionTouch', (d) => d.findMany(args)),
    findFirst: (args) => withDelegate('marketingAttributionTouch', (d) => d.findFirst(args)),
  },
  conversion: {
    create: (data) => withDelegate('marketingConversion', (d) => d.create({ data })),
    findMany: (args = {}) => withDelegate('marketingConversion', (d) => d.findMany(args)),
    findFirst: (args) => withDelegate('marketingConversion', (d) => d.findFirst(args)),
    count: (args = {}) => withDelegate('marketingConversion', (d) => d.count(args)),
  },
  metric: {
    create: (data) => withDelegate('marketingMetricSnapshot', (d) => d.create({ data })),
    findMany: (args = {}) => withDelegate('marketingMetricSnapshot', (d) => d.findMany(args)),
  },
  recommendation: {
    create: (data) => withDelegate('marketingRecommendation', (d) => d.create({ data })),
    findMany: (args = {}) => withDelegate('marketingRecommendation', (d) => d.findMany(args)),
  },
  operatorRun: {
    create: (data) => withDelegate('marketingOperatorRun', (d) => d.create({ data })),
    findMany: (args = {}) => withDelegate('marketingOperatorRun', (d) => d.findMany(args)),
  },
  webhookEvent: {
    create: (data) => withDelegate('marketingWebhookEvent', (d) => d.create({ data })),
    findUnique: (args) => withDelegate('marketingWebhookEvent', (d) => d.findUnique(args)),
    findFirst: (args) => withDelegate('marketingWebhookEvent', (d) => d.findFirst(args)),
    update: (args) => withDelegate('marketingWebhookEvent', (d) => d.update(args)),
    count: (args = {}) => withDelegate('marketingWebhookEvent', (d) => d.count(args)),
  },
  researchTask: {
    create: (data) => withDelegate('marketingResearchTask', (d) => d.create({ data })),
    findMany: (args = {}) => withDelegate('marketingResearchTask', (d) => d.findMany(args)),
    findUnique: (args) => withDelegate('marketingResearchTask', (d) => d.findUnique(args)),
    update: (args) => withDelegate('marketingResearchTask', (d) => d.update(args)),
  },
  researchEvidence: {
    create: (data) => withDelegate('marketingResearchEvidence', (d) => d.create({ data })),
    findMany: (args = {}) => withDelegate('marketingResearchEvidence', (d) => d.findMany(args)),
    findUnique: (args) => withDelegate('marketingResearchEvidence', (d) => d.findUnique(args)),
  },
  researchOpportunity: {
    create: (data) => withDelegate('marketingResearchOpportunity', (d) => d.create({ data })),
    findMany: (args = {}) => withDelegate('marketingResearchOpportunity', (d) => d.findMany(args)),
    findUnique: (args) => withDelegate('marketingResearchOpportunity', (d) => d.findUnique(args)),
    update: (args) => withDelegate('marketingResearchOpportunity', (d) => d.update(args)),
  },
};

export default marketingRepo;
