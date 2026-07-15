import { describe, expect, it, vi } from 'vitest';
import {
  hashInstallationId,
  normalizeInstallationId,
  resolveCanonicalDevice,
  buildDuplicateReportEntry,
  isDeviceArchived,
} from './deviceIdentity.js';

describe('deviceIdentity', () => {
  it('normalizes blank / sentinel installation ids to NULL', () => {
    expect(normalizeInstallationId(' ')).toBeNull();
    expect(normalizeInstallationId('unknown')).toBeNull();
  });

  it('hashes installation id without exposing the raw value', () => {
    const a = hashInstallationId('68035bd2-c45c-4c11-9352-aaaaaaaaaaaa');
    const b = hashInstallationId('68035bd2-c45c-4c11-9352-aaaaaaaaaaaa');
    expect(a).toBe(b);
    expect(a).toHaveLength(16);
    expect(a).not.toContain('68035');
  });

  it('resolves by installationId before deviceId (Test A / H identity restore)', async () => {
    const installId = 'install-stable-1';
    const db = {
      device: {
        findFirst: vi.fn(async ({ where }) =>
          where.installationId === installId
            ? { id: 'canonical-1', installationId: installId, tenantId: 'temp', storeId: 'temp' }
            : null,
        ),
        findUnique: vi.fn(async () => ({ id: 'other-id', tenantId: 't', storeId: 's' })),
      },
      deviceCapability: {
        findMany: vi.fn(async () => []),
      },
    };

    const resolved = await resolveCanonicalDevice(db, {
      deviceId: 'stale-duplicate-id',
      installationId: installId,
    });
    expect(resolved.matchReason).toBe('installationId');
    expect(resolved.device.id).toBe('canonical-1');
  });

  it('falls back to deviceId when installation missing', async () => {
    const db = {
      device: {
        findFirst: vi.fn(async () => null),
        findUnique: vi.fn(async ({ where }) =>
          where.id === 'dev-99' ? { id: 'dev-99', tenantId: 'a', storeId: 'b' } : null,
        ),
      },
      deviceCapability: {
        findMany: vi.fn(async () => []),
      },
    };
    const resolved = await resolveCanonicalDevice(db, { deviceId: 'dev-99' });
    expect(resolved.matchReason).toBe('deviceId');
    expect(resolved.device.id).toBe('dev-99');
  });

  it('detects archived devices', () => {
    expect(isDeviceArchived({ archivedAt: '2026-01-01T00:00:00Z' })).toBe(true);
    expect(isDeviceArchived({})).toBe(false);
  });

  it('builds duplicate report with safe merge eligibility (Test I)', () => {
    const report = buildDuplicateReportEntry({
      canonicalDeviceId: '68035bd2-c45c-4c11-9352-aaaaaaaaaaaa',
      duplicateDeviceIds: ['6673fa7f-2fdd-488f-8712-01ed50a3fb30', 'c84ff875-e325-45da-8a15-9f0c0b88b990'],
      ownership: { accountId: 'account-a' },
      storeAssignment: 'store-1',
      lastSeenAt: '2026-07-15T00:00:00Z',
      playlistAssignment: null,
      reason: 'shared_installationId',
      safeMergeEligible: true,
      installationIdHash: 'abcd1234abcd1234',
    });
    expect(report.duplicateDeviceIds).toHaveLength(2);
    expect(report.safeMergeEligible).toBe(true);
    expect(report.reason).toBe('shared_installationId');
  });
});
