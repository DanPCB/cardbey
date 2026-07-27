/**
 * Shared prompt builder for logo generation.
 * @param {{
 *   storeName?: string,
 *   industry?: string,
 *   style?: string,
 *   colors?: string,
 *   description?: string,
 * }} params
 */
export function buildLogoPrompt(params = {}) {
  const storeName = String(params.storeName || 'Business').trim();
  const industry = String(params.industry || 'business').trim();
  const style = String(params.style || 'vector').trim();
  const colors = String(params.colors || '').trim();
  const description = String(params.description || '').trim();
  const colorPart = colors ? `Colors: ${colors}.` : '';
  const descPart = description ? description : '';
  return (
    `Professional logo for ${storeName}, a ${industry} business. ` +
    `Style: ${style}. ${colorPart} ${descPart} ` +
    'Clean vector design, suitable for business branding.'
  ).replace(/\s+/g, ' ').trim();
}

/**
 * @param {{
 *   storeName?: string,
 *   industry?: string,
 *   style?: string,
 *   colors?: string,
 *   description?: string,
 * }} params
 */
export function buildWordmarkPrompt(params = {}) {
  const storeName = String(params.storeName || 'Business').trim();
  const industry = String(params.industry || 'business').trim();
  const style = String(params.style || 'wordmark').trim();
  const colors = String(params.colors || '').trim();
  const description = String(params.description || '').trim();
  const colorPart = colors ? `Color palette: ${colors}.` : '';
  const descPart = description ? description : '';
  return (
    `Minimalist logo design for '${storeName}', ${industry}. ` +
    `${style} style. ${colorPart} ${descPart} ` +
    'Professional, scalable, clean typography.'
  ).replace(/\s+/g, ' ').trim();
}
