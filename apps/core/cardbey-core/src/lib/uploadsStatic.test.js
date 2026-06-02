import { describe, expect, it } from 'vitest';
import { detectUploadContentType, resolveUploadContentType } from './uploadsStatic.js';

describe('uploadsStatic', () => {
  it('detects video/mp4 for .mp4 files', () => {
    expect(detectUploadContentType('/data/uploads/media/foo.mp4')).toEqual({
      type: 'video/mp4',
      supportsRange: true,
    });
  });

  it('resolves type from request path when file path lacks extension', () => {
    const info = resolveUploadContentType('/tmp/noext', '/media/hero.mp4');
    expect(info?.type).toBe('video/mp4');
  });
});
