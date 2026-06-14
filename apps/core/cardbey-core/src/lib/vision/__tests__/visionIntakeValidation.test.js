import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { rateLimit } from '../../../middleware/rateLimit.js';
import {
  validateVisionIntakeFiles,
  validateVisionIntakeRequest,
  MAX_VISION_IMAGES,
  MAX_VISION_IMAGE_BYTES,
} from '../visionIntakeValidation.js';

describe('visionIntakeValidation', () => {
  it('rejects more than 5 images', () => {
    const files = Array.from({ length: MAX_VISION_IMAGES + 1 }, (_, i) => ({
      mimetype: 'image/jpeg',
      size: 100,
      buffer: Buffer.alloc(100),
    }));
    const result = validateVisionIntakeFiles(files);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('too_many_images');
  });

  it('rejects non-image MIME types', () => {
    const result = validateVisionIntakeFiles([
      { mimetype: 'application/pdf', size: 100, buffer: Buffer.alloc(100) },
    ]);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('invalid_mime');
  });

  it('rejects files over 10MB', () => {
    const result = validateVisionIntakeFiles([
      {
        mimetype: 'image/jpeg',
        size: MAX_VISION_IMAGE_BYTES + 1,
        buffer: Buffer.alloc(1),
      },
    ]);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('file_too_large');
  });

  it('accepts QR-only intake without images', () => {
    const result = validateVisionIntakeRequest({
      files: [],
      decodedPayload: 'https://www.cardbey.com/s/demo',
    });
    expect(result.ok).toBe(true);
  });

  it('rejects empty intake', () => {
    const result = validateVisionIntakeRequest({ files: [], decodedPayload: '' });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('empty_intake');
  });

  it('rate limit middleware blocks after max requests per key', async () => {
    const key = `vision-intake-test-${Date.now()}`;
    const app = express();
    app.post(
      '/intake',
      rateLimit({
        windowMs: 60 * 60 * 1000,
        max: 2,
        keyGenerator: () => key,
        code: 'vision_intake_rate_limit',
      }),
      (_req, res) => res.json({ ok: true }),
    );

    await request(app).post('/intake').expect(200);
    await request(app).post('/intake').expect(200);
    const res = await request(app).post('/intake').expect(429);
    expect(res.body.code).toBe('vision_intake_rate_limit');
  });
});
