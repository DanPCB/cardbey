import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  maybeClearStaleUploadOnTextOnlyIntent,
} from '../intakePendingTurnHandling.js';
import * as persistBeliefDelta from '../../decision/persistBeliefDelta.js';

describe('intakePendingTurnHandling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clears stale upload on text-only explicit store intent', async () => {
    const clearSpy = vi
      .spyOn(persistBeliefDelta, 'clearStaleUploadBeliefContext')
      .mockResolvedValue(undefined);

    await maybeClearStaleUploadOnTextOnlyIntent({
      userMessage: 'Create a store for my business',
      sessionKey: 'sess-1',
      hasAttachment: false,
    });

    expect(clearSpy).toHaveBeenCalledWith('sess-1');
  });

  it('does not clear when message has attachment', async () => {
    const clearSpy = vi
      .spyOn(persistBeliefDelta, 'clearStaleUploadBeliefContext')
      .mockResolvedValue(undefined);

    await maybeClearStaleUploadOnTextOnlyIntent({
      userMessage: 'Create my first store',
      sessionKey: 'sess-1',
      hasAttachment: true,
    });

    expect(clearSpy).not.toHaveBeenCalled();
  });
});
