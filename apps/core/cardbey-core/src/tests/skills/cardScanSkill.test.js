// DANH: skill-round5-tests
import { describe, it, expect } from 'vitest';
import { skillRegistry } from '../../lib/skills/SkillRegistry.js';
import { CardScanSkill } from '../../lib/skills/definitions/CardScanSkill.js';
import { ProductCatalogSkill } from '../../lib/skills/definitions/ProductCatalogSkill.js';
import { execute as checkScanCapability } from '../../lib/toolExecutors/scan/check_scan_capability.js';

function matchesTrigger(intent) {
  return skillRegistry.findByTrigger(intent)?.name === 'card_scan';
}

describe('CardScanSkill', () => {
  it('matches primary trigger scan_card', () => {
    expect(matchesTrigger('scan_card')).toBe(true);
  });

  it('does not match unrelated intent', () => {
    expect(matchesTrigger('create_promotion')).toBe(false);
  });

  it('triggers do not overlap ProductCatalogSkill triggers', () => {
    const scan = new Set(CardScanSkill.triggers);
    const overlap = (ProductCatalogSkill.triggers ?? []).filter((t) => scan.has(t));
    expect(overlap).toEqual([]);
  });

  it('execute returns valid tool result shape on capability check', async () => {
    const result = await checkScanCapability({ userId: 'u1' });
    expect(result.status).toBe('ok');
    expect(typeof result.output.available).toBe('boolean');
  });

  it('step list is non-empty and ordered', () => {
    expect(CardScanSkill.steps.map((s) => s.tool)).toEqual([
      'check_scan_capability',
      'extract_card_data',
      'create_product_from_card',
    ]);
  });

  it('missing userId handled gracefully on capability executor', async () => {
    const result = await checkScanCapability({});
    expect(result.status).toBe('ok');
    expect(result.output).toBeDefined();
  });
});
