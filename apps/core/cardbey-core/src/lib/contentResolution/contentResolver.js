/**
 * Content Resolution Layer — Fetch → AI Generate → Polish pipeline.
 *
 * Adds a three-step resolution chain for mission content fields.
 * Never throws — all errors return fallback content.
 * LLM provider and model are always sourced from env (never hardcoded).
 */

import { emitHealthProbe } from '../telemetry/healthProbes.js';
import {
  sanitizeStoreSlogan,
  normalizeAndValidateSlogan,
  looksLikeSloganMeta,
} from './sanitizeStoreSlogan.js';

/** Matches common LLM preamble phrases to strip from generated text. */
const LLM_PREAMBLE_RE =
  /^(?:here(?:'s| is)(?: your)?[^.!?\n]{0,60}[.!?]\s*|sure[!,]?\s*|certainly[!,]?\s*|of course[!,]?\s*|absolutely[!,]?\s*|great[!,]?\s*)/i;

const SLOGAN_STRICT_CONTRACT = `Generate one concise customer-facing business slogan based on the supplied business context.

Return ONLY JSON of the form: {"tagline":"<slogan text>"}

Rules for the tagline value:
- Return ONLY the slogan text inside the JSON string.
- Do not explain your answer.
- Do not introduce the slogan.
- Do not say 'slogan', 'tagline', 'professional slogan', 'top pick', 'suggestion', 'recommended', or similar.
- Do not include the business name as a prefix.
- Do not use quotation marks inside the slogan unless they are a natural part of the brand phrase.
- Do not use markdown.
- Do not use bullets.
- Do not return multiple options.
- Do not add commentary before or after the slogan.`;

/**
 * Polish step: trim whitespace, strip LLM preamble/list tips, capitalize first letter,
 * truncate to maxLength.
 * @param {string} text
 * @param {number|undefined} maxLength
 * @param {string|undefined} type
 * @returns {string}
 */
function polishContent(text, maxLength, type) {
  if (typeof text !== 'string') return '';
  if (type === 'slogan') {
    return sanitizeStoreSlogan(text, maxLength);
  }

  let s = text.trim();
  for (let i = 0; i < 3; i++) {
    const stripped = s.replace(LLM_PREAMBLE_RE, '').trim();
    if (stripped === s) break;
    s = stripped;
  }
  if (s.length > 0) s = s[0].toUpperCase() + s.slice(1);
  if (typeof maxLength === 'number' && maxLength > 0 && s.length > maxLength) {
    s = s.slice(0, maxLength).trimEnd();
  }
  return s;
}

/**
 * @param {string} text
 * @returns {string}
 */
function extractTaglineFromLlmText(text) {
  const t = String(text ?? '').trim();
  if (!t) return '';
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(t.slice(start, end + 1));
      const candidate =
        (typeof obj?.tagline === 'string' && obj.tagline) ||
        (typeof obj?.slogan === 'string' && obj.slogan) ||
        (typeof obj?.text === 'string' && obj.text) ||
        '';
      if (candidate.trim()) return candidate.trim();
    } catch {
      // fall through to free-text
    }
  }
  return t;
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
 * @param {object} args
 * @returns {Promise<string>}
 */
async function generateSloganText({
  businessName,
  businessType,
  verticalSlug,
  tone,
  maxChars,
  provider,
  model,
  tenantKey,
  strictRetry,
}) {
  const { llmGateway } = await import('../llm/llmGateway.ts');
  const contextBits = [
    businessName ? `Business: ${businessName}` : '',
    businessType ? `Category: ${businessType}` : '',
    verticalSlug ? `Vertical: ${verticalSlug}` : '',
    `Tone: ${tone}`,
    `Max length: ${maxChars} characters`,
  ]
    .filter(Boolean)
    .join('\n');

  const prompt = strictRetry
    ? `${SLOGAN_STRICT_CONTRACT}\n\nPrevious output was invalid. Try again.\n\n${contextBits}`
    : `${SLOGAN_STRICT_CONTRACT}\n\n${contextBits}`;

  const result = await llmGateway.generate({
    purpose: 'content_resolution:slogan',
    prompt,
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
    tenantKey,
    maxTokens: Math.max(80, Math.ceil((maxChars / 4) * 1.5) + 60),
    temperature: strictRetry ? 0.2 : 0.4,
    responseFormat: 'json',
  });
  return extractTaglineFromLlmText(typeof result.text === 'string' ? result.text : '');
}

/**
 * @param {object} args
 * @returns {Promise<string>}
 */
async function generateGenericContentText({
  type,
  businessName,
  businessType,
  tone,
  maxChars,
  provider,
  model,
  tenantKey,
}) {
  const { llmGateway } = await import('../llm/llmGateway.ts');
  const prompt =
    `Generate ${type} for ${businessName}, a ${businessType} business. ` +
    `Tone: ${tone}. Max ${maxChars} chars. Return only the ${type} text.`;

  const result = await llmGateway.generate({
    purpose: `content_resolution:${type}`,
    prompt,
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
    tenantKey,
    maxTokens: Math.max(60, Math.ceil((maxChars / 4) * 1.5) + 50),
    temperature: 0.4,
  });
  return typeof result.text === 'string' ? result.text : '';
}

/**
 * Resolve content for a mission field using: Fetch → AI Generate → Polish.
 *
 * Resolution chain (in order):
 *   STEP 1 — Fetch: if existingContent length > 20, polish and return (source: 'fetched')
 *            For slogans: if existing is meta-only after normalize, regenerate.
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
      if (type === 'slogan') {
        const normalized = normalizeAndValidateSlogan(existingContent, maxLength);
        if (normalized.valid) {
          await emitLine(emitContextUpdate, '✨ Polishing content...');
          return { content: normalized.slogan, source: 'fetched' };
        }
        // Malformed stored value — fall through to regenerate.
      } else {
        await emitLine(emitContextUpdate, '✨ Polishing content...');
        return { content: polishContent(existingContent, maxLength, type), source: 'fetched' };
      }
    }

    // ── STEP 2 — Generate ───────────────────────────────────────────────────
    await emitLine(emitContextUpdate, `✍️ Generating ${type}...`);

    let generated = '';
    try {
      const provider =
        typeof process.env.LLM_DEFAULT_PROVIDER === 'string' &&
        process.env.LLM_DEFAULT_PROVIDER.trim()
          ? process.env.LLM_DEFAULT_PROVIDER.trim()
          : undefined;
      const { resolveAnthropicModel } = await import('../llm/anthropicModelConfig.js');
      const model =
        typeof process.env.LLM_DEFAULT_MODEL === 'string' &&
        process.env.LLM_DEFAULT_MODEL.trim()
          ? resolveAnthropicModel(process.env.LLM_DEFAULT_MODEL.trim())
          : resolveAnthropicModel();
      const maxChars = typeof maxLength === 'number' && maxLength > 0 ? maxLength : 120;

      if (type === 'slogan') {
        generated = await generateSloganText({
          businessName,
          businessType,
          verticalSlug,
          tone,
          maxChars,
          provider,
          model,
          tenantKey,
          strictRetry: false,
        });
        let check = normalizeAndValidateSlogan(generated, maxLength);
        if (!check.valid || looksLikeSloganMeta(generated)) {
          generated = await generateSloganText({
            businessName,
            businessType,
            verticalSlug,
            tone,
            maxChars,
            provider,
            model,
            tenantKey,
            strictRetry: true,
          });
          check = normalizeAndValidateSlogan(generated, maxLength);
        }
        generated = check.valid ? check.slogan : sanitizeStoreSlogan(generated, maxLength);
      } else {
        generated = await generateGenericContentText({
          type,
          businessName,
          businessType,
          tone,
          maxChars,
          provider,
          model,
          tenantKey,
        });
      }
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
      const fallback =
        type === 'slogan'
          ? businessType
            ? `${businessType} you can trust`
            : businessName
              ? `Welcome to ${businessName}`
              : 'Welcome'
          : businessName
            ? `${businessName}${businessType ? ` — ${businessType}` : ''}`
            : businessType || 'Welcome';
      return { content: polishContent(fallback, maxLength, type), source: 'fallback' };
    }

    if (type === 'slogan') {
      const final = normalizeAndValidateSlogan(generated, maxLength);
      if (final.valid) return { content: final.slogan, source: 'generated' };
      const polished = sanitizeStoreSlogan(generated, maxLength);
      if (polished && !looksLikeSloganMeta(polished)) {
        return { content: polished, source: 'generated' };
      }
      const safeFallback = businessType
        ? sanitizeStoreSlogan(`${businessType} you can trust`, maxLength)
        : sanitizeStoreSlogan(businessName ? `Welcome to ${businessName}` : 'Welcome', maxLength);
      return { content: safeFallback, source: 'fallback' };
    }

    return { content: polishContent(generated, maxLength, type), source: 'generated' };
  } catch (outerErr) {
    // Outermost safety net — never throw
    emitHealthProbe('content_resolution_error', {
      missionId: missionId ?? undefined,
      type,
      error: String(outerErr?.message ?? outerErr),
    });
    const fallback =
      type === 'slogan'
        ? businessType || businessName || 'Welcome'
        : businessName || businessType || 'Welcome';
    return { content: polishContent(fallback, maxLength, type), source: 'fallback' };
  }
}
