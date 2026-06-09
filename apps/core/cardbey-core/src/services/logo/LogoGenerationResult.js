/**
 * Shared LogoGenerationResult schema for AI logo generators (Recraft, Ideogram).
 */

export class LogoGenerationError extends Error {
  /** @param {string} source Generator key (e.g. "recraft") */
  constructor(source, message) {
    super(message || `Logo generation not configured: ${source}`);
    this.name = 'LogoGenerationError';
    this.code = 'LOGO_GENERATION_NOT_CONFIGURED';
    this.source = source;
  }
}

/**
 * @param {Partial<Record<string, unknown>>} raw
 */
export function normalizeLogoGenerationResult(raw = {}) {
  const fmt = String(raw.format || 'png').toLowerCase();
  return {
    id: raw.id != null ? String(raw.id) : '',
    source: raw.source != null ? String(raw.source) : '',
    prompt: raw.prompt != null ? String(raw.prompt) : '',
    image_url: raw.image_url != null ? String(raw.image_url) : '',
    format: fmt === 'svg' ? 'svg' : 'png',
    width: Number.isFinite(Number(raw.width)) ? Number(raw.width) : 1024,
    height: Number.isFinite(Number(raw.height)) ? Number(raw.height) : 1024,
    style: raw.style != null ? String(raw.style) : 'vector',
    created_at: raw.created_at != null ? String(raw.created_at) : new Date().toISOString(),
  };
}

/** @param {{ image_url?: string, id?: string }} result */
export function isValidLogoGenerationResult(result) {
  return Boolean(result && result.id && result.image_url);
}
