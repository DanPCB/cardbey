/**
 * Normalize Buffer / base64 / data-URL into forms Anthropic + OpenAI vision expect.
 */

import type { NormalizedImage } from './multimodalTypes.js';

export function normalizeVisionImage(
  image: string | Buffer,
  mediaType = 'image/jpeg',
): NormalizedImage {
  if (Buffer.isBuffer(image)) {
    const mime = mediaType.startsWith('image/') ? mediaType : 'image/jpeg';
    const base64 = image.toString('base64');
    return {
      base64,
      mediaType: mime,
      dataUrl: `data:${mime};base64,${base64}`,
    };
  }

  const raw = String(image || '').trim();
  if (!raw) {
    throw new Error('Vision image is empty');
  }

  if (raw.startsWith('data:')) {
    const match = raw.match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) {
      throw new Error('Invalid data URL for vision image');
    }
    return {
      mediaType: match[1] || 'image/jpeg',
      base64: match[2],
      dataUrl: raw,
    };
  }

  // Assume raw base64
  const mime = mediaType.startsWith('image/') ? mediaType : 'image/jpeg';
  return {
    base64: raw.replace(/\s+/g, ''),
    mediaType: mime,
    dataUrl: `data:${mime};base64,${raw.replace(/\s+/g, '')}`,
  };
}
