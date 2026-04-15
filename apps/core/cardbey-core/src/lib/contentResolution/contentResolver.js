/**
 * Content Resolution Layer — Fetch → AI Generate → Polish pipeline.
 *
 * Adds a three-step resolution chain for mission content fields.
 * Never throws — all errors return fallback content.
 * LLM provider and model are always sourced from env (never hardcoded).
 */

import { emitHealthProbe } from '../telemetry/healthProbes.js';

/** Matches common LLM preamble phrases to strip from generated text. */
const LLM_PREAMBLE_RE =
  /^(?:here(?:'s| is)(?: your)?[^.!?\n]{0,60}[.!?]\s*|sure[!,]?\s*|certainly[!,]?\s*|of course[!,]?\s*|absolutely[!,]?\s*|great[!,]?\s*)/i;

/**
 * Polish step: trim whitespace, strip LLM preamble, capitalize first letter,
 * truncate to maxLength.
 * @param {string} text
 * @param {number|undefined} maxLength
 * @returns {string}
 */
function polishContent(text, maxLength) {
  if (typeof text !== 'string') return '';
  let s = text.trim();
  // Remove LLM preamble (may repeat e.g. "Sure! Here is your slogan:")
  for (let i = 0; i < 3; i++) {
    const stripped = s.replace(LLM_PREAMBLE_RE, '').trim();
    if (stripped === s) break;
    s = stripped;
  }
  // Capitalize first letter
  if (s.length > 0) s = s[0].toUpperCase() + s.slice(1);
  // Truncate to maxLength
  if (typeof maxLength === 'number' && maxLength > 0 && s.length > maxLength) {
    s = s.slice(0, maxLength).trimEnd();
  }
  return s;
}

/**
 * Emit a reasoning line via emitContextUpdate, swallowing errors.
 * @param {Function|undefined} emitContextUpdate
 * @param {string} line
 */
async function emitLine(emitContextUpdate, line) {
  if (typeof emitContextUpdate !== 'function') return;
  await emitContextUpdate({
    reasoning_line: { line, timestamp: Date.now() },
  }).catch(() => {});
}

/**
 * Resolve content for a mission field using: Fetch → AI Generate → Polish.
 *
 * Resolution chain (in order):
 *   STEP 1 — Fetch: if existingContent length > 20, polish and return (source: 'fetched')
 *   STEP 2 — Generate: call llmGateway with a focused prompt; on failure return safe fallback
 *   STEP 3 — Polish: always applied before returning
 *
 * @param {string|null} missionId
 * @param {{
 *   type: 'hero_text'|'product_description'|'slogan'|'campaign_copy',
 *   businessName: string,
 *   businessType: string,
 *   verticalSlug: string,
 *   existingContent?: string,
 *   tone?: string,
 *   maxLength?: number,
 *   tenantKey?: string,
 * }} contentRequest
 * @param {{ emitContextUpdate?: Function }} [options]
 * @returns {Promise<{ content: string, source: 'fetched'|'generated'|'fallback' }>}
 */
export async function resolveContent(missionId, contentRequest, options = {}) {
  const {
    type = 'slogan',
    businessName = '',
    businessType = '',
    verticalSlug = '',
    existingContent,
    tone = 'professional',
    maxLength,
    tenantKey = 'content-resolver',
  } = contentRequest ?? {};

  const emitContextUpdate = options?.emitContextUpdate;

  try {
    // ── STEP 1 — Fetch ──────────────────────────────────────────────────────
    await emitLine(emitContextUpdate, '📥 Fetching existing content...');

    if (typeof existingContent === 'string' && existingContent.trim().length > 20) {
      await emitLine(emitContextUpdate, '✨ Polishing content...');
      return { content: polishContent(existingContent, maxLength), source: 'fetched' };
    }

    // ── STEP 2 — Generate ───────────────────────────────────────────────────
    await emitLine(emitContextUpdate, `✍️ Generating ${type}...`);

    let generated = '';
    try {
      const { llmGateway } = await import('../llm/llmGateway.ts');
      const provider =
        typeof process.env.LLM_DEFAULT_PROVIDER === 'string' &&
        process.env.LLM_DEFAULT_PROVIDER.trim()
          ? process.env.LLM_DEFAULT_PROVIDER.trim()
          : undefined;
      const model =
        typeof process.env.LLM_DEFAULT_MODEL === 'string' &&
        process.env.LLM_DEFAULT_MODEL.trim()
          ? process.env.LLM_DEFAULT_MODEL.trim()
          : undefined;
      const maxChars = typeof maxLength === 'number' && maxLength > 0 ? maxLength : 120;
      const prompt =
        `Generate ${type} for ${businessName}, a ${businessType} business. ` +
        `Tone: ${tone}. Max ${maxChars} chars.`;

      const result = await llmGateway.generate({
        purpose: `content_resolution:${type}`,
        prompt,
        ...(provider ? { provider } : {}),
        ...(model ? { model } : {}),
        tenantKey,
        maxTokens: Math.max(60, Math.ceil((maxChars / 4) * 1.5) + 50),
        temperature: 0.4,
      });
      generated = typeof result.text === 'string' ? result.text : '';
    } catch (genErr) {
      emitHealthProbe('content_resolution_generate_error', {
        missionId: missionId ?? undefined,
        type,
        error: String(genErr?.message ?? genErr),
      });
    }

    // ── STEP 3 — Polish ─────────────────────────────────────────────────────
    await emitLine(emitContextUpdate, '✨ Polishing content...');

    if (!generated.trim()) {
      // Safe template fallback
      const fallback =
        businessName
          ? `${businessName}${businessType ? ` — ${businessType}` : ''}`
          : businessType || 'Welcome';
      return { content: polishContent(fallback, maxLength), source: 'fallback' };
    }

    return { content: polishContent(generated, maxLength), source: 'generated' };
  } catch (outerErr) {
    // Outermost safety net — never throw
    emitHealthProbe('content_resolution_error', {
      missionId: missionId ?? undefined,
      type,
      error: String(outerErr?.message ?? outerErr),
    });
    const fallback = businessName || businessType || 'Welcome';
    return { content: polishContent(fallback, maxLength), source: 'fallback' };
  }
}
