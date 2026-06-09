// DANH: skill-round2-menu
import { describe, it, expect } from 'vitest';
import { skillRegistry } from '../SkillRegistry.js';
import { MenuSyncSkill } from '../definitions/MenuSyncSkill.js';

describe('MenuSyncSkill', () => {
  it("registers under 'menu_sync'", () => {
    expect(skillRegistry.has('menu_sync')).toBe(true);
    expect(skillRegistry.get('menu_sync')?.name).toBe('menu_sync');
  });

  it('findByTrigger(sync_menu) returns MenuSyncSkill', () => {
    expect(skillRegistry.findByTrigger('sync_menu')?.name).toBe('menu_sync');
  });

  it('findByTrigger(menu) returns MenuSyncSkill', () => {
    expect(skillRegistry.findByTrigger('menu')?.name).toBe('menu_sync');
  });

  it('uses manage_menu_sync tool', () => {
    expect(MenuSyncSkill.steps[0]?.tool).toBe('manage_menu_sync');
  });

  it('buildInput defaults action to validate', () => {
    const buildInput = MenuSyncSkill.steps[0]?.buildInput;
    const input = buildInput?.({ storeId: 's1', toolInput: {} });
    expect(input?.action).toBe('validate');
    expect(input?.storeId).toBe('s1');
  });

  it('buildInput passes sync_from_source items', () => {
    const buildInput = MenuSyncSkill.steps[0]?.buildInput;
    const input = buildInput?.({
      storeId: 's1',
      toolInput: {
        action: 'sync_from_source',
        source: 'csv',
        items: [{ name: 'Espresso', price: 4 }],
      },
    });
    expect(input?.action).toBe('sync_from_source');
    expect(input?.items).toHaveLength(1);
  });
});
