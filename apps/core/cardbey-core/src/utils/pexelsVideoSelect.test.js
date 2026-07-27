import { describe, expect, it } from 'vitest';
import { selectPexelsVideoFile } from './pexelsVideoSelect.js';

describe('selectPexelsVideoFile', () => {
  it('prefers HD mp4 with width <= 1920', () => {
    const pick = selectPexelsVideoFile([
      { link: 'https://x.com/uhd.mp4', quality: 'uhd', file_type: 'video/mp4', width: 3840, height: 2160 },
      { link: 'https://x.com/hd.mp4', quality: 'hd', file_type: 'video/mp4', width: 1280, height: 720 },
      { link: 'https://x.com/sd.mp4', quality: 'sd', file_type: 'video/mp4', width: 640, height: 360 },
    ]);
    expect(pick?.url).toBe('https://x.com/hd.mp4');
    expect(pick?.quality).toBe('hd');
  });

  it('falls back to SD when no HD under 1920', () => {
    const pick = selectPexelsVideoFile([
      { link: 'https://x.com/uhd.mp4', quality: 'hd', file_type: 'video/mp4', width: 3840, height: 2160 },
      { link: 'https://x.com/sd.mp4', quality: 'sd', file_type: 'video/mp4', width: 960, height: 540 },
    ]);
    expect(pick?.url).toBe('https://x.com/sd.mp4');
  });

  it('returns null when no mp4 files', () => {
    expect(selectPexelsVideoFile([{ link: 'x', file_type: 'video/webm' }])).toBeNull();
  });
});
