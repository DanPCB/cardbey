/**
 * Promotion tool: create_promotion (campaign runway Phase A).
 * Scores catalog products against Step 1 market research; owner confirms via POST .../proactive-step/confirm (Phase B).
 */

import { getPrismaClient } from '../../../lib/prisma.js';

export async function execute(input = {}, context = {}) {
  const rawStore = input?.storeId ?? context?.storeId;
  const storeId =
    typeof rawStore === 'string' ? rawStore.trim() : rawStore != null ? String(rawStore).trim() : '';

  if (!storeId) {
    return {
      status: 'failed',
      error: {
        code: 'STORE_ID_REQUIRED',
        message: 'create_promotion requires storeId',
      },
    };
  }

  const start = Date.now();

  try {
    const { scoreProductsForCampaign } = await import('../../../services/promotionProductScorer.js');

    const stepOut = context?.stepOutputs && typeof context.stepOutputs === 'object' ? context.stepOutputs : {};
    const cr = stepOut.campaign_research && typeof stepOut.campaign_research === 'object' ? stepOut.campaign_research : {};
    const mr = stepOut.market_research && typeof stepOut.market_research === 'object' ? stepOut.market_research : {};
    let marketReport =
      (cr.marketReport && typeof cr.marketReport === 'object' ? cr.marketReport : null) ??
      (mr.marketReport && typeof mr.marketReport === 'object' ? mr.marketReport : null) ??
      (input?.marketReport && typeof input.marketReport === 'object' ? input.marketReport : {}) ??
      {};

    const priorSteps =
      typeof input?.priorStepsContext === 'string' && input.priorStepsContext.trim()
        ? input.priorStepsContext.trim().slice(0, 8000)
        : '';
    // Scoring-only merge: enriches LLM/scorer signals but is not surfaced on promotion UI as an audit trail.
    if (priorSteps) {
      const baseSummary = String(marketReport?.summary ?? '').trim();
      marketReport = {
        ...marketReport,
        summary: [baseSummary, `Prior mission steps:\n${priorSteps}`].filter(Boolean).join('\n\n'),
      };
    }

    const recommendations = await scoreProductsForCampaign(storeId, marketReport, 3);

    const ownerImageRaw = input?.imageDataUrl;
    const ownerProvidedProductImageDataUrl =
      typeof ownerImageRaw === 'string' && ownerImageRaw.trim() ? ownerImageRaw.trim() : '';

    if (process.env.NODE_ENV !== 'production') {
      console.log('[create_promotion] Phase A: scored products', {
        storeId,
        count: recommendations.length,
        ownerImage: Boolean(ownerProvidedProductImageDataUrl),
      });
    }

    return {
      status: 'ok',
      output: {
        phase: 'awaiting_product_selection',
        recommendations,
        marketReport,
        storeId,
        ...(ownerProvidedProductImageDataUrl
          ? { ownerProvidedProductImageDataUrl }
          : {}),
        message: recommendations.length
          ? `Found ${recommendations.length} products for promotion`
          : 'No published products found — please add products first',
        durationMs: Date.now() - start,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[create_promotion]', message);
    return {
      status: 'failed',
      error: { code: 'SCORER_FAILED', message },
      output: { durationMs: Date.now() - start },
    };
  }
}
