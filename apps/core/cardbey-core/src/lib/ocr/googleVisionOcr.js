/**
 * Google Cloud Vision OCR fallback (non-LLM).
 * Used only when GOOGLE_CLOUD_VISION_ENABLED=true and primary OCR returns refusal/invalid.
 */

const PROVIDER = 'google_vision';
const VISION_ANNOTATE_URL = 'https://vision.googleapis.com/v1/images:annotate';
const OCR_TIMEOUT_MS = 20000;
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Get base64 content from data URL or buffer.
 * @param {{ imageDataUrl?: string, imageBuffer?: Buffer, mimeType?: string }} input
 * @returns {{ base64: string, mimeType: string } | null}
 */
function getBase64Input(input) {
  if (!input) return null;
  if (input.imageDataUrl && typeof input.imageDataUrl === 'string' && input.imageDataUrl.startsWith('data:image/')) {
    const match = input.imageDataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
    if (match) {
      const raw = match[2];
      if (Buffer.byteLength(Buffer.from(raw, 'base64')) > MAX_IMAGE_SIZE_BYTES) return null;
      return { base64: raw, mimeType: match[1] };
    }
  }
  if (input.imageBuffer && Buffer.isBuffer(input.imageBuffer)) {
    if (input.imageBuffer.length > MAX_IMAGE_SIZE_BYTES) return null;
    return {
      base64: input.imageBuffer.toString('base64'),
      mimeType: input.mimeType || 'image/jpeg',
    };
  }
  return null;
}

/**
 * Call Google Cloud Vision DOCUMENT_TEXT_DETECTION (REST with API key).
 * @param {string} base64 - Base64-encoded image
 * @param {string} apiKey
 * @returns {Promise<{ text: string, confidence?: number }>}
 */
async function callVisionApi(base64, apiKey) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);

  const res = await fetch(`${VISION_ANNOTATE_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        {
          image: { content: base64 },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        },
      ],
    }),
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Vision API error: ${res.status} ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const response = data.responses?.[0];
  if (!response) return { text: '' };

  if (response.error) {
    throw new Error(response.error.message || 'Google Vision API error');
  }

  const fullText = response.fullTextAnnotation?.text || '';
  return {
    text: fullText.trim(),
    confidence: response.fullTextAnnotation?.pages?.[0]?.confidence,
  };
}

function normalizeOutput(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * Extract text using Google Cloud Vision OCR.
 * Requires GOOGLE_CLOUD_VISION_ENABLED=true and GOOGLE_CLOUD_VISION_API_KEY.
 *
 * @param {{ imageDataUrl?: string, imageBuffer?: Buffer, mimeType?: string }} input
 * @returns {Promise<{ text: string, provider: string, confidence?: number }>}
 */
export async function googleVisionOcrExtractText(input) {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('GOOGLE_CLOUD_VISION_API_KEY is not set');
  }

  const decoded = getBase64Input(input);
  if (!decoded) {
    return { text: '', provider: PROVIDER, confidence: 0 };
  }

  const { text, confidence } = await callVisionApi(decoded.base64, apiKey.trim());
  const normalized = normalizeOutput(text);

  return {
    text: normalized,
    provider: PROVIDER,
    confidence: confidence != null ? confidence : (normalized.length > 0 ? 0.85 : undefined),
  };
}

/** Whether the fallback is configured and enabled. */
export function isGoogleVisionFallbackEnabled() {
  const enabled = process.env.GOOGLE_CLOUD_VISION_ENABLED;
  const key = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  return (enabled === 'true' || enabled === '1') && key && typeof key === 'string' && key.trim().length > 0;
}
