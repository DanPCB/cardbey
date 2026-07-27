// DANH: skill-round6-document
/**
 * generate_execution_summary — compose Performer-facing summary after document ingestion pipeline.
 */

import { enrichDisplayWithLivingDoc } from '../../documentIngestion/ingestionDisplayEnrichment.js';

export { enrichDisplayWithLivingDoc };

/**
 * @param {object} [input]
 */
export async function execute(input = {}) {
  // @pure-transform: composes ingestion summary from prior step outputs; no DB/API side effects by design.
  const extract = input?.extractResult && typeof input.extractResult === 'object' ? input.extractResult : {};
  const products = input?.productsResult && typeof input.productsResult === 'object' ? input.productsResult : {};
  const promos = input?.promosResult && typeof input.promosResult === 'object' ? input.promosResult : {};
  const plan = input?.planResult && typeof input.planResult === 'object' ? input.planResult : {};
  const storeId = typeof input?.storeId === 'string' ? input.storeId.trim() : '';
  const storeSlugRaw =
    typeof input?.storeSlug === 'string' && input.storeSlug.trim()
      ? input.storeSlug.trim()
      : storeId;

  const data = extract?.data && typeof extract.data === 'object' ? extract.data : {};
  const gaps = Array.isArray(data.gaps) ? data.gaps.filter((g) => String(g ?? '').trim()) : [];
  const extractedProducts = Array.isArray(data.products) ? data.products : [];

  const productCount =
    Array.isArray(products.created) ? products.created.length : Number(products.count ?? 0) || 0;
  const promoCount =
    Array.isArray(promos.created) ? promos.created.length : Number(promos.count ?? 0) || 0;
  const calendarWeeks = Array.isArray(plan.weeks)
    ? plan.weeks
    : Array.isArray(plan.calendar)
      ? plan.calendar
      : [];
  const weekCount = new Set(calendarWeeks.map((e) => String(e?.week ?? '').trim()).filter(Boolean)).size;

  const gapText = gaps.length ? gaps.join('; ') : 'none';
  const summary = `Created ${productCount} product(s), ${promoCount} campaign(s), ${weekCount || calendarWeeks.length}-week content calendar. Gaps identified: ${gapText}. Ready to publish?`;

  /** @type {string[]} */
  const nextActions = [];
  if (productCount > 0) nextActions.push('review_products');
  if (promoCount > 0) nextActions.push('activate_promotion');
  if (calendarWeeks.length > 0) nextActions.push('schedule_campaign_posts');
  if (gaps.length > 0) nextActions.push('fill_document_gaps');
  nextActions.push('publish_campaign');

  const businessName =
    String(data?.business?.name ?? data?.businessName ?? '').trim() || 'your store';
  const createdProductIds = Array.isArray(products.created) ? products.created.filter(Boolean) : [];

  /** @type {Array<{ name?: string, urgency?: string, channel?: string }>} */
  let campaignsForDisplay = [];
  const promoRows = Array.isArray(promos.promos) ? promos.promos : [];
  if (promoRows.length) {
    campaignsForDisplay = promoRows.map((row) => ({
      name: String(row?.title ?? row?.name ?? '').trim() || undefined,
      urgency:
        row?.urgencyDays != null
          ? `${row.urgencyDays} day(s) until event`
          : typeof row?.urgency === 'string'
            ? row.urgency
            : undefined,
      channel: typeof row?.channel === 'string' ? row.channel : undefined,
    }));
  } else {
    const docCampaign = data?.campaign && typeof data.campaign === 'object' ? data.campaign : null;
    const extractedCampaigns = Array.isArray(data.campaigns) ? data.campaigns : [];
    campaignsForDisplay = extractedCampaigns.map((c) => ({
      name: String(c?.name ?? '').trim() || undefined,
      urgency: typeof c?.urgency === 'string' ? c.urgency : undefined,
      channel: typeof c?.channel === 'string' ? c.channel : undefined,
    }));
    if (docCampaign && String(docCampaign.name ?? '').trim()) {
      campaignsForDisplay.unshift({
        name: String(docCampaign.name).trim(),
        urgency: typeof docCampaign.urgency === 'string' ? docCampaign.urgency : undefined,
        channel: typeof docCampaign.channel === 'string' ? docCampaign.channel : undefined,
      });
    }
  }

  let display = {
    type: 'document_ingestion_result',
    business: {
      name: data?.business?.name ?? data?.businessName ?? null,
      membership: data?.business?.membership ?? null,
      contacts: Array.isArray(data.contacts) ? data.contacts : [],
    },
    products: extractedProducts.map((product, index) => ({
      name: product?.name ?? null,
      price: product?.pricing?.[0]?.price ?? product?.price ?? null,
      currency: product?.pricing?.[0]?.currency ?? product?.currency ?? 'AUD',
      location: product?.location ?? null,
      dates: product?.dates ?? null,
      deadline: product?.deadline ?? null,
      productId: createdProductIds[index] ?? null,
    })),
    campaigns: campaignsForDisplay.filter((c) => c.name),
    calendar: calendarWeeks,
    storeUrl: storeSlugRaw ? `/s/${storeSlugRaw}` : null,
    storeId: storeId || null,
    nextActions: [
      { label: 'Publish to storefront', intent: 'publish_store', storeId: storeId || null },
      { label: 'Generate promo video', intent: 'generate_hero_video', storeId: storeId || null },
      { label: 'Activate campaigns', intent: 'activate_campaigns', storeId: storeId || null },
    ],
  };

  const livingDocResult =
    input?.livingDocResult && typeof input.livingDocResult === 'object' ? input.livingDocResult : null;
  if (livingDocResult) {
    display = enrichDisplayWithLivingDoc(display, livingDocResult);
  }

  const suitcaseMetadata = {
    storeId: storeId || null,
    storeSlug: livingDocResult?.slug ?? storeSlugRaw ?? null,
    type: 'document_ingestion',
    linkedTo: 'store_analytics',
    productsCreated: productCount,
    campaignsCreated: promoCount,
    calendarWeeks: weekCount || calendarWeeks.length,
  };

  return {
    status: 'ok',
    output: {
      summary,
      nextActions,
      gaps,
      counts: {
        products: productCount,
        campaigns: promoCount,
        calendarEntries: calendarWeeks.length,
        weeks: weekCount || calendarWeeks.length,
      },
      display,
      suitcaseMetadata,
    },
  };
}

export default execute;
