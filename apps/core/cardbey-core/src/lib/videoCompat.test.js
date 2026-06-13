import { describe, expect, it } from 'vitest';
import {
  checkVideoCompatibility,
  videoUploadMaxTranscodeBytes,
  videoUploadSkipTranscodeEnabled,
} from './videoCompat.js';

describe('checkVideoCompatibility', () => {
  it('accepts H.264 yuv420p AAC faststart', () => {
    const r = checkVideoCompatibility({
      container: 'mov,mp4',
      duration: 10,
      video: { codec: 'h264', profile: 'Main', pixFmt: 'yuv420p' },
      audio: { codec: 'aac' },
      fastStart: true,
    });
    expect(r.compatible).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it('rejects HEVC', () => {
    const r = checkVideoCompatibility({
      video: { codec: 'hevc', pixFmt: 'yuv420p' },
      audio: null,
      fastStart: true,
    });
    expect(r.compatible).toBe(false);
    expect(r.reasons.some((x) => x.includes('hevc'))).toBe(true);
  });

  it('rejects moov at end', () => {
    const r = checkVideoCompatibility({
      video: { codec: 'h264', pixFmt: 'yuv420p' },
      audio: { codec: 'aac' },
      fastStart: false,
    });
    expect(r.compatible).toBe(false);
    expect(r.reasons).toContain('moov_atom_not_at_start');
  });
});

describe('video upload transcode policy', () => {
  it('defaults skip transcode off and 25MB cap', () => {
    const prevSkip = process.env.VIDEO_UPLOAD_SKIP_TRANSCODE;
    const prevMax = process.env.VIDEO_UPLOAD_MAX_TRANSCODE_MB;
    delete process.env.VIDEO_UPLOAD_SKIP_TRANSCODE;
    delete process.env.VIDEO_UPLOAD_MAX_TRANSCODE_MB;
    expect(videoUploadSkipTranscodeEnabled()).toBe(false);
    expect(videoUploadMaxTranscodeBytes()).toBe(25 * 1024 * 1024);
    if (prevSkip !== undefined) process.env.VIDEO_UPLOAD_SKIP_TRANSCODE = prevSkip;
    if (prevMax !== undefined) process.env.VIDEO_UPLOAD_MAX_TRANSCODE_MB = prevMax;
  });
});
