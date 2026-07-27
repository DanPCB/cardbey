// DANH: skill-round4-content
import { describe, it, expect } from 'vitest';
import { skillRegistry } from '../../lib/skills/SkillRegistry.js';
import { ContentRewriteSkill } from '../../lib/skills/definitions/ContentRewriteSkill.js';
import { CampaignSkill } from '../../lib/skills/definitions/CampaignSkill.js';
import { execute as fetchStoreContent } from '../../lib/toolExecutors/content/fetch_store_content.js';

function matchesTrigger(intent) {
  return skillRegistry.findByTrigger(intent)?.name === 'content_rewrite';
}

describe('ContentRewriteSkill', () => {
  it('matches primary trigger rewrite_descriptions', () => {
    expect(matchesTrigger('rewrite_descriptions')).toBe(true);
  });

  it('does not match unrelated intent', () => {
    expect(matchesTrigger('launch_campaign')).toBe(false);
  });

  it('triggers do not overlap CampaignSkill triggers', () => {
    const content = new Set(ContentRewriteSkill.triggers);
    const overlap = (CampaignSkill.triggers ?? []).filter((t) => content.has(t));
    expect(overlap).toEqual([]);
  });

  it('step list is non-empty and ordered', () => {
    expect(ContentRewriteSkill.steps.map((s) => s.tool)).toEqual([
      'fetch_store_content',
      'rewrite_content_copy',
    ]);
  });

  it('execute returns valid tool result shape on fetch step', async () => {
    const result = await fetchStoreContent({ storeId: 'missing-store' });
    expect(['ok', 'failed']).toContain(result.status);
    expect(result.output).toBeDefined();
  });

  it('missing storeId handled gracefully on fetch executor', async () => {
    const result = await fetchStoreContent({});
    expect(result.status).toBe('failed');
    expect(result.output?.error).toBe('storeId is required');
  });
});
