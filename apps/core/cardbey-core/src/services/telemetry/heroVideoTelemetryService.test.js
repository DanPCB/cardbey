/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  deriveStorageKeyFromUrl,
  parseHeroVideoTelemetryBody,
} from './heroVideoTelemetryService.js';

describe('heroVideoTelemetryService', () => {
  it('parseHeroVideoTelemetryBody accepts verify.attempt payload', () => {
    const parsed = parseHeroVideoTelemetryBody({
      event: 'verify.attempt',
      url: 'https://cdn.example.com/media/abc.mp4',
      attempt: 2,
      status: 404,
      environment: 'staging',
      ts: 1717000000000,
    });
    expect(parsed).toMatchObject({
      eventType: 'verify.attempt',
      url: 'https://cdn.example.com/media/abc.mp4',
      storageKey: 'media/abc.mp4',
      attemptNumber: 2,
      httpStatus: 404,
      environment: 'staging',
    });
    expect(parsed?.clientTs).toBeInstanceOf(Date);
  });

  it('parseHeroVideoTelemetryBody rejects unknown events', () => {
    expect(parseHeroVideoTelemetryBody({ event: 'unknown' })).toBeNull();
    expect(parseHeroVideoTelemetryBody(null)).toBeNull();
  });

  it('deriveStorageKeyFromUrl handles /uploads paths', () => {
    expect(deriveStorageKeyFromUrl('/uploads/media/123-abc.mp4')).toBe('media/123-abc.mp4');
  });
});
