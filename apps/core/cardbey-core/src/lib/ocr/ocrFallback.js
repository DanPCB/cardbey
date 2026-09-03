/**
 * OCR fallback orchestration: OpenAI → Anthropic → Google (sequential, config-aware).
 * Used by extract-card and Agent Chat attachment OCR.
 */

import { ocrExtractText } from './ocrProvider.js';
import { googleVisionOcrExtractText, isGoogleVisionFallbackEnabled } from './googleVisionOcr.js';
import {
  anthropicOcrExtractText,
  isAnthropicOcrConfigured,
  isRefusalResponse,
  businessCardLooksLikeOcrText,
} from '../../modules/vision/runOcr.js';
import {
  OCR_RESULT_CLASS,
  classifyOcrProviderError,
  classifyOcrTextResult,
  isRecoverableProviderFailure,
} from './ocrProviderFailure.js';
import {
  isOcrProviderTemporarilyUnavailable,
  markOcrProviderTemporarilyUnavailable,
} from './ocrProviderHealth.js';
import { recordVisionAttempt, recordVisionFallbackSummary } from './ocrResilienceTelemetry.js';

const OCR_TIMEOUT_MS = 20000;

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
      },
    );
  });
}

function isOpenAiOcrConfigured() {
  return Boolean(String(process.env.OPENAI_API_KEY || '').trim());
}

/**
 * Usable business-card OCR text (not refusal / not empty garbage).
 * @param {string} text
 */
function isUsableBusinessCardOcr(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  if (t.length < 10) return false;
  if (isRefusalResponse(t)) return false;
  return businessCardLooksLikeOcrText(t);
}

/**
 * @param {string} provider
 * @param {() => Promise<{ text: string, provider?: string }>} run
 * @param {number} attemptNum
 * @param {object[]} attempts
 */
async function runProviderAttempt(provider, run, attemptNum, attempts) {
  if (isOcrProviderTemporarilyUnavailable(provider)) {
    const row = {
      provider,
      attempt: attemptNum,
      classification: OCR_RESULT_CLASS.QUOTA_EXHAUSTED,
      latencyMs: 0,
      fallbackTriggered: attemptNum > 1,
      skipped: true,
    };
    recordVisionAttempt(row);
    attempts.push(row);
    return { text: '', provider, classification: OCR_RESULT_CLASS.QUOTA_EXHAUSTED, skipped: true };
  }

  const started = Date.now();
  try {
    const result = await withTimeout(run(), OCR_TIMEOUT_MS);
    const text = typeof result?.text === 'string' ? result.text.trim() : '';
    let classification = classifyOcrTextResult(text, { isRefusal: isRefusalResponse });
    if (classification === OCR_RESULT_CLASS.SUCCESS && !isUsableBusinessCardOcr(text)) {
      // Provider returned text but not usable for business-card gate — still try next provider.
      classification = text.length >= 10 ? OCR_RESULT_CLASS.EMPTY_RESULT : OCR_RESULT_CLASS.EMPTY_RESULT;
    }
    const row = {
      provider: result?.provider || provider,
      attempt: attemptNum,
      classification,
      latencyMs: Date.now() - started,
      fallbackTriggered: attemptNum > 1,
    };
    recordVisionAttempt(row);
    attempts.push(row);
    return {
      text,
      provider: result?.provider || provider,
      classification,
      skipped: false,
    };
  } catch (err) {
    const classification = classifyOcrProviderError(err);
    if (
      classification === OCR_RESULT_CLASS.QUOTA_EXHAUSTED ||
      classification === OCR_RESULT_CLASS.RATE_LIMITED
    ) {
      markOcrProviderTemporarilyUnavailable(provider, classification);
    }
    const row = {
      provider,
      attempt: attemptNum,
      classification,
      latencyMs: Date.now() - started,
      fallbackTriggered: attemptNum > 1,
    };
    recordVisionAttempt(row);
    attempts.push(row);
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[ocrFallback] ${provider} failed:`, err?.message || err);
    }
    return { text: '', provider, classification, skipped: false, error: err };
  }
}

/**
 * Extract text with sequential provider fallback.
 *
 * @param {{ imageDataUrl?: string, imageBuffer?: Buffer, mimeType?: string, purpose?: string }} params
 * @returns {Promise<{
 *   text: string,
 *   providerUsed: string,
 *   didFallback: boolean,
 *   classification: string,
 *   attempts: object[],
 *   debug?: object,
 * }>}
 */
export async function extractTextWithFallback(params) {
  const { imageDataUrl, imageBuffer, mimeType, purpose = 'business_card' } = params || {};
  const attempts = [];
  const debug = {};

  if (!imageDataUrl && !imageBuffer) {
    return {
      text: '',
      providerUsed: 'none',
      didFallback: false,
      classification: OCR_RESULT_CLASS.NOT_CONFIGURED,
      attempts,
      debug: { error: 'no_input' },
    };
  }

  const chain = [];
  if (isOpenAiOcrConfigured()) {
    chain.push({
      id: 'openai_vision',
      run: async () => {
        // Staging/local canary only: force primary failure without burning quota.
        // Requires ALLOW_OCR_CANARY_FORCE=1 (or CARD_BEY_ENV/RENDER service name containing staging).
        const force = String(process.env.OCR_CANARY_FORCE_PRIMARY_FAIL || '').trim().toLowerCase();
        const allowForce =
          process.env.ALLOW_OCR_CANARY_FORCE === '1' ||
          process.env.ALLOW_OCR_CANARY_FORCE === 'true' ||
          String(process.env.CARD_BEY_ENV || process.env.NODE_ENV || '').toLowerCase() === 'staging' ||
          /staging/i.test(String(process.env.RENDER_SERVICE_NAME || ''));
        if (force && allowForce) {
          const err = new Error(
            force === 'timeout'
              ? 'OCR timeout'
              : force === 'rate_limited'
                ? 'rate_limit_exceeded'
                : 'insufficient_quota credit_balance_exhausted',
          );
          if (force === 'rate_limited') err.status = 429;
          throw err;
        }
        return ocrExtractText({
          imageDataUrl,
          imageBuffer,
          mimeType,
          context: { purpose },
        });
      },
    });
  }
  if (isAnthropicOcrConfigured()) {
    chain.push({
      id: 'anthropic_vision',
      run: () =>
        anthropicOcrExtractText({
          imageDataUrl,
          imageBuffer,
          mimeType,
          task: purpose === 'business_card' ? 'business_card' : purpose,
        }),
    });
  }
  if (isGoogleVisionFallbackEnabled()) {
    chain.push({
      id: 'google_vision',
      run: () => googleVisionOcrExtractText({ imageDataUrl, imageBuffer, mimeType }),
    });
  }

  if (chain.length === 0) {
    const classification = OCR_RESULT_CLASS.VISION_PROVIDERS_UNAVAILABLE;
    recordVisionFallbackSummary(attempts, classification, 'none');
    return {
      text: '',
      providerUsed: 'none',
      didFallback: false,
      classification,
      attempts,
      debug: { error: 'no_providers_configured' },
    };
  }

  let lastText = '';
  let lastProvider = chain[0].id;
  let anyProviderSucceededProcess = false;
  let anyInfraFailure = false;

  for (let i = 0; i < chain.length; i++) {
    const step = chain[i];
    const outcome = await runProviderAttempt(step.id, step.run, i + 1, attempts);
    lastProvider = outcome.provider || step.id;

    if (outcome.classification === OCR_RESULT_CLASS.SUCCESS && isUsableBusinessCardOcr(outcome.text)) {
      const didFallback = i > 0;
      recordVisionFallbackSummary(attempts, OCR_RESULT_CLASS.SUCCESS, outcome.provider);
      return {
        text: outcome.text,
        providerUsed: outcome.provider,
        didFallback,
        classification: OCR_RESULT_CLASS.SUCCESS,
        attempts,
        debug: Object.keys(debug).length ? debug : undefined,
      };
    }

    if (
      outcome.classification === OCR_RESULT_CLASS.EMPTY_RESULT ||
      outcome.classification === OCR_RESULT_CLASS.REFUSED ||
      (outcome.text && !isUsableBusinessCardOcr(outcome.text))
    ) {
      // Provider responded; content unusable for card — may still try next.
      anyProviderSucceededProcess = true;
      if (outcome.text) lastText = outcome.text;
    } else if (isRecoverableProviderFailure(outcome.classification)) {
      anyInfraFailure = true;
    }

    // Continue to next provider only on recoverable failure / unusable text.
    if (!isRecoverableProviderFailure(outcome.classification) && outcome.classification !== OCR_RESULT_CLASS.SUCCESS) {
      // Non-recoverable unexpected — still try next if available.
      anyInfraFailure = true;
    }
  }

  // All providers exhausted.
  let classification;
  if (anyProviderSucceededProcess && !lastText) {
    classification = OCR_RESULT_CLASS.UNREADABLE;
  } else if (anyProviderSucceededProcess && lastText && !isUsableBusinessCardOcr(lastText)) {
    classification = OCR_RESULT_CLASS.UNREADABLE;
  } else if (anyInfraFailure || attempts.every((a) => isRecoverableProviderFailure(a.classification))) {
    classification = OCR_RESULT_CLASS.VISION_PROVIDERS_UNAVAILABLE;
  } else {
    classification = OCR_RESULT_CLASS.UNREADABLE;
  }

  // Prefer infra classification when every attempt was infra (no successful process).
  const allInfra = attempts.length > 0 && attempts.every((a) => {
    const c = a.classification;
    return (
      c === OCR_RESULT_CLASS.QUOTA_EXHAUSTED ||
      c === OCR_RESULT_CLASS.RATE_LIMITED ||
      c === OCR_RESULT_CLASS.TIMEOUT ||
      c === OCR_RESULT_CLASS.NETWORK_ERROR ||
      c === OCR_RESULT_CLASS.PROVIDER_ERROR ||
      c === OCR_RESULT_CLASS.NOT_CONFIGURED
    );
  });
  if (allInfra) {
    classification = OCR_RESULT_CLASS.VISION_PROVIDERS_UNAVAILABLE;
  }

  recordVisionFallbackSummary(attempts, classification, lastProvider);
  return {
    text: lastText || '',
    providerUsed: lastProvider,
    didFallback: attempts.length > 1,
    classification,
    attempts,
    debug: Object.keys(debug).length ? debug : { exhausted: true },
  };
}
