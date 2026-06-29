/**
 * @vitest-environment node
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  BLUEPRINT_REGISTRY,
  invalidateBlueprintCache,
  listBlueprintMissionTypes,
  listBundledBlueprintFiles,
  loadBlueprint,
  loadBlueprintDocument,
  materializeBlueprintSteps,
  validateBlueprint,
} from '../blueprintLoader.js';

describe('blueprintLoader', () => {
  beforeEach(() => {
    invalidateBlueprintCache();
    delete process.env.BLUEPRINT_DIR;
  });

  it('lists bundled blueprint mission types', () => {
    expect(listBlueprintMissionTypes()).toContain('store');
    expect(listBlueprintMissionTypes()).toContain('launch_campaign');
    expect(listBundledBlueprintFiles().length).toBeGreaterThanOrEqual(2);
  });

  it('loads and validates store blueprint document', () => {
    const doc = loadBlueprintDocument('store');
    expect(doc).not.toBeNull();
    expect(doc?.id).toBe('store');
    expect(doc?.version).toBe('1.0.0');
    expect(Array.isArray(doc?.steps)).toBe(true);
    expect(doc?.steps.length).toBe(3);
    const validation = validateBlueprint(doc);
    expect(validation.ok).toBe(true);
  });

  it('materializes store steps with English locale', () => {
    const steps = materializeBlueprintSteps('store', 'en');
    expect(steps).toHaveLength(3);
    expect(steps[0]?.toolName).toBe('structured_store_build');
    expect(steps[1]?.stepKind).toBe('checkpoint');
    expect(steps[1]?.configJson?.outputKey).toBe('brandAssetsChoice');
    expect(steps[1]?.configJson?.options).toEqual([
      'Upload logo',
      'Upload hero video',
      'Choose from library',
      'Skip',
    ]);
    expect(steps[2]?.toolName).toBe('analyze_store');
  });

  it('materializes campaign steps with localized labels', () => {
    const steps = materializeBlueprintSteps('launch_campaign', 'vi');
    expect(steps).toHaveLength(5);
    expect(steps[0]?.label).toBe('Nghiên cứu');
    expect(steps[1]?.configJson?.prompt).toContain('sản phẩm');
    expect(steps[4]?.configJson?.condition).toBe('launchDecision === "Launch now"');
  });

  it('keeps English option values for vi locale (conditional matching)', () => {
    const steps = materializeBlueprintSteps('store', 'vi');
    const logo = steps.find((s) => s.toolName === 'mission.checkpoint');
    expect(logo?.configJson?.options).toEqual(['Upload now', 'Skip', 'Choose from library']);
  });

  it('loadBlueprint returns WorkflowBlueprintView shape with version', () => {
    const view = loadBlueprint('store', 'en');
    expect(view).not.toBeNull();
    expect(view?.version).toBe('1.0.0');
    expect(view?.name).toBe('Store creation workflow');
    expect(view?.steps.length).toBe(4);
    expect(view?.checkpoints.length).toBe(1);
    expect(view?.dependencies.length).toBe(3);
  });

  it('validateBlueprint rejects invalid documents', () => {
    const result = validateBlueprint({ id: 'bad' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('loads blueprint from BLUEPRINT_DIR override without code change', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cardbey-blueprints-'));
    const custom = {
      id: 'store',
      name: 'Custom store workflow',
      version: '1.0.0',
      missionType: 'store',
      steps: [
        {
          id: 'only_step',
          orderIndex: 0,
          stepKind: 'action',
          toolName: 'custom_tool',
          labels: { en: 'Custom only' },
        },
      ],
    };
    writeFileSync(join(dir, 'store.v1.json'), JSON.stringify(custom));
    process.env.BLUEPRINT_DIR = dir;
    invalidateBlueprintCache();

    const steps = materializeBlueprintSteps('store', 'en');
    expect(steps).toHaveLength(1);
    expect(steps[0]?.toolName).toBe('custom_tool');
    expect(steps[0]?.label).toBe('Custom only');
  });

  it('registry maps mission types to default versions', () => {
    expect(BLUEPRINT_REGISTRY.store.defaultVersion).toBe('1.0.0');
    expect(BLUEPRINT_REGISTRY.launch_campaign.fileVersion).toBe('v1');
  });
});
