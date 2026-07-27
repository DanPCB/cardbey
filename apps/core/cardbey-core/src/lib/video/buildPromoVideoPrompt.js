/**
 * Build Sora prompt from store context + user request.
 */

/**
 * @param {{
 *   userPrompt?: string;
 *   store?: {
 *     name?: string;
 *     type?: string;
 *     location?: string;
 *     heroImage?: string | null;
 *     products?: Array<{ name?: string; description?: string | null }>;
 *   } | null;
 *   heroHeadline?: string | null;
 *   tagline?: string | null;
 * }} params
 */
export function buildPromoVideoPrompt(params = {}) {
  const userPrompt = String(params.userPrompt ?? '').trim();
  const store = params.store;
  const storeName = store?.name ? String(store.name).trim() : '';
  const businessType = store?.type ? String(store.type).trim() : '';
  const location = store?.location ? String(store.location).trim() : '';
  const headline = String(params.heroHeadline ?? params.tagline ?? '').trim();

  const productLines = (store?.products ?? [])
    .slice(0, 6)
    .map((p) => {
      const name = p?.name ? String(p.name).trim() : '';
      const desc = p?.description ? String(p.description).trim().slice(0, 80) : '';
      if (!name) return null;
      return desc ? `${name} (${desc})` : name;
    })
    .filter(Boolean);

  const lines = [
    'Create a short, polished promotional video for a local business.',
    storeName ? `Business name: ${storeName}.` : null,
    businessType ? `Business type: ${businessType}.` : null,
    location ? `Location: ${location}.` : null,
    headline ? `Hero message / tagline: ${headline}.` : null,
    productLines.length ? `Featured products or services: ${productLines.join('; ')}.` : null,
    'Style: warm, trustworthy, modern retail marketing; smooth camera motion; clear product focus; no on-screen text unless essential.',
    userPrompt ? `User request: ${userPrompt}` : null,
  ].filter(Boolean);

  return lines.join('\n');
}
