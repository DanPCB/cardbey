import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  verifyUnpairAuth,
  isDeviceAdmin,
  unpairDevice,
} from './deviceUnpairService.js';

vi.mock('../realtime/simpleSse.js', () => ({
  broadcastSse: vi.fn(),
}));

vi.mock('../engines/device/commands.js', () => ({
  enqueueDeviceCommand: vi.fn(async () => ({
    id: 'cmd-test-1',
    type: 'returnHome',
    status: 'pending',
  })),
}));

vi.mock('../engines/device/logs.js', () => ({
  addDeviceLog: vi.fn(async () => {}),
}));

vi.mock('../lib/deviceProjection.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    upsertDeviceMetadata: vi.fn(async (_prisma, deviceId, patch) => ({
      pairingStatus: patch.pairingStatus ?? null,
      currentPlaylistId: patch.currentPlaylistId ?? null,
    })),
    readDeviceMetadata: vi.fn(() => ({
      pairingStatus: 'UNPAIRED',
      currentPlaylistId: null,
    })),
  };
});

import { broadcastSse } from '../realtime/simpleSse.js';
import { enqueueDeviceCommand } from '../engines/device/commands.js';

function buildMockPrisma(deviceOverrides = {}) {
  const device = {
    id: 'dev-1',
    tenantId: 'tenant-a',
    storeId: 'store-a',
    pairingCode: 'ABC123',
    status: 'online',
    lastSeenAt: new Date('2026-05-27T10:00:00Z'),
    capabilities: [{ capabilities: { pairingStatus: 'paired' } }],
    bindings: [{ id: 'b1', status: 'ready', playlistId: 'pl-1' }],
    ...deviceOverrides,
  };

  const tx = {
    devicePlaylistBinding: {
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    device: {
      update: vi.fn(async () => ({
        ...device,
        tenantId: 'temp',
        storeId: 'temp',
        pairingCode: null,
        status: 'offline',
      })),
    },
    devicePairing: {
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    deviceCapability: {
      upsert: vi.fn(async () => ({ capabilities: {} })),
      findUnique: vi.fn(async () => ({ capabilities: {} })),
    },
  };

  const prisma = {
    device: {
      findUnique: vi.fn(async () => device),
    },
    deviceCapability: {
      findUnique: vi.fn(async () => ({ capabilities: { pairingStatus: 'UNPAIRED' } })),
    },
    $transaction: vi.fn(async (fn) => fn(tx)),
  };

  return { prisma, tx, device };
}

describe('deviceUnpairService auth', () => {
  it('allows owner tenant to unpair', () => {
    const result = verifyUnpairAuth(
      { tenantId: 'tenant-a', storeId: 'store-a' },
      { tenantId: 'tenant-a', storeId: 'store-a', userId: 'tenant-a' },
    );
    expect(result.ok).toBe(true);
  });

  it('blocks unauthorized tenant', () => {
    const result = verifyUnpairAuth(
      { tenantId: 'tenant-a', storeId: 'store-a' },
      { tenantId: 'tenant-b', storeId: 'store-a', userId: 'tenant-b' },
    );
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });

  it('allows admin override', () => {
    expect(isDeviceAdmin({ role: 'admin' })).toBe(true);
    const result = verifyUnpairAuth(
      { tenantId: 'tenant-a', storeId: 'store-a' },
      { tenantId: 'tenant-x', user: { role: 'super_admin' } },
    );
    expect(result.ok).toBe(true);
    expect(result.admin).toBe(true);
  });
});

describe('deviceUnpairService unpairDevice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('unpairs paired device, clears bindings, queues returnHome, emits SSE', async () => {
    const { prisma, tx } = buildMockPrisma();

    const result = await unpairDevice(prisma, {
      deviceId: 'dev-1',
      tenantId: 'tenant-a',
      storeId: 'store-a',
      userId: 'tenant-a',
    });

    expect(result.ok).toBe(true);
    expect(result.pairingStatus).toBe('UNPAIRED');
    expect(result.playlistId).toBeNull();
    expect(result.tenantId).toBe('temp');
    expect(result.storeId).toBe('temp');
    expect(tx.devicePlaylistBinding.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deviceId: 'dev-1' }),
        data: { status: 'unpaired' },
      }),
    );
    expect(enqueueDeviceCommand).toHaveBeenCalledWith(
      'dev-1',
      'returnHome',
      expect.objectContaining({
        reason: 'device_unpaired',
        clearPlaylist: true,
      }),
    );
    expect(broadcastSse).toHaveBeenCalledWith(
      'admin',
      'device:unpaired',
      expect.objectContaining({
        deviceId: 'dev-1',
        pairingStatus: 'UNPAIRED',
        playlistId: null,
      }),
    );
    expect(broadcastSse).toHaveBeenCalledWith(
      'admin',
      'device.status.changed',
      expect.objectContaining({ deviceId: 'dev-1' }),
    );
  });

  it('rejects unauthorized tenant', async () => {
    const { prisma } = buildMockPrisma();

    await expect(
      unpairDevice(prisma, {
        deviceId: 'dev-1',
        tenantId: 'tenant-b',
        storeId: 'store-a',
        userId: 'tenant-b',
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('keeps tenant/store when resetToTemp is false', async () => {
    const { prisma, tx } = buildMockPrisma();
    tx.device.update.mockImplementation(async () => ({
      id: 'dev-1',
      tenantId: 'tenant-a',
      storeId: 'store-a',
      status: 'offline',
      lastSeenAt: new Date(),
    }));

    const result = await unpairDevice(prisma, {
      deviceId: 'dev-1',
      tenantId: 'tenant-a',
      storeId: 'store-a',
      userId: 'tenant-a',
      resetToTemp: false,
    });

    expect(result.tenantId).toBe('tenant-a');
    expect(result.storeId).toBe('store-a');
    expect(tx.device.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ tenantId: 'temp' }),
      }),
    );
  });
});
