// AUDIT: rewrite_descriptions at store/rewrite_descriptions.js — LLM-based; this is template rewrite (max 3)
// DANH: skill-round4-content
/**
 * rewrite_content_copy — improved descriptions without persistence (max 3 products).
 * Side effect: none — pure generation; caller must confirm before persisting.
 */

const MAX_REWRITES = 3;

/**
 * @param {string} name
 * @param {string | null | undefined} original
 * @param {string} [brandTone]
 * @returns {string}
 */
export function rewriteProductDescription(name, original, brandTone) {
  const productName = String(name ?? 'This item').trim() || 'This item';
  const base = String(original ?? productName).trim();
  const tone = String(brandTone ?? 'friendly').trim().toLowerCase();
  const lead =
    tone === 'luxury'
      ? `Treat yourself to ${productName} —`
      : `Enjoy ${productName} —`;
  const benefit = base.length > 20 ? base.slice(0, 120) : `crafted for everyday ${tone} moments`;
  return `${lead} ${benefit}.`.replace(/\s+/g, ' ').trim();
}

/**
 * @param {object} [input]
 */
export async function execute(input = {}) {
  // @pure-transform: deterministic copy rewrite; no DB/API side effects by design.
  const products = Array.isArray(input?.products) ? input.products : [];
  const brandTone = typeof input?.brandTone === 'string' ? input.brandTone : null;
  const businessCategory =
    typeof input?.businessCategory === 'string' ? input.businessCategory : null;

  const slice = products.slice(0, MAX_REWRITES);
  const rewrites = slice.map((p) => {
    const original = p?.description ?? null;
    const improved = rewriteProductDescription(
      p?.name,
      original,
      brandTone ?? businessCategory ?? 'friendly',
    );
    return {
      id: p?.id ?? null,
      name: p?.name ?? '',
      original,
      improved,
    };
  });

  return {
    status: 'ok',
    output: {
      rewrites,
      truncated: products.length > MAX_REWRITES,
      rewriteCount: rewrites.length,
    },
  };
}

export default execute;
