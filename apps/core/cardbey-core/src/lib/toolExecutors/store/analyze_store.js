/**
 * Store tool: analyze_store.
 * Input: { storeId }. Output: high-level store stats for missions plus findings/suggestions.
 * When analysis completes, fires inferOpportunities (LLM-inferred opportunities) — fire-and-forget.
 */

import { getPrismaClient } from '../../../lib/prisma.js';
import { inferOpportunities } from '../../opportunities/inferOpportunities.js';
import { getDraft, getDraftByGenerationRunId } from '../../../services/draftStore/draftStoreService.js';

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
function parseDraftPreviewItems(preview) {
  if (!preview) return [];
  let p = preview;
  if (typeof p === 'string') {
    try {
      p = JSON.parse(p);
    } catch {
      return [];
    }
  }
  if (!p || typeof p !== 'object') return [];
  const items = Array.isArray(p.items) ? p.items : [];
  return items;
}

export async function execute(input = {}, context = {}) {
  const storeId =
    input?.storeId ??
    context?.storeId ??
    context?.outputs?.storeId ??
    context?.outputs?.structured_store_build?.storeId ??
    null;

  if (!storeId || typeof storeId !== 'string') {
    const generationRunId =
      input?.generationRunId ??
      context?.generationRunId ??
      context?.outputs?.generationRunId ??
      context?.outputs?.structured_store_build?.generationRunId ??
      null;

    const draftId =
      input?.draftId ??
      context?.draftId ??
      context?.outputs?.draftId ??
      context?.outputs?.structured_store_build?.draftId ??
      null;

    const buildDraftAnalysisOutput = (draft, preview) => {
      const draftInput =
        typeof draft?.input === 'string'
          ? (() => {
              try {
                return JSON.parse(draft.input);
              } catch {
                return {};
              }
            })()
          : draft?.input ?? {};
      const items = parseDraftPreviewItems(preview);
      const categories = Array.isArray(preview.categories) ? preview.categories : [];
      const productCount = items.length;
      const categoryCount = categories.length;
      const hasImages = items.some(
        (it) =>
          it &&
          typeof it === 'object' &&
          typeof it.imageUrl === 'string' &&
          it.imageUrl.trim().length > 0,
      );
      const businessName =
        context?.businessName ??
        context?.storeName ??
        preview.storeName ??
        preview.meta?.storeName ??
        draftInput.businessName ??
        draftInput.storeName ??
        'Your store';
      const storeType =
        context?.businessType ??
        context?.storeType ??
        preview.storeType ??
        draftInput.businessType ??
        'retail';
      return {
        status: 'ok',
        output: {
          storeId: draft?.committedStoreId ?? null,
          draftId: draft?.id ?? null,
          storeName: businessName,
          storeType,
          productCount,
          categoryCount,
          hasImages,
          publishStatus: 'draft',
          source: 'draft',
          summary:
            productCount > 0
              ? `${businessName} is ready with ${productCount} product${productCount === 1 ? '' : 's'}`
              : `${businessName} draft is ready`,
          findings: [],
          suggestions: [],
        },
      };
    };

    const resolvePreview = (draft) => {
      if (!draft) return null;
      const preview =
        typeof draft.preview === 'string'
          ? (() => {
              try {
                return JSON.parse(draft.preview);
              } catch {
                return {};
              }
            })()
          : draft.preview ?? {};
      return buildDraftAnalysisOutput(draft, preview);
    };

    if (generationRunId && typeof generationRunId === 'string') {
      try {
        const draft = await getDraftByGenerationRunId(generationRunId.trim());
        const out = resolvePreview(draft);
        if (out) return out;
      } catch (err) {
        console.warn('[analyze_store] generationRunId draft lookup failed', err?.message ?? err);
      }
    }

    if (draftId && typeof draftId === 'string') {
      try {
        const draft = await getDraft(draftId.trim());
        const out = resolvePreview(draft);
        if (out) return out;
      } catch (err) {
        console.warn('[analyze_store] draftId lookup failed', err?.message ?? err);
      }
    }

    return {
      status: 'ok',
      output: {
        storeId: null,
        storeName: context?.businessName ?? context?.storeName ?? 'Your store',
        storeType: context?.businessType ?? context?.storeType ?? 'retail',
        productCount: 0,
        categoryCount: 0,
        hasImages: false,
        publishStatus: 'draft',
        source: 'none',
        summary: 'Store draft created successfully.',
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
    inferOpportunities(prisma, storeId, storeAnalysis, tenantKey).then((res) => {
      if (res?.reason === 'table_missing') return;
      if (res?.ok === false) {
        console.warn('[inferOpportunities]', res.reason, res.error || '');
      }
    });

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
