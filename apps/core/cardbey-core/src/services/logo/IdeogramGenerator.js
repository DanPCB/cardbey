/**
 * Ideogram logo generator (wordmark / text-heavy logos).
 * POST https://api.ideogram.ai/generate (legacy)
 * Env: IDEOGRAM_API_KEY
 *
 * Live response: { created, data: [{ url, prompt, resolution, is_image_safe, seed, ... }] }
 */
import { randomUUID } from 'crypto';
import { LogoGenerationError, normalizeLogoGenerationResult, isValidLogoGenerationResult } from './LogoGenerationResult.js';
import { buildWordmarkPrompt } from './logoPrompt.js';

export const source = 'ideogram';

const IDEOGRAM_GENERATE_URL = 'https://api.ideogram.ai/generate';

export function isConfigured() {
  return Boolean(process.env.IDEOGRAM_API_KEY && process.env.IDEOGRAM_API_KEY.trim());
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
  const apiKey = process.env.IDEOGRAM_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new LogoGenerationError(source);
  }

  const prompt = buildWordmarkPrompt(params);

  const res = await fetch(IDEOGRAM_GENERATE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Api-Key': apiKey.trim(),
    },
    body: JSON.stringify({
      image_request: {
        prompt,
        model: 'V_2',
        magic_prompt_option: 'AUTO',
        style_type: 'DESIGN',
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ideogram API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const item = Array.isArray(data?.data) ? data.data[0] : null;
  const imageUrl = typeof item?.url === 'string' ? item.url.trim() : '';

  const result = normalizeLogoGenerationResult({
    id: item?.response_id != null ? String(item.response_id) : randomUUID(),
    source,
    prompt,
    image_url: imageUrl,
    format: 'png',
    width: 1024,
    height: 1024,
    style: params.style || 'wordmark',
    created_at: data?.created || new Date().toISOString(),
  });

  if (!isValidLogoGenerationResult(result)) {
    throw new Error('Ideogram returned no image URL');
  }

  return result;
}

export default { source, isConfigured, generate };
