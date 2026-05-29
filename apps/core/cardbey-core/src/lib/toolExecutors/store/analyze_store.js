/**
 * Store tool: analyze_store.
 * Input: { storeId }. Output: high-level store stats for missions plus findings/suggestions.
 * When analysis completes, fires inferOpportunities (LLM-inferred opportunities) — fire-and-forget.
 */

import { getPrismaClient } from '../../../lib/prisma.js';
import { inferOpportunities } from '../../opportunities/inferOpportunities.js';
import { normalizeLocale } from '../../localePrompt.js';
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

function priorStructuredBuildOutput(context = {}) {
  const stepOut = context?.stepOutputs?.structured_store_build;
  if (stepOut && typeof stepOut === 'object') {
    return stepOut.output && typeof stepOut.output === 'object' ? stepOut.output : stepOut;
  }
  const legacy = context?.outputs?.structured_store_build;
  if (legacy && typeof legacy === 'object') {
    return legacy.output && typeof legacy.output === 'object' ? legacy.output : legacy;
  }
  return null;
}

export async function execute(input = {}, context = {}) {
  const buildOut = priorStructuredBuildOutput(context);
  const missionId = context?.missionId ?? null;

  const storeId =
    input?.storeId ??
    context?.storeId ??
    buildOut?.storeId ??
    context?.outputs?.storeId ??
    context?.outputs?.structured_store_build?.storeId ??
    null;

  const generationRunIdForLog =
    input?.generationRunId ??
    context?.generationRunId ??
    buildOut?.generationRunId ??
    context?.outputs?.generationRunId ??
    null;
  const draftIdForLog =
    input?.draftId ?? context?.draftId ?? buildOut?.draftId ?? context?.outputs?.draftId ?? null;

  console.log('[analyze_store] START', {
    missionId,
    storeId: storeId || null,
    generationRunId: generationRunIdForLog,
    draftId: draftIdForLog,
    hasStepOutputs: Boolean(context?.stepOutputs?.structured_store_build),
    path: storeId ? 'storeId' : 'draft',
  });

  if (!storeId || typeof storeId !== 'string') {
    const generationRunId =
      input?.generationRunId ??
      context?.generationRunId ??
      buildOut?.generationRunId ??
      context?.outputs?.generationRunId ??
      context?.outputs?.structured_store_build?.generationRunId ??
      null;

    const draftId =
      input?.draftId ??
      context?.draftId ??
      buildOut?.draftId ??
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

    let products = await prisma.product.findMany({
      where: { businessId: storeId, deletedAt: null },
    });

    const generationRunId =
      input?.generationRunId ??
      context?.generationRunId ??
      buildOut?.generationRunId ??
      context?.outputs?.generationRunId ??
      context?.outputs?.structured_store_build?.generationRunId ??
      null;

    if (products.length === 0) {
      const draftIdForFallback =
        input?.draftId ??
        context?.draftId ??
        buildOut?.draftId ??
        context?.outputs?.draftId ??
        null;

      const tryDraftFallback = async (draft, source) => {
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
        const items = parseDraftPreviewItems(preview);
        if (items.length === 0) return null;
        const draftInput =
          typeof draft.input === 'string'
            ? (() => {
                try {
                  return JSON.parse(draft.input);
                } catch {
                  return {};
                }
              })()
            : draft.input ?? {};
        const productCount = items.length;
        const categories = Array.isArray(preview.categories) ? preview.categories : [];
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
          store.name ??
          'Your store';
        const storeType =
          context?.businessType ??
          context?.storeType ??
          preview.storeType ??
          draftInput.businessType ??
          store.type ??
          'retail';
        console.log('[analyze_store] using draft item count fallback:', {
          source,
          storeId,
          productCount,
          hasImages,
        });
        return {
          status: 'ok',
          output: {
            storeId,
            draftId: draft.id ?? draftIdForFallback,
            storeName: businessName,
            storeType,
            productCount,
            categoryCount,
            hasImages,
            publishStatus: store.publishedAt ? 'published' : 'draft',
            source: 'draft_fallback',
            summary: `${businessName} is ready with ${productCount} product${productCount === 1 ? '' : 's'}${hasImages ? ' with images' : ''}.`,
            findings: [],
            suggestions: [],
          },
        };
      };

      if (draftIdForFallback && typeof draftIdForFallback === 'string') {
        try {
          const draft = await getDraft(draftIdForFallback.trim());
          const out = await tryDraftFallback(draft, 'draftId');
          if (out) return out;
        } catch (fallbackErr) {
          console.warn('[analyze_store] draftId fallback failed:', fallbackErr?.message ?? fallbackErr);
        }
      }

      if (generationRunId && typeof generationRunId === 'string') {
        try {
          const draft = await getDraftByGenerationRunId(generationRunId.trim());
          const out = await tryDraftFallback(draft, 'generationRunId');
          if (out) return out;
        } catch (fallbackErr) {
          console.warn('[analyze_store] generationRunId draft fallback failed:', fallbackErr?.message ?? fallbackErr);
        }
      }
    }

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
    const locale = normalizeLocale(context?.locale ?? context?.executionFrame?.locale ?? 'en');
    inferOpportunities(prisma, storeId, storeAnalysis, tenantKey, locale).then((res) => {
      if (res?.reason === 'table_missing') return;
      if (res?.ok === false) {
        console.warn('[inferOpportunities]', res.reason, res.error || '');
      }
    });

    console.log('[analyze_store] COMPLETE', {
      missionId,
      storeId,
      productCount: output.productCount,
      hasImages: output.hasImages,
      source: 'store_db',
      summary: output.summary,
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
