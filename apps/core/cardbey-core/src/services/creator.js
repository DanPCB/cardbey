/**
 * Deterministic poster generator stub.
 * @param {{ productName: string, discountPct: number }} input
 * @returns {Promise<{ imageUrl: string, caption: string }>}
 */
export async function generatePoster(input) {
  const caption = `${input.productName} — hôm nay giảm ${input.discountPct}%!`;
  const imageUrl = '/static/posters/placeholder.png';
  return { imageUrl, caption };
}

