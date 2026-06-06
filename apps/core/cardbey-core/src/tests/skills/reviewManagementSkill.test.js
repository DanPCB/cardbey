// DANH: skill-round3-reviews
import { describe, it, expect } from 'vitest';
import { skillRegistry } from '../../lib/skills/SkillRegistry.js';
import { ReviewManagementSkill } from '../../lib/skills/definitions/ReviewManagementSkill.js';
import { execute as getReviewSummary } from '../../lib/toolExecutors/get_review_summary.js';

function matchesTrigger(intent) {
  return skillRegistry.findByTrigger(intent)?.name === 'review_management';
}

describe('ReviewManagementSkill', () => {
  it('matches primary trigger reviews', () => {
    expect(matchesTrigger('reviews')).toBe(true);
  });

  it('does not match unrelated intent', () => {
    expect(matchesTrigger('product')).toBe(false);
  });

  it('has non-empty step list', () => {
    expect(ReviewManagementSkill.steps.length).toBe(2);
    expect(ReviewManagementSkill.steps[0]?.tool).toBe('get_review_summary');
    expect(ReviewManagementSkill.steps[1]?.tool).toBe('draft_review_response');
  });

  it('documents requiredContext fields', () => {
    expect(ReviewManagementSkill.requiredContext).toContain('storeId');
    expect(ReviewManagementSkill.requiredContext).toContain('userId');
  });

  it('draft step passes latest review when present', () => {
    const build = ReviewManagementSkill.steps[1].buildInput;
    const input = build?.(
      { storeId: 's1', toolInput: { storeName: 'Cafe' } },
      {
        review_summary: {
          output: {
            reviews: [{ author: 'Sam', rating: 5, text: 'Great coffee' }],
          },
        },
      },
    );
    expect(input?.review?.author).toBe('Sam');
    expect(input?.storeName).toBe('Cafe');
  });

  it('missing storeId fails gracefully on review summary executor', async () => {
    const result = await getReviewSummary({}, {});
    expect(result.status).toBe('failed');
    expect(result.output?.error).toBe('storeId is required');
  });
});
