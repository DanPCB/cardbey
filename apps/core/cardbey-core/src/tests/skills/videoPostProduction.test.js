import { describe, it, expect } from 'vitest';
import {
  detectNarrationLanguage,
  resolveApprovedNarrationScript,
  resolveNarrationPolicy,
  VIDEO_REQUIRED_AUDIO_MISSING,
} from '../../lib/video/postProduction/narrationPolicy.js';
import { buildCaptionCuesFromNarration, cuesToWebVtt } from '../../lib/video/postProduction/captionFromNarration.js';

describe('narrationPolicy', () => {
  it('requires narration by default for marketing plans', () => {
    const policy = resolveNarrationPolicy({ script: 'Visit us today.' });
    expect(policy.narrationRequired).toBe(true);
    expect(policy.silentRequested).toBe(false);
    expect(VIDEO_REQUIRED_AUDIO_MISSING).toBe('VIDEO_REQUIRED_AUDIO_MISSING');
  });

  it('honours explicit silent video requests', () => {
    const policy = resolveNarrationPolicy({ script: 'x' }, 'Create a silent video for my store');
    expect(policy.silentRequested).toBe(true);
    expect(policy.narrationRequired).toBe(false);
  });

  it('uses approved voiceover as the caption source text', () => {
    expect(
      resolveApprovedNarrationScript({
        voiceover: 'Approved line.',
        script: 'Other script.',
      }),
    ).toBe('Approved line.');
  });

  it('detects Vietnamese narration', () => {
    expect(detectNarrationLanguage('Chào mừng quý khách đến cửa hàng.')).toBe('vi');
    expect(detectNarrationLanguage('Welcome to our store today.')).toBe('en');
  });
});

describe('captionFromNarration', () => {
  it('builds WebVTT cues from the same narration text', () => {
    const cues = buildCaptionCuesFromNarration({
      narrationText: 'Welcome. Visit us today.',
      totalDurationSec: 4,
    });
    expect(cues).toHaveLength(2);
    expect(cues[0].text).toBe('Welcome.');
    expect(cues[1].text).toBe('Visit us today.');
    const vtt = cuesToWebVtt(cues, { language: 'en' });
    expect(vtt).toContain('WEBVTT');
    expect(vtt).toContain('Language: en');
    expect(vtt).toContain('Welcome.');
  });
});
