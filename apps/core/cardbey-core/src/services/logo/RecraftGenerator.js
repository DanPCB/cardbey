/**
 * Recraft AI logo generator (vector / icon).
 * POST https://external.api.recraft.ai/v1/images/generations
 * Env: RECRAFT_API_KEY
 */
import { randomUUID } from 'crypto';
import { LogoGenerationError, normalizeLogoGenerationResult, isValidLogoGenerationResult } from './LogoGenerationResult.js';
import { buildLogoPrompt } from './logoPrompt.js';

export const source = 'recraft';

const RECRAFT_GENERATIONS_URL = 'https://external.api.recraft.ai/v1/images/generations';

export function isConfigured() {
  return Boolean(process.env.RECRAFT_API_KEY && process.env.RECRAFT_API_KEY.trim());
}

/**
 * @param {{
 *   storeName?: string,
 *   industry?: string,
 *   style?: string,
 *   colors?: string,
 *   description?: string,
 * }} params
 * @returns {Promise<ReturnType<typeof normalizeLogoGenerationResult>>}
 */
export async function generate(params = {}) {
  const apiKey = process.env.RECRAFT_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new LogoGenerationError(source);
  }

  const prompt = buildLogoPrompt(params);
  const styleParam = params.style === 'icon' ? 'icon' : 'vector_illustration';

  const res = await fetch(RECRAFT_GENERATIONS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify({
      prompt,
      style: styleParam,
      response_format: 'url',
      n: 1,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Recraft API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const item = Array.isArray(data?.data) ? data.data[0] : null;
  const imageUrl = typeof item?.url === 'string' ? item.url.trim() : '';

  const result = normalizeLogoGenerationResult({
    id: item?.id != null ? String(item.id) : randomUUID(),
    source,
    prompt,
    image_url: imageUrl,
    format: 'svg',
    width: 1024,
    height: 1024,
    style: params.style || 'vector',
    created_at: new Date().toISOString(),
  });

  if (!isValidLogoGenerationResult(result)) {
    throw new Error('Recraft returned no image URL');
  }

  return result;
}

export default { source, isConfigured, generate };
