// DANH: skill-round3-reviews
import { describe, it, expect } from 'vitest';
import { execute as getReviewSummary } from '../../lib/toolExecutors/get_review_summary.js';
import {
  draftReviewReply,
  execute as draftReviewResponse,
} from '../../lib/toolExecutors/draft_review_response.js';

describe('review executors', () => {
  it('get_review_summary returns honest stub without Review model', async () => {
    const result = await getReviewSummary({ storeId: 'store-1' });
    expect(result.status).toBe('ok');
    expect(result.output.status).toBe('not_implemented');
    expect(result.output.reason).toMatch(/Review model/i);
    expect(result.output.reviews).toEqual([]);
  });

  it('get_review_summary fails without storeId', async () => {
    const result = await getReviewSummary({});
    expect(result.status).toBe('failed');
  });

  it('draft_review_response returns drafted false when review null', async () => {
    const result = await draftReviewResponse({ review: null });
    expect(result.status).toBe('ok');
    expect(result.output.drafted).toBe(false);
    expect(result.output.reason).toMatch(/No pending review/i);
  });

  it('draft_review_response drafts suggestion for review', async () => {
    const result = draftReviewReply({
      review: { author: 'Alex', rating: 5, text: 'Loved it' },
      storeName: 'Bistro',
      brandTone: 'friendly',
    });
    expect(result.drafted).toBe(true);
    expect(result.suggestion).toContain('Alex');
    expect(result.suggestion).toContain('Bistro');
  });
});
