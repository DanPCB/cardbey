import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/config/features.js', () => ({
  Features: {
    performerContentEditingBridge: { v1: false },
  },
}));

describe('performerContentEditingBridge flag off', () => {
  it('assertBridgeEnabled rejects when disabled', async () => {
    const { assertBridgeEnabled } = await import(
      '../../src/services/performerContentBridge/performerContentEditingBridge.js'
    );
    expect(() => assertBridgeEnabled()).toThrow(/disabled/i);
  });
});
