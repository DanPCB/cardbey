// DANH: skill-round5-tests
import { describe, it, expect } from 'vitest';
import { execute as analyzeVideoBrief } from '../../lib/toolExecutors/video/analyze_video_brief.js';
import { execute as generateVideoScript } from '../../lib/toolExecutors/video/generate_video_script.js';
import { execute as queueVideoGeneration } from '../../lib/toolExecutors/video/queue_video_generation.js';

describe('video executors', () => {
  it('analyze_video_brief returns ok output', async () => {
    const result = await analyzeVideoBrief({ storeId: 's1', userMessage: 'short promo' });
    expect(result.status).toBe('ok');
    expect(result.output?.style).toBeTruthy();
  });

  it('queue_video_generation returns honest stub when API unavailable', async () => {
    const result = await queueVideoGeneration({ script: 'Hello', style: 'promo' });
    expect(result.status).toBe('ok');
    expect(result.output?.queued).toBe(false);
    expect(result.output?.reason).toMatch(/not configured/i);
  });

  it('generate_video_script does not throw on empty input', async () => {
    const result = await generateVideoScript({});
    expect(result.status).toBe('ok');
    expect(result.output?.script).toBeTruthy();
  });

  it('generate_video_script side effect is read-only script text', async () => {
    const result = await generateVideoScript({
      style: 'promotional',
      duration: 20,
      storeName: 'Cafe',
    });
    expect(result.output?.scenes?.length).toBeGreaterThan(0);
    expect(result.output?.voiceover).toContain('Cafe');
  });
});
