import { describe, expect, it } from 'vitest';
import { assertValidHeroVideoUpload } from '../../utils/videoBinaryValidation.js';

function padMp4Buffer() {
  const buf = Buffer.alloc(110 * 1024);
  buf.write('ftyp', 4);
  return buf;
}

describe('hero upload video validation', () => {
  it('upload endpoint rejects tiny videos', () => {
    const tiny = Buffer.alloc(3000);
    tiny.write('ftyp', 4);
    const result = assertValidHeroVideoUpload(tiny, 'video/mp4');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('invalid_video_file');
    expect(result.message).toBe('Uploaded video is not playable');
  });

  it('accepts valid mp4 buffer', () => {
    const buf = padMp4Buffer();
    const result = assertValidHeroVideoUpload(buf, 'video/mp4');
    expect(result.ok).toBe(true);
  });
});
