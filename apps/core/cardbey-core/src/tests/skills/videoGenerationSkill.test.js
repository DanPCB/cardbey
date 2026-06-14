// DANH: skill-round5-tests
import { describe, it, expect } from 'vitest';
import { skillRegistry } from '../../lib/skills/SkillRegistry.js';
import { VideoGenerationSkill } from '../../lib/skills/definitions/VideoGenerationSkill.js';
import { AnalyticsReportSkill } from '../../lib/skills/definitions/AnalyticsReportSkill.js';
import { execute as analyzeVideoBrief } from '../../lib/toolExecutors/video/analyze_video_brief.js';

function matchesTrigger(intent) {
  return skillRegistry.findByTrigger(intent)?.name === 'video_generation';
}

describe('VideoGenerationSkill', () => {
  it('matches primary trigger create_video', () => {
    expect(matchesTrigger('create_video')).toBe(true);
  });

  it('does not match unrelated intent', () => {
    expect(matchesTrigger('book_appointment')).toBe(false);
  });

  it('triggers do not overlap AnalyticsReportSkill triggers', () => {
    const video = new Set(VideoGenerationSkill.triggers);
    const overlap = (AnalyticsReportSkill.triggers ?? []).filter((t) => video.has(t));
    expect(overlap).toEqual([]);
  });

  it('execute returns valid tool result shape on brief step', async () => {
    const result = await analyzeVideoBrief({ storeId: 'store-1', userMessage: 'promo video' });
    expect(result.status).toBe('ok');
    expect(result.output).toBeDefined();
    expect(result.output.style).toBeTruthy();
  });

  it('step list is non-empty and ordered', () => {
    expect(VideoGenerationSkill.steps.map((s) => s.tool)).toEqual([
      'video_plan',
      'video_execute',
      'video_audio',
    ]);
  });

  it('missing storeId handled gracefully on brief executor', async () => {
    const result = await analyzeVideoBrief({});
    expect(result.status).toBe('ok');
    expect(result.output?.style).toBeTruthy();
  });
});
