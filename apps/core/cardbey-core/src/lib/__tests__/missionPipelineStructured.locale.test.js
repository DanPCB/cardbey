/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  checkpointOptionValues,
  getStructuredMissionSteps,
  resolveCheckpointOptionsForLocale,
} from '../missionPipelineStructured.js';

describe('missionPipelineStructured locale', () => {
  it('keeps English option values for pipeline conditionals', () => {
    const steps = getStructuredMissionSteps('store', 'vi');
    const logo = steps.find((s) => s.toolName === 'mission.checkpoint');
    expect(logo?.configJson?.options).toEqual(['Upload now', 'Skip', 'Choose from library']);
    expect(logo?.configJson?.optionItems?.[0]?.value).toBe('Upload now');
    expect(logo?.configJson?.optionItems?.[0]?.displayLabel?.vi).toBe('Tải lên ngay');
  });

  it('localizes step labels and checkpoint prompts for vi', () => {
    const steps = getStructuredMissionSteps('store', 'vi');
    expect(steps[0]?.label).toBe('Logo');
    expect(steps[0]?.configJson?.prompt).toContain('logo');
    expect(steps[2]?.label).toBe('Tạo bản nháp cửa hàng');
    expect(steps[3]?.label).toBe('Xem lại cửa hàng');
  });

  it('resolveCheckpointOptionsForLocale returns vi display labels', () => {
    const steps = getStructuredMissionSteps('store', 'en');
    const items = steps[0]?.configJson?.optionItems ?? [];
    const resolved = resolveCheckpointOptionsForLocale(items, 'vi');
    expect(resolved.map((o) => o.value)).toEqual(checkpointOptionValues(items));
    expect(resolved[0]?.label).toBe('Tải lên ngay');
  });
});
