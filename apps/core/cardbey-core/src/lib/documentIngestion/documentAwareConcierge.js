/**
 * Document-aware system prompt for storefront concierge when ingestion context exists.
 */

/**
 * @param {object} ctx
 */
export function buildDocumentAwareSystemPrompt(ctx) {
  const data = ctx && typeof ctx === 'object' ? ctx : {};
  const businessName = String(data.business?.name ?? data.businessName ?? 'this business').trim();
  const products = Array.isArray(data.products) ? data.products : [];
  const contacts = Array.isArray(data.contacts) ? data.contacts : [];

  const productLines = products
    .map((p) => {
      const pricing = Array.isArray(p?.pricing)
        ? p.pricing
            .map((pr) => `${pr?.tier ? `${pr.tier} ` : ''}$${pr?.price ?? '?'} ${pr?.currency ?? 'AUD'}`)
            .join(', ')
        : p?.price != null
          ? `$${p.price} ${p?.currency ?? 'AUD'}`
          : '';
      const includes = Array.isArray(p?.includes) ? p.includes.join(', ') : '';
      return `${p?.name ?? 'Product'}: ${pricing}. Dates: ${p?.dates ?? 'TBC'}. Includes: ${includes}.`;
    })
    .join('\n');

  const contactLines = contacts
    .map((c) => `${c?.name ?? 'Contact'}: ${c?.phone ?? ''} / ${c?.email ?? ''}`.trim())
    .join('\n');

  return [
    `You are the AI assistant for ${businessName}.`,
    'You have full knowledge of these offerings:',
    productLines || '(No product details on file.)',
    '',
    `To speak with the team: ${contactLines || 'Ask the user to leave their contact details.'}`,
    '',
    'When users ask about pricing, dates, or what is included, answer directly from the above.',
    'When users want to book, show the booking button and offer to connect them with the team.',
  ].join('\n');
}

/**
 * @param {unknown} storefrontSettings
 */
export function parseDocumentIngestionContext(storefrontSettings) {
  if (!storefrontSettings || typeof storefrontSettings !== 'object' || Array.isArray(storefrontSettings)) {
    return null;
  }
  const ingestion = /** @type {{ documentIngestion?: object }} */ (storefrontSettings).documentIngestion;
  if (!ingestion || typeof ingestion !== 'object') return null;
  const extracted = ingestion.extractedData;
  if (!extracted || typeof extracted !== 'object') return null;
  return {
    business: extracted.business ?? { name: extracted.businessName ?? null },
    products: Array.isArray(extracted.products) ? extracted.products : [],
    contacts: Array.isArray(extracted.contacts) ? extracted.contacts : [],
    campaign: extracted.campaign ?? null,
    source: 'document_ingestion',
    miScenes: Array.isArray(ingestion.miScenes) ? ingestion.miScenes : [],
    livingDocument: ingestion.livingDocument ?? null,
  };
}
