/**
 * Store tool: analyze_store.
 * Input: { storeId }. Output: high-level store stats for missions plus findings/suggestions.
 * When analysis completes, fires inferOpportunities (LLM-inferred opportunities) — fire-and-forget.
 */

import { getPrismaClient } from '../../../lib/prisma.js';
import { inferOpportunities } from '../../opportunities/inferOpportunities.js';

/**
 * @param {object} input
 * @param {string} [input.storeId]
 * @param {object} [context]
 * @param {object} [context.storeName]
 * @param {object} [context.storeType]
 * @param {number} [context.productCount]
 * @param {string} [context.tenantId]
 * @param {string} [context.storeId]
 * @returns {Promise<{ status: 'ok' | 'failed', output?: { storeId?: string | null, productCount?: number, categoryCount?: number, hasImages?: boolean, publishStatus?: string, summary?: string, findings: unknown[], suggestions: unknown[] }, error?: { code: string, message: string } }>}
 */
export async function execute(input = {}, context = {}) {
  const storeId = input?.storeId ?? context?.storeId;
  if (!storeId || typeof storeId !== 'string') {
    return {
      status: 'ok',
      output: {
        storeId: null,
        storeName: context?.storeName ?? 'Store',
        storeType: context?.storeType ?? 'retail',
        productCount: 0,
        categoryCount: 0,
        hasImages: false,
        publishStatus: 'unknown',
        summary: 'storeId missing; returning empty analysis',
        findings: [],
        suggestions: [],
      },
    };
  }

  const prisma = getPrismaClient();

  try {
    const store = await prisma.business.findUnique({
      where: { id: storeId },
    });

    if (!store) {
      const output = {
        storeId,
        storeName: context?.storeName ?? 'Store',
        storeType: context?.storeType ?? 'retail',
        productCount: 0,
        categoryCount: 0,
        hasImages: false,
        publishStatus: 'missing',
        summary: 'Store not found; no products to analyse.',
        findings: [],
        suggestions: [],
      };
      return { status: 'ok', output };
    }

    const products = await prisma.product.findMany({
      where: { businessId: storeId, deletedAt: null },
    });

    const productCount = products.length;
    const categorySet = new Set(
      products
        .map((p) => (p.category != null ? String(p.category).trim() : ''))
        .filter(Boolean),
    );
    const categoryCount = categorySet.size;
    const hasImages = products.some(
      (p) =>
        (p.imageUrl && String(p.imageUrl).trim().length > 0) ||
        (Array.isArray(p.images) && p.images.length > 0),
    );
    const publishStatus = store.publishedAt ? 'published' : 'draft';

    const summaryParts = [
      `Store has ${productCount} product${productCount === 1 ? '' : 's'}`,
    ];
    if (categoryCount > 0) {
      summaryParts.push(`across ${categoryCount} categor${categoryCount === 1 ? 'y' : 'ies'}`);
    }
    summaryParts.push(hasImages ? 'with images.' : 'without images.');

    const output = {
      storeId,
      storeName: context?.storeName ?? store.name ?? 'Store',
      storeType: context?.storeType ?? store.type ?? 'retail',
      productCount,
      categoryCount,
      hasImages,
      publishStatus,
      summary: summaryParts.join(' '),
      findings: [],
      suggestions: [],
    };

    const storeAnalysis = {
      storeName: context?.storeName ?? store.name ?? 'Store',
      storeType: context?.storeType ?? store.type ?? 'retail',
      productCount,
      issues: Array.isArray(output.findings) ? output.findings : [],
      missing: Array.isArray(output.suggestions) ? output.suggestions : [],
    };

    const tenantKey = context?.tenantId ?? context?.storeId ?? storeId;
    inferOpportunities(prisma, storeId, storeAnalysis, tenantKey).catch((e) =>
      console.error('[inferOpportunities]', e),
    );

    return {
      status: 'ok',
      output,
    };
  } catch (err) {
    console.error('[analyze_store] executor error:', err);
    return {
      status: 'failed',
      error: {
        code: 'EXECUTOR_ERROR',
        message: err?.message ?? 'Unknown analyze_store error',
      },
    };
  }
}
