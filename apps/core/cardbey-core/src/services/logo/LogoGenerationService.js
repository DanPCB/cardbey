/**
 * LogoGenerationService — routes generation to Recraft or Ideogram with fallback.
 */
import * as RecraftGenerator from './RecraftGenerator.js';
import * as IdeogramGenerator from './IdeogramGenerator.js';
import { LogoGenerationError } from './LogoGenerationResult.js';

export const generators = {
  recraft: RecraftGenerator,
  ideogram: IdeogramGenerator,
};

/**
 * @param {string} [preferredSource]
 * @returns {'recraft' | 'ideogram'}
 */
export function resolveGeneratorKey(preferredSource, params = {}) {
  const pref = String(preferredSource || 'auto').toLowerCase();
  if (pref === 'recraft' || pref === 'ideogram') return pref;
  const style = String(params.style || '').toLowerCase();
  if (style === 'wordmark') return 'ideogram';
  return 'recraft';
}

/**
 * @param {{
 *   storeName?: string,
 *   industry?: string,
 *   style?: string,
 *   colors?: string,
 *   description?: string,
 * }} params
 * @param {'recraft' | 'ideogram' | 'auto'} [preferredSource]
 * @returns {Promise<{
 *   ok: boolean,
 *   result?: object,
 *   source?: string,
 *   error?: { code: string, message: string },
 *   tried?: string[],
 * }>}
 */
export async function generate(params, preferredSource = 'auto') {
  const primary = resolveGeneratorKey(preferredSource, params);
  const fallback = primary === 'recraft' ? 'ideogram' : 'recraft';
  const order = primary === fallback ? [primary] : [primary, fallback];
  const tried = [];
  const errors = {};

  for (const key of order) {
    const gen = generators[key];
    if (!gen?.isConfigured?.()) {
      errors[key] = `${key} not configured`;
      tried.push(key);
      continue;
    }

    tried.push(key);
    try {
      const result = await gen.generate(params);
      return { ok: true, result, source: key, tried, errors };
    } catch (err) {
      if (err instanceof LogoGenerationError) {
        errors[key] = err.message;
        console.warn(`[LogoGenerationService] ${key} not configured — skipping`);
        continue;
      }
      const message = err?.message || String(err);
      errors[key] = message;
      console.warn(`[LogoGenerationService] ${key} failed: ${message}`);
    }
  }

  const allUnconfigured = Object.values(errors).every((m) =>
    String(m).toLowerCase().includes('not configured')
  );

  return {
    ok: false,
    tried,
    errors,
    error: {
      code: allUnconfigured ? 'LOGO_GENERATION_NOT_CONFIGURED' : 'LOGO_GENERATION_FAILED',
      message:
        allUnconfigured
          ? 'Logo generation is not configured. Add RECRAFT_API_KEY or IDEOGRAM_API_KEY.'
          : 'Logo generation failed for all configured providers.',
    },
  };
}

export default { generators, generate, resolveGeneratorKey };
