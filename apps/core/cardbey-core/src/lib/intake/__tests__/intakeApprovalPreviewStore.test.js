import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  putIntakeApprovalPreview,
  getIntakeApprovalPreview,
  deleteIntakeApprovalPreview,
  clearIntakeApprovalPreviewStoreForTests,
} from '../intakeApprovalPreviewStore.js';

describe('intakeApprovalPreviewStore', () => {
  beforeEach(() => {
    clearIntakeApprovalPreviewStoreForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearIntakeApprovalPreviewStoreForTests();
  });

  it('stores and retrieves a preview for the TTL window', () => {
    putIntakeApprovalPreview({
      previewId: 'abc',
      tool: 'orders_report',
      executionParameters: { groupBy: 'day' },
      actorKey: 'u:1',
      tenantKey: 't:1',
      resolvedStoreIdAtPreview: 's1',
    });
    const row = getIntakeApprovalPreview('abc');
    expect(row).toBeTruthy();
    expect(row.tool).toBe('orders_report');
    expect(row.actorKey).toBe('u:1');
  });

  it('drops expired previews', () => {
    putIntakeApprovalPreview({
      previewId: 'exp',
      tool: 'x',
      executionParameters: {},
      actorKey: 'u:1',
      tenantKey: 't:1',
      resolvedStoreIdAtPreview: null,
    });
    vi.advanceTimersByTime(8 * 60 * 1000);
    expect(getIntakeApprovalPreview('exp')).toBeNull();
  });

  it('deleteIntakeApprovalPreview removes the row', () => {
    putIntakeApprovalPreview({
      previewId: 'del',
      tool: 'x',
      executionParameters: {},
      actorKey: 'u:1',
      tenantKey: 't:1',
      resolvedStoreIdAtPreview: null,
    });
    deleteIntakeApprovalPreview('del');
    expect(getIntakeApprovalPreview('del')).toBeNull();
  });
});
