/**
 * Vision intent classifier — QR fast path or single Claude vision call.
 */

import fs from 'node:fs';
import path from 'node:path';
import { postAnthropicMessages } from '../llm/anthropicProvider.js';
import { resolveAnthropicModel } from '../llm/anthropicModelConfig.js';
import {
  normalizeVisionExtraction,
  normalizeVisionIntent,
  normalizeVisionSurface,
} from './visionEventContract.js';
import { resolveVisionUploadAbsolutePath } from './saveVisionUploads.js';

export const VISION_INTENT_CLASSIFIER_PROMPT = `You are VisionIntakeCapability for Cardbey. Classify what the user photographed.

Return ONLY valid JSON with this schema:
{
  "intent": "store_sign | flyer_menu | product_photo | receipt | unknown",
  "confidence": 0.0,
  "extraction": {
    "businessName": null,
    "tagline": null,
    "category": null,
    "brandColors": [],
    "visibleAddress": null,
    "visiblePhone": null,
    "products": [],
    "notes": null
  }
}

Rules:
- store_sign: storefront signage, A-frame, fascia, window branding.
- flyer_menu: printed menus, flyers, brochures, price lists with multiple items.
- product_photo: a single product or dish without full menu context.
- receipt: purchase receipt or invoice.
- unknown: unclear or unsupported.
- confidence is 0.0–1.0 based on visual evidence.
- Only fill extraction fields you can read from the image; use null or empty arrays when absent.
- Never invent addresses or phone numbers.
- No markdown fences.`;

/**
 * @param {string} raw
 */
export function stripJsonFence(raw) {
  let s = String(raw || '').trim();
  s = s.replace(/^```json\s*/i, '').replace(/^```\s*/i, '');
  s = s.replace(/```\s*$/i, '').trim();
  return s;
}

/**
 * @param {string} text
 */
export function parseVisionIntentJson(text) {
  const cleaned = stripJsonFence(text);
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return normalizeClassifierResult(parsed);
    }
  } catch {
    // fall through
  }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      if (parsed && typeof parsed === 'object') {
        return normalizeClassifierResult(parsed);
      }
    } catch {
      // fall through
    }
  }
  return {
    intent: 'unknown',
    confidence: 0,
    extraction: normalizeVisionExtraction({}),
  };
}

/**
 * @param {object} parsed
 */
function normalizeClassifierResult(parsed) {
  const confidenceRaw = Number(parsed.confidence);
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.max(0, Math.min(1, confidenceRaw))
    : 0;
  return {
    intent: normalizeVisionIntent(parsed.intent),
    confidence,
    extraction: normalizeVisionExtraction(parsed.extraction ?? {}),
  };
}

/**
 * @param {string} surface
 * @param {string|null} defaultIntentHint
 */
function buildClassifierPrompt(surface, defaultIntentHint) {
  const normalizedSurface = normalizeVisionSurface(surface);
  const hint = typeof defaultIntentHint === 'string' ? defaultIntentHint.trim() : '';
  const prior = hint
    ? `The user opened the camera from the ${normalizedSurface} surface, which usually means ${hint} — but classify based on visual evidence.`
    : `The user opened the camera from the ${normalizedSurface} surface.`;
  return `${VISION_INTENT_CLASSIFIER_PROMPT}\n\nContext: ${prior}`;
}

function anthropicEnabled() {
  return (
    process.env.ANTHROPIC_DISABLED !== '1' &&
    process.env.ANTHROPIC_DISABLED !== 'true' &&
    Boolean(process.env.ANTHROPIC_API_KEY)
  );
}

/**
 * @param {Buffer} buffer
 * @param {string} mimeType
 */
function bufferToVisionMedia(buffer, mimeType = 'image/jpeg') {
  return {
    mediaType: mimeType.startsWith('image/') ? mimeType : 'image/jpeg',
    base64: buffer.toString('base64'),
  };
}

/**
 * @param {string} imagePath
 * @returns {Promise<{ buffer: Buffer, mimeType: string } | null>}
 */
async function loadImageFromPublicPath(imagePath) {
  const abs = resolveVisionUploadAbsolutePath(imagePath);
  if (!abs || !fs.existsSync(abs)) return null;
  const ext = path.extname(abs).toLowerCase();
  const mimeType =
    ext === '.png'
      ? 'image/png'
      : ext === '.webp'
        ? 'image/webp'
        : ext === '.gif'
          ? 'image/gif'
          : 'image/jpeg';
  return { buffer: fs.readFileSync(abs), mimeType };
}

/**
 * @param {object} params
 * @param {string|null} [params.decodedPayload]
 * @param {string} [params.surface]
 * @param {string|null} [params.defaultIntentHint]
 * @param {string[]} [params.imagePaths]
 * @param {Array<Buffer|{ buffer?: Buffer, mimetype?: string }>} [params.imageBuffers]
 */
export async function classifyVisionIntent({
  decodedPayload,
  surface = 'unknown',
  defaultIntentHint = null,
  imagePaths = [],
  imageBuffers = [],
} = {}) {
  const payload = typeof decodedPayload === 'string' ? decodedPayload.trim() : '';
  if (payload) {
    return {
      intent: 'qr_payload',
      confidence: 1,
      extraction: normalizeVisionExtraction({ notes: payload }),
      provider: 'qr_fast_path',
    };
  }

  let media = null;
  for (const buf of imageBuffers) {
    if (Buffer.isBuffer(buf)) {
      media = bufferToVisionMedia(buf);
      break;
    }
    if (buf?.buffer && Buffer.isBuffer(buf.buffer)) {
      media = bufferToVisionMedia(buf.buffer, buf.mimetype ?? 'image/jpeg');
      break;
    }
  }
  if (!media && Array.isArray(imagePaths)) {
    for (const p of imagePaths) {
      const loaded = await loadImageFromPublicPath(p);
      if (loaded) {
        media = bufferToVisionMedia(loaded.buffer, loaded.mimeType);
        break;
      }
    }
  }

  if (!media) {
    return {
      intent: 'unknown',
      confidence: 0,
      extraction: normalizeVisionExtraction({}),
      provider: 'none',
    };
  }

  if (!anthropicEnabled()) {
    return {
      intent: 'unknown',
      confidence: 0,
      extraction: normalizeVisionExtraction({}),
      provider: 'none',
    };
  }

  const model = resolveAnthropicModel(process.env.ANTHROPIC_MODEL);
  const prompt = buildClassifierPrompt(surface, defaultIntentHint);
  const r = await postAnthropicMessages({
    model,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: media.mediaType, data: media.base64 },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });

  if (r?.error) {
    return {
      intent: 'unknown',
      confidence: 0,
      extraction: normalizeVisionExtraction({}),
      provider: 'anthropic',
      error: r.error,
    };
  }

  const text = (r?.content?.[0]?.text ?? r?.text ?? '').trim();
  const parsed = parseVisionIntentJson(text);
  return { ...parsed, provider: 'anthropic' };
}
