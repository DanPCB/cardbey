import { describe, it, expect } from 'vitest';
import { skillRegistry } from '../SkillRegistry.js';
import { SmartDisplayPublishSkill } from '../definitions/SmartDisplayPublishSkill.js';

describe('SmartDisplayPublishSkill', () => {
  it("registers under name 'smart_display_publish'", () => {
    expect(skillRegistry.has('smart_display_publish')).toBe(true);
    expect(skillRegistry.get('smart_display_publish')?.name).toBe('smart_display_publish');
  });

  it('findByTrigger(publish_to_display) returns SmartDisplayPublishSkill', () => {
    expect(skillRegistry.findByTrigger('publish_to_display')?.name).toBe('smart_display_publish');
  });

  it('findByTrigger(show_on_screen) returns SmartDisplayPublishSkill', () => {
    expect(skillRegistry.findByTrigger('show_on_screen')?.name).toBe('smart_display_publish');
  });

  it('has all 4 steps with correct tool names', () => {
    const steps = SmartDisplayPublishSkill.steps;
    expect(steps).toHaveLength(4);
    expect(steps.map((s) => s.tool)).toEqual([
      'select_display_content',
      'format_for_display',
      'push_to_display_device',
      'verify_display_output',
    ]);
  });

  it('verify step is required: false', () => {
    const step = SmartDisplayPublishSkill.steps.find((s) => s.id === 'verify');
    expect(step?.required).toBe(false);
  });

  it('retryPolicy shouldRetry is false for DEVICE_NOT_PAIRED', () => {
    const shouldRetry = SmartDisplayPublishSkill.retryPolicy?.shouldRetry;
    expect(shouldRetry?.({ code: 'DEVICE_NOT_PAIRED' })).toBe(false);
    expect(shouldRetry?.({ code: 'VALIDATION_ERROR' })).toBe(false);
    expect(shouldRetry?.({ code: 'PERMISSION_DENIED' })).toBe(false);
  });

  it('retryPolicy shouldRetry is true for network error', () => {
    const shouldRetry = SmartDisplayPublishSkill.retryPolicy?.shouldRetry;
    expect(shouldRetry?.({ code: 'NETWORK_ERROR', message: 'network timeout' })).toBe(true);
  });
});
