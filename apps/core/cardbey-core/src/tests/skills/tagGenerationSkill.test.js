// DANH: skill-round4-tags
import { describe, it, expect } from 'vitest';
import { skillRegistry } from '../../lib/skills/SkillRegistry.js';
import { TagGenerationSkill } from '../../lib/skills/definitions/TagGenerationSkill.js';
import { CampaignSkill } from '../../lib/skills/definitions/CampaignSkill.js';
import { execute as generateSeoTags } from '../../lib/toolExecutors/content/generate_seo_tags.js';

function matchesTrigger(intent) {
  return skillRegistry.findByTrigger(intent)?.name === 'tag_generation';
}

describe('TagGenerationSkill', () => {
  it('matches primary trigger generate_tags', () => {
    expect(matchesTrigger('generate_tags')).toBe(true);
  });

  it('does not match unrelated intent', () => {
    expect(matchesTrigger('create_booking')).toBe(false);
  });

  it('triggers do not overlap CampaignSkill triggers', () => {
    const tags = new Set(TagGenerationSkill.triggers);
    const overlap = (CampaignSkill.triggers ?? []).filter((t) => tags.has(t));
    expect(overlap).toEqual([]);
  });

  it('step list is non-empty and ordered', () => {
    expect(TagGenerationSkill.steps.map((s) => s.tool)).toEqual([
      'fetch_store_content',
      'generate_seo_tags',
    ]);
  });

  it('execute returns valid tool result shape on tag step', async () => {
    const result = await generateSeoTags({
      products: [{ id: 'p1', name: 'Latte' }],
      businessCategory: 'cafe',
    });
    expect(result.status).toBe('ok');
    expect(result.output.productTags.length).toBe(1);
    expect(result.output.storeTags.length).toBeGreaterThan(0);
  });

  it('missing storeId handled gracefully via empty products input', async () => {
    const result = await generateSeoTags({ products: [] });
    expect(result.status).toBe('ok');
    expect(result.output.productTags).toEqual([]);
  });
});
