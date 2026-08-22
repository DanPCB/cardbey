import { describe, expect, it } from 'vitest';
import { markDuplicateDevicesInList } from './deviceListDuplicateMarking.js';

describe('markDuplicateDevicesInList', () => {
  it('marks older shared-installationId duplicate as duplicate_stale and keeps winner online', () => {
    const now = new Date('2026-05-27T12:00:00Z');
    const devices = [
      {
        id: 'old-id',
        tenantId: 't1',
        storeId: 's1',
        type: 'screen',
        platform: 'android',
        model: 'Falcon',
        installationId: 'install-same',
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
        installationId: 'install-same',
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

  it('does not demote two screens at same store with same platform/model but distinct installationIds', () => {
    const now = new Date('2026-05-27T12:00:00Z');
    const devices = [
      {
        id: 'lg-nano',
        tenantId: 't1',
        storeId: 's1',
        type: 'screen',
        platform: 'webos_tv',
        model: '',
        installationId: 'install-a',
        lastSeenAt: now.toISOString(),
        isOnline: true,
        status: 'online',
        playlist: { playlistId: 'B01' },
      },
      {
        id: 'lg-02',
        tenantId: 't1',
        storeId: 's1',
        type: 'screen',
        platform: 'webos_tv',
        model: '',
        installationId: 'install-b',
        lastSeenAt: new Date(now.getTime() - 3_000).toISOString(),
        isOnline: true,
        status: 'online',
      },
    ];

    markDuplicateDevicesInList(devices, now);

    expect(devices.every((d) => d.presenceTier !== 'duplicate_stale')).toBe(true);
    expect(devices.every((d) => d.duplicateStale !== true)).toBe(true);
    expect(devices.find((d) => d.id === 'lg-02')?.isOnline).toBe(true);
  });

  it('does not demote multi-screen store when installationId is missing (weak fingerprint alone)', () => {
    const now = new Date('2026-05-27T12:00:00Z');
    const devices = [
      {
        id: 'screen-1',
        tenantId: 't1',
        storeId: 's1',
        type: 'screen',
        platform: 'webos_tv',
        model: '',
        lastSeenAt: now.toISOString(),
        isOnline: true,
        status: 'online',
        playlist: { playlistId: 'pl1' },
      },
      {
        id: 'screen-2',
        tenantId: 't1',
        storeId: 's1',
        type: 'screen',
        platform: 'webos_tv',
        model: '',
        lastSeenAt: new Date(now.getTime() - 5_000).toISOString(),
        isOnline: true,
        status: 'online',
      },
    ];

    markDuplicateDevicesInList(devices, now);

    expect(devices.every((d) => d.presenceTier !== 'duplicate_stale')).toBe(true);
    expect(devices.find((d) => d.id === 'screen-2')?.isOnline).toBe(true);
  });
});
