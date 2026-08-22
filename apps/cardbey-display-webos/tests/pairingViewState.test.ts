import { describe, expect, it } from 'vitest';
import { pairingSnapshotToViewState } from '../src/pairing/pairingViewState.js';

describe('pairingSnapshotToViewState', () => {
  it('maps polling to WAITING with claim URL', () => {
    const view = pairingSnapshotToViewState(
      {
        status: 'polling',
        sessionId: 's1',
        code: 'Ab12Cd',
        expiresAt: '2026-07-24T04:00:00.000Z',
      },
      'https://example.com/devices?pairCode=Ab12Cd&pairSessionId=s1',
    );
    expect(view).toEqual({
      status: 'WAITING',
      sessionId: 's1',
      code: 'Ab12Cd',
      expiresAt: '2026-07-24T04:00:00.000Z',
      claimUrl: 'https://example.com/devices?pairCode=Ab12Cd&pairSessionId=s1',
    });
  });

  it('maps completing and failed states', () => {
    expect(
      pairingSnapshotToViewState({ status: 'completing', sessionId: 's1', completionInFlight: true }),
    ).toEqual({ status: 'COMPLETING', sessionId: 's1' });
    expect(
      pairingSnapshotToViewState({
        status: 'failed',
        errorCode: 'DISPLAY_NETWORK_ERROR',
        errorMessage: 'x',
      }),
    ).toMatchObject({ status: 'FAILED', errorCode: 'DISPLAY_NETWORK_ERROR', retryable: true });
  });
});
