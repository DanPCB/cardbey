/**
 * OCR Helper
 * Extracts text from images using various OCR engines
 * Uses the OpenAI Vision Engine which handles private URLs automatically
 */

import { openaiVisionEngine } from '../../ai/engines/openaiVisionEngine.js';
import { postAnthropicMessages } from '../../lib/llm/anthropicProvider.js';

function anthropicEnabled() {
  return (
    process.env.ANTHROPIC_DISABLED !== '1' &&
    process.env.ANTHROPIC_DISABLED !== 'true' &&
    Boolean(process.env.ANTHROPIC_API_KEY)
  );
}

/**
 * @param {string} inputUrl url or data url
 * @returns {Promise<{ base64: string, mediaType: string } | null>}
 */
async function toBase64ForAnthropic(inputUrl) {
  if (!inputUrl || typeof inputUrl !== 'string') return null;
  if (inputUrl.startsWith('data:image/')) {
    const m = inputUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (!m) return null;
    return { mediaType: m[1], base64: m[2] };
  }
  // Best-effort fetch for http(s). Most callers pass data URLs already.
  if (/^https?:\/\//i.test(inputUrl)) {
    const res = await fetch(inputUrl, { method: 'GET' });
    if (!res.ok) return null;
    const mime = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    if (!mime.startsWith('image/')) return null;
    const ab = await res.arrayBuffer();
    const base64 = Buffer.from(ab).toString('base64');
    return { mediaType: mime, base64 };
  }
  return null;
}

/**
 * Anthropic vision fallback: OCR-only transcription.
 * @param {{ imageUrl: string, task: string }} params
 * @returns {Promise<string|null>}
 */
async function runAnthropicOcrFallback(params) {
  if (!anthropicEnabled()) return null;
  const media = await toBase64ForAnthropic(params.imageUrl);
  if (!media) return null;

  let prompt =
    'Extract all text from this image. Return only the raw text, line by line, exactly as it appears.';
  if (params.task === 'menu') {
    prompt =
      'Extract all text from this menu image. Return only the raw text, line by line, exactly as it appears. Do not add any formatting or interpretation.';
  } else if (params.task === 'business_card') {
    prompt =
      "Output ONLY the extracted text from this image. Preserve line breaks. No explanations, no disclaimers, no assistant voice. If the image is unreadable or not text, output nothing (empty). Do not write \"I cannot\" or \"I'm sorry\" or any reply—only the raw text visible in the image.";
  } else if (params.task === 'loyalty_card') {
    prompt =
      'Extract text from this loyalty card image. Focus on stamp count, reward description, and card title. Return the text exactly as it appears.';
  } else if (params.task === 'intake_preprocess' || params.task === 'intake_promo') {
    // Keep fallback simple; caller expects OCR text.
    prompt =
      'Transcribe ALL readable text verbatim. Preserve the original language and line breaks. Plain text only.';
  }

  const model = process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-20250514';
  const r = await postAnthropicMessages({
    model,
    max_tokens: 2000,
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

  if (r?.error) return null;
  const text = (r?.content?.[0]?.text ?? r?.text ?? '').trim();
  if (!text) return null;
  if (isRefusalResponse(text)) return null;
  return text;
}

/** Phrases that indicate the vision model refused to extract text (not actual OCR output). */
const REFUSAL_PATTERNS = [
  /I['\u2019]?m\s+sorry/i,
  /I\s+can['\u2019]?t\s+assist/i,
  /I\s+can['\u2019]?t\s+help/i,
  /I\s+can['\u2019]?t\s+extract/i,
  /I\s+can['\u2019]?t\s+process/i,
  /I\s+am\s+not\s+able\s+to/i,
  /cannot\s+assist/i,
  /cannot\s+help/i,
  /cannot\s+extract/i,
  /cannot\s+process/i,
  /can['\u2019]?t\s+process/i,
  /I['\u2019]?m\s+unable/i,
  /I\s+am\s+unable/i,
  /unable\s+to\s+process/i,
  /unable\s+to\s+extract/i,
  /unable\s+to\s+(assist|help|process|extract|process\s+this\s+request)/i,
  /I\s+don['\u2019]?t\s+have\s+access/i,
  /cannot\s+view\s+images/i,
  /can['\u2019]?t\s+view\s+images/i,
  /I\s+don['\u2019]?t\s+have\s+(the\s+)?ability/i,
  /I\s+cannot\s+(help|assist|process|extract)/i,
  /\bI\s+can['\u2019]?t\b/i,
  /\bI\s+cannot\b/i,
];

/** User-facing message when Agent Chat OCR fails (refusal or unreadable). */
export const AGENT_CHAT_OCR_FAILURE_MESSAGE =
  'OCR failed (unreadable or provider error). Please type business name + phone + address.';

/** Normalize Unicode apostrophe/quote to ASCII for regex matching. */
function normalizeForRefusalCheck(str) {
  return str.replace(/\u2019/g, "'").replace(/\u2018/g, "'");
}

/** Export for Agent Chat guard: do not store refusal text as OCR result. */
export function isRefusalResponse(text) {
  if (!text || typeof text !== 'string') return false;
  const t = normalizeForRefusalCheck(text.trim());
  if (t.length > 500) return false;
  return REFUSAL_PATTERNS.some((p) => p.test(t));
}

/**
 * Heuristic: text is invalid for business card (too short, refusal, or no contact-like content).
 * @param {string} text - Raw OCR result
 * @returns {boolean} true if we should not treat as valid business card OCR
 */
export function invalidTextForBusinessCard(text) {
  if (!text || typeof text !== 'string') return true;
  const t = text.trim();
  if (t.length < 20) return true;
  if (isRefusalResponse(t)) return true;
  const hasDigit = /\d/.test(t);
  const hasEmail = /@/.test(t);
  const hasWeb = /\bwww\.|https?:\/\//i.test(t);
  if (!hasDigit && !hasEmail && !hasWeb) return true;
  return false;
}

/** Australian state/territory codes used for state + postcode heuristic. */
const AU_STATE_CODES = /(?:VIC|NSW|QLD|WA|SA|TAS|ACT|NT)\s*\d{4}/i;

/**
 * Business-card-specific heuristic: true only if text contains at least one strong signal of
 * real OCR (email, url/domain, phone-like digit run, or state+postcode). Used only in Agent Chat
 * OCR pipeline to avoid storing refusal or garbage as businessName.
 * @param {string} text - Raw OCR result
 * @returns {boolean} true if text looks like business card OCR
 */
export function businessCardLooksLikeOcrText(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  if (t.length < 10) return false;
  if (/@/.test(t)) return true;
  if (/\bwww\.|https?:\/\/|\.com\b|\.au\b/i.test(t)) return true;
  const digitCount = (t.replace(/\s/g, '').match(/\d/g) || []).length;
  if (digitCount >= 8) return true;
  if (AU_STATE_CODES.test(t)) return true;
  return false;
}

/**
 * Run OCR on an image URL
 * Uses OpenAI Vision API. Optional opts.task: 'menu' | 'business_card' | 'loyalty_card' | 'shopfront' (default 'menu').
 * Throws if the vision model returns a refusal instead of extracted text.
 *
 * @param {string} imageUrl - URL or data URL of the image to extract text from
 * @param {{ task?: string }} [opts] - Optional; task defaults to 'menu'. Also: 'intake_preprocess' (structured flyer/menu pre-classify).
 * @returns {Promise<string>} Extracted text from the image
 */
export async function runOcr(imageUrl, opts) {
  if (!imageUrl) {
    console.warn('[OCR] No image URL provided');
    return '';
  }

  const task = (opts && opts.task) || 'menu';

  try {
    console.log('[OCR] Extracting text using OpenAI Vision API, task:', task);
    const result = await openaiVisionEngine.analyzeImage({
      imageUrl,
      task,
    });

    const text = (result.text || '').trim();
    if (isRefusalResponse(text)) {
      console.warn('[OCR] Vision model returned a refusal instead of extracted text:', text.slice(0, 80));
      const fallback = await runAnthropicOcrFallback({ imageUrl, task }).catch(() => null);
      if (fallback && fallback.trim()) {
        console.log('[OCR] Anthropic fallback succeeded, chars:', fallback.trim().length);
        return fallback.trim();
      }
      throw new Error(
        'OCR did not return extracted text. The vision model declined to process the image. ' +
          'Try a different image or ensure the image is a clear photo of text (e.g. business card or menu).'
      );
    }
    console.log('[OCR] Extracted', text.length, 'characters');
    return text;
  } catch (error) {
    console.error('[OCR] OpenAI Vision API failed:', error.message);
    throw error;
  }
}


