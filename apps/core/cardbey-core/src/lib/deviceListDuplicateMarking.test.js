import { describe, expect, it } from 'vitest';
import { markDuplicateDevicesInList } from './deviceListDuplicateMarking.js';

describe('markDuplicateDevicesInList', () => {
  it('marks older fingerprint duplicate as duplicate_stale and keeps winner online', () => {
    const now = new Date('2026-05-27T12:00:00Z');
    const devices = [
      {
        id: 'old-id',
        tenantId: 't1',
        storeId: 's1',
        type: 'screen',
        platform: 'android',
        model: 'Falcon',
        lastSeenAt: new Date(now.getTime() - 60_000).toISOString(),
        isOnline: false,
        status: 'offline',
      },
      {
        id: 'winner-id',
        tenantId: 't1',
        storeId: 's1',
        type: 'screen',
        platform: 'android',
        model: 'Falcon',
        lastSeenAt: now.toISOString(),
        isOnline: true,
        status: 'online',
        playlist: { playlistId: 'pl1' },
      },
    ];

    markDuplicateDevicesInList(devices, now);

    const winner = devices.find((d) => d.id === 'winner-id');
    const loser = devices.find((d) => d.id === 'old-id');
    expect(winner?.presenceTier).not.toBe('duplicate_stale');
    expect(loser?.presenceTier).toBe('duplicate_stale');
    expect(loser?.duplicateStale).toBe(true);
    expect(loser?.isOnline).toBe(false);
  });
});
