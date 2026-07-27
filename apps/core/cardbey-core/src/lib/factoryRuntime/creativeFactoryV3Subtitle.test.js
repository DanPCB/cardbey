import { describe, it, expect } from 'vitest';
import {
  buildSubtitleLines,
  linesToSrt,
  estimateVideoDurationSec,
  resolveVoiceoverText,
} from './creativeFactoryV3Subtitle.js';

describe('creativeFactoryV3Subtitle', () => {
  it('builds evenly timed subtitle lines from voiceover', () => {
    const lines = buildSubtitleLines('Hello world. Second line.', 20);
    expect(lines).toHaveLength(2);
    expect(lines[0].endSec).toBe(10);
    expect(lines[1].startSec).toBe(10);
  });

  it('produces valid SRT payload', () => {
    const lines = buildSubtitleLines('One line only', 10);
    const srt = linesToSrt(lines);
    expect(srt).toContain('00:00:00,000 -->');
    expect(srt).toContain('One line only');
  });

  it('estimates duration from scene plan', () => {
    const sec = estimateVideoDurationSec(
      { scenes: [{ durationSec: 4 }, { durationSec: 6 }] },
      {},
    );
    expect(sec).toBe(10);
  });

  it('resolves voiceover from script draft', () => {
    expect(resolveVoiceoverText({ voiceoverCopy: 'Voice' }, {})).toBe('Voice');
  });
});
