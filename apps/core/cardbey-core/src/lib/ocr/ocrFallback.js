/**
 * OCR fallback pipeline: primary (OpenAI Vision) then optional fallback (e.g. Google Vision).
 * Used only for Agent Chat attachments. Store-creation OCR is unchanged.
 */

import { ocrExtractText } from './ocrProvider.js';
import { googleVisionOcrExtractText, isGoogleVisionFallbackEnabled } from './googleVisionOcr.js';

const OCR_TIMEOUT_MS = 20000;

/** True if OCR/LLM response looks like a refusal (e.g. "I cannot process this image"). */
function isRefusalResponse(text) {
  if (!text || typeof text !== 'string') return true;
  const t = text.trim().toLowerCase();
  if (t.length < 3) return false;
  const refusalPhrases = ["i can't", "i cannot", "i'm unable", "unable to", "not able to", "i'm sorry", "cannot process", "can't process", "don't have", "doesn't contain", "no text", "could not extract"];
  return refusalPhrases.some((p) => t.includes(p));
}

/** True if text is too short or otherwise invalid for business-card use. */
function invalidTextForBusinessCard(text) {
  if (!text || typeof text !== 'string') return true;
  const t = text.trim();
  return t.length < 10 || isRefusalResponse(text);
}

/**
 * Run a promise with a timeout.
 * @param {Promise<T>} p
 * @param {number} ms
 * @returns {Promise<T>}
 * @template T
 */
function withTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('OCR timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

/**
 * Extract text with fallback: run primary OCR, then fallback if result is refusal/invalid.
 * Never logs raw OCR text in production (PII).
 *
 * @param {{ imageDataUrl: string, imageBuffer?: Buffer, mimeType?: string, purpose?: string }} params
 * @returns {Promise<{ text: string, providerUsed: string, didFallback: boolean, debug: object }>}
 */
export async function extractTextWithFallback(params) {
  const { imageDataUrl, imageBuffer, mimeType, purpose = 'business_card' } = params || {};
  const debug = {};

  if (!imageDataUrl && !imageBuffer) {
    return { text: '', providerUsed: 'none', didFallback: false, debug: { error: 'no_input' } };
  }

  let primaryResult;
  try {
    primaryResult = await withTimeout(
      ocrExtractText({
        imageDataUrl,
        imageBuffer,
        mimeType,
        context: { purpose },
      }),
      OCR_TIMEOUT_MS
    );
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      debug.primaryError = err?.message || String(err);
    }
    primaryResult = { text: '', provider: 'openai_vision' };
  }

  const primaryValid =
    primaryResult.text &&
    !isRefusalResponse(primaryResult.text) &&
    !invalidTextForBusinessCard(primaryResult.text);

  if (primaryValid) {
    return {
      text: primaryResult.text,
      providerUsed: primaryResult.provider || 'openai_vision',
      didFallback: false,
      debug: Object.keys(debug).length ? debug : undefined,
    };
  }

  if (isGoogleVisionFallbackEnabled()) {
    try {
      const fallbackResult = await withTimeout(
        googleVisionOcrExtractText({ imageDataUrl, imageBuffer, mimeType }),
        OCR_TIMEOUT_MS
      );
      const fallbackValid =
        fallbackResult.text &&
        fallbackResult.text.length >= 20 &&
        !isRefusalResponse(fallbackResult.text) &&
        !invalidTextForBusinessCard(fallbackResult.text);

      if (fallbackValid) {
        if (process.env.NODE_ENV !== 'production') {
          debug.fallbackProvider = fallbackResult.provider;
        }
        return {
          text: fallbackResult.text,
          providerUsed: fallbackResult.provider,
          didFallback: true,
          debug: Object.keys(debug).length ? debug : undefined,
        };
      }
    } catch (fallbackErr) {
      if (process.env.NODE_ENV !== 'production') {
        debug.fallbackError = fallbackErr?.message || String(fallbackErr);
      }
    }
  }

  return {
    text: primaryResult?.text || '',
    providerUsed: primaryResult?.provider || 'openai_vision',
    didFallback: false,
    debug: Object.keys(debug).length ? debug : { usedPrimaryOnly: true },
  };
}
