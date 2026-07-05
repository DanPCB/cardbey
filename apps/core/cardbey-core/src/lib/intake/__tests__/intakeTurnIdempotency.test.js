import { describe, expect, it, beforeEach } from 'vitest';
import {
  buildIntakeTurnIdempotencyKey,
  clearIntakeTurnIdempotencyForTests,
  peekIntakeTurnIdempotentResponse,
  recordIntakeTurnIdempotentResponse,
  shouldCacheIntakeTurnIdempotentResponse,
} from '../intakeTurnIdempotency.js';

describe('intakeTurnIdempotency', () => {
  beforeEach(() => {
    clearIntakeTurnIdempotencyForTests();
  });

  it('includes activeStoreId in key so store selection busts replay cache', () => {
    const base = {
      actorKey: 'u:1',
      missionId: 'm:1',
      sessionKey: 's:1',
      userMessage: 'launch campaign',
    };
    const withoutStore = buildIntakeTurnIdempotencyKey(base);
    const withStore = buildIntakeTurnIdempotencyKey({ ...base, activeStoreId: 'store-a' });
    expect(withoutStore).not.toBe(withStore);
  });

  it('does not cache clarify / store picker responses', () => {
    expect(
      shouldCacheIntakeTurnIdempotentResponse({
        success: true,
        action: 'clarify',
        clarifyType: 'store_picker',
      }),
    ).toBe(false);

    const key = buildIntakeTurnIdempotencyKey({
      actorKey: 'u:1',
      userMessage: 'create campaign',
    });
    recordIntakeTurnIdempotentResponse(key, {
      success: true,
      action: 'clarify',
      response: 'Which store?',
    });
    expect(peekIntakeTurnIdempotentResponse(key)).toBeNull();
  });

  it('caches successful dispatch responses', () => {
    const key = buildIntakeTurnIdempotencyKey({
      actorKey: 'u:1',
      userMessage: 'create campaign',
      activeStoreId: 'store-a',
    });
    const payload = { success: true, action: 'show_execution_plan', missionId: 'm-1' };
    recordIntakeTurnIdempotentResponse(key, payload);
    expect(peekIntakeTurnIdempotentResponse(key)).toEqual(payload);
  });
});
