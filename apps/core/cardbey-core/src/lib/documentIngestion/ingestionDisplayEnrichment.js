/**
 * Merge living-document step output into document ingestion display (step 6 → UI).
 */

/**
 * @param {object} display
 * @param {object | null | undefined} livingDoc
 */
export function enrichDisplayWithLivingDoc(display, livingDoc) {
  if (!display || typeof display !== 'object') return display;
  const slug = typeof livingDoc?.slug === 'string' ? livingDoc.slug.trim() : '';
  const publishedUrl =
    typeof livingDoc?.publishedUrl === 'string' && livingDoc.publishedUrl.trim()
      ? livingDoc.publishedUrl.trim()
      : slug
        ? `/s/${slug}`
        : null;

  if (!publishedUrl && !slug) return display;

  const storeId = display.storeId ?? livingDoc?.storeId ?? null;
  const storefront = {
    slug: slug || null,
    url: publishedUrl,
    published: livingDoc?.livingDocumentCreated !== false,
  };

  const nextActions = Array.isArray(display.nextActions) ? [...display.nextActions] : [];
  const publishIdx = nextActions.findIndex((a) => a?.intent === 'publish_store');
  const primaryAction = {
    label: storefront.published ? 'View living document' : 'Publish to storefront',
    url: storefront.url,
    intent: storefront.published ? null : 'publish_store',
    storeId,
    primary: true,
  };
  if (publishIdx >= 0) {
    nextActions[publishIdx] = { ...nextActions[publishIdx], ...primaryAction };
  } else {
    nextActions.unshift(primaryAction);
  }

  return {
    ...display,
    storefront,
    storeUrl: publishedUrl ?? display.storeUrl ?? null,
    nextActions,
  };
}

/**
 * @param {Record<string, unknown>} stepResults
 * @param {(step: Record<string, unknown> | null) => Record<string, unknown> | null} unwrapStepOutput
 * @param {(results: Record<string, unknown>, ...keys: string[]) => Record<string, unknown> | null} getStep
 */
export function mergeIngestionDisplayFromStepResults(stepResults, unwrapStepOutput, getStep) {
  const summaryOut = unwrapStepOutput(getStep(stepResults, 'generate_execution_summary'));
  const display = summaryOut?.display;
  if (!display || typeof display !== 'object') return null;
  const livingOut = unwrapStepOutput(getStep(stepResults, 'generate_living_document'));
  if (!livingOut || typeof livingOut !== 'object') return display;
  return enrichDisplayWithLivingDoc(display, livingOut);
}
