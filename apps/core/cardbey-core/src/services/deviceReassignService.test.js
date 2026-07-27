import { describe, expect, it, vi, beforeEach } from 'vitest';
import { reassignDeviceStore } from './deviceReassignService.js';

vi.mock('../realtime/simpleSse.js', () => ({
  broadcastSse: vi.fn(),
}));

vi.mock('../engines/device/logs.js', () => ({
  addDeviceLog: vi.fn(async () => {}),
}));

vi.mock('../lib/deviceProjection.js', () => ({
  upsertDeviceMetadata: vi.fn(async () => ({ pairingStatus: 'PAIRED_NO_PLAYLIST' })),
  readDeviceMetadata: vi.fn(() => ({ pairingStatus: 'PAIRED_NO_PLAYLIST' })),
}));

vi.mock('../lib/deviceIdentity.js', () => ({
  logDeviceIdentityEvent: vi.fn(),
}));

describe('reassignDeviceStore (Test B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates existing device store without creating a new record', async () => {
    const device = {
      id: 'dev-same',
      tenantId: 'account-a',
      storeId: 'store-1',
      pairingCode: null,
      capabilities: [],
      bindings: [],
    };

    const tx = {
      devicePlaylistBinding: {
        updateMany: vi.fn(async () => ({ count: 1 })),
        upsert: vi.fn(async () => ({})),
      },
      device: {
        update: vi.fn(async ({ data }) => ({
          ...device,
          storeId: data.storeId,
          pairingCode: null,
        })),
      },
    };

    const prisma = {
      device: {
        findUnique: vi.fn(async () => device),
      },
      business: {
        findUnique: vi.fn(async () => ({
          id: 'store-2',
          userId: 'account-a',
          name: 'Store 2',
        })),
      },
      deviceCapability: {
        findUnique: vi.fn(async () => ({ capabilities: {} })),
      },
      $transaction: vi.fn(async (fn) => fn(tx)),
    };

    const result = await reassignDeviceStore(prisma, {
      deviceId: 'dev-same',
      tenantId: 'account-a',
      storeId: 'store-1',
      newStoreId: 'store-2',
      playlistId: 'pl-store-2',
      userId: 'account-a',
    });

    expect(result.ok).toBe(true);
    expect(result.deviceId).toBe('dev-same');
    expect(result.storeId).toBe('store-2');
    expect(result.previousStoreId).toBe('store-1');
    expect(prisma.device.findUnique).toHaveBeenCalledTimes(1);
    expect(tx.device.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'dev-same' },
        data: expect.objectContaining({ storeId: 'store-2' }),
      }),
    );
    expect(tx.devicePlaylistBinding.upsert).toHaveBeenCalled();
  });

  it('blocks cross-account store target (Test C)', async () => {
    const prisma = {
      device: {
        findUnique: vi.fn(async () => ({
          id: 'dev-1',
          tenantId: 'account-a',
          storeId: 'store-1',
          pairingCode: null,
          capabilities: [],
          bindings: [],
        })),
      },
      business: {
        findUnique: vi.fn(async () => ({
          id: 'store-b',
          userId: 'account-b',
          name: 'Other account store',
        })),
      },
    };

    await expect(
      reassignDeviceStore(prisma, {
        deviceId: 'dev-1',
        tenantId: 'account-a',
        newStoreId: 'store-b',
        userId: 'account-a',
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
