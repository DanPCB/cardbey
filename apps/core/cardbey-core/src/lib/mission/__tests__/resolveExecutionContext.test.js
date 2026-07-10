/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchStores: vi.fn(async () => []),
  validateStore: vi.fn(async () => true),
}));

vi.mock('../../intake/resolveStoreAmbiguity.js', () => ({
  fetchUserStoresForDisambiguation: (...args) => mocks.fetchStores(...args),
  validateUserStoreId: (...args) => mocks.validateStore(...args),
}));

import {
  resolveExecutionContext,
  buildResolvedExecutionContext,
} from '../resolveExecutionContext.js';

const STORES = [
  {
    id: 'store_a',
    name: 'ABC Coffee',
    type: 'cafe',
    city: 'Melbourne',
    primaryColor: '#6F4E37',
    logoUrl: 'https://example.com/a.png',
  },
  {
    id: 'store_b',
    name: 'Pho Chu The',
    type: 'restaurant',
    city: 'Sydney',
    primaryColor: '#D97706',
    logoUrl: null,
  },
];

describe('resolveExecutionContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateStore.mockResolvedValue(true);
  });

  it('auto-selects when user owns one store', async () => {
    mocks.fetchStores.mockResolvedValue([STORES[0]]);
    const result = await resolveExecutionContext({
      userId: 'user_1',
      lockedTool: 'setup_loyalty_program',
    });
    expect(result.resolved).toBe(true);
    expect(result.executionContext?.storeId).toBe('store_a');
    expect(result.executionContext?.selectionMethod).toBe('automatic');
    expect(result.executionContext?.storeLocked).toBe(true);
  });

  it('asks to confirm active space when multiple stores and hint present', async () => {
    mocks.fetchStores.mockResolvedValue(STORES);
    const result = await resolveExecutionContext({
      userId: 'user_1',
      hintedStoreId: 'store_a',
      lockedTool: 'setup_loyalty_program',
      intentText: 'Create loyalty program from card',
    });
    expect(result.resolved).toBe(false);
    expect(result.kind).toBe('confirm_active_space');
    expect(result.clarify?.clarifyType).toBe('active_space_confirm');
    expect(result.clarify?.activeStoreCandidate?.id).toBe('store_a');
    expect(result.clarify?.storeCandidates).toHaveLength(2);
  });

  it('shows multi-store picker when no hint', async () => {
    mocks.fetchStores.mockResolvedValue(STORES);
    const result = await resolveExecutionContext({
      userId: 'user_1',
      lockedTool: 'setup_loyalty_program',
    });
    expect(result.resolved).toBe(false);
    expect(result.kind).toBe('multi_store_picker');
    expect(result.clarify?.clarifyType).toBe('execution_context_store_picker');
  });

  it('resolves after active-space confirmation', async () => {
    mocks.fetchStores.mockResolvedValue(STORES);
    const result = await resolveExecutionContext({
      userId: 'user_1',
      hintedStoreId: 'store_a',
      confirmedActiveSpace: true,
      selectionMethod: 'active-space',
      lockedTool: 'setup_loyalty_program',
    });
    expect(result.resolved).toBe(true);
    expect(result.executionContext?.selectionMethod).toBe('active-space');
    expect(result.executionContext?.selectedStore?.name).toBe('ABC Coffee');
  });

  it('buildResolvedExecutionContext includes brand theme', () => {
    const ctx = buildResolvedExecutionContext(STORES[0], { selectionMethod: 'manual' });
    expect(ctx.brandTheme?.primaryColor).toBe('#6F4E37');
    expect(ctx.location).toContain('Melbourne');
  });
});
