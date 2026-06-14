import { describe, it, expect } from 'vitest';
import { skillRegistry } from '../SkillRegistry.js';
import '../definitions/VisionIntakeSkill.js';
import { VisionIntakeSkill } from '../definitions/VisionIntakeSkill.js';
import { getExecutor } from '../../toolExecutors/index.js';

describe('VisionIntakeSkill', () => {
  it('registers in skill registry', () => {
    expect(skillRegistry.has('vision_intake')).toBe(true);
    expect(skillRegistry.findByTrigger('capture_photo')?.name).toBe('vision_intake');
  });

  it('defines location, classify, and route steps', () => {
    const tools = VisionIntakeSkill.steps.map((s) => s.tool);
    expect(tools).toEqual([
      'resolve_vision_location',
      'classify_vision_event',
      'route_vision_event',
    ]);
  });

  it('wires executors for vision tools', () => {
    expect(getExecutor('resolve_vision_location')?.execute).toBeTypeOf('function');
    expect(getExecutor('classify_vision_event')?.execute).toBeTypeOf('function');
    expect(getExecutor('route_vision_event')?.execute).toBeTypeOf('function');
  });
});
