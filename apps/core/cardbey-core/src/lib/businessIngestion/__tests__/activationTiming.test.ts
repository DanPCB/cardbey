import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  ACTIVATION_STALL_THRESHOLD_MS,
  averageDurationMs,
  computeActivationDurations,
  diffMs,
  formatDurationMs,
  isActivationStalled,
  withActivationDurations,
} from '../activationTiming.js';

describe('activationTiming', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('diffMs computes elapsed time between ISO timestamps', () => {
    expect(diffMs('2026-06-16T10:00:00.000Z', '2026-06-16T10:05:00.000Z')).toBe(300_000);
  });

  it('computeActivationDurations derives verification and activation windows', () => {
    const durations = computeActivationDurations({
      claimStartedAt: '2026-06-16T10:00:00.000Z',
      verifiedAt: '2026-06-16T10:30:00.000Z',
      activatedAt: '2026-06-16T11:00:00.000Z',
    });
    expect(durations.verificationDurationMs).toBe(1_800_000);
    expect(durations.activationDurationMs).toBe(1_800_000);
  });

  it('withActivationDurations patches seed record', () => {
    const seed = withActivationDurations({
      id: 's1',
      normalized: {} as never,
      resolution: 'unique',
      matchEvidence: [],
      qualityScore: 1,
      qualityTier: 'high_quality',
      verificationStatus: 'verified_owner',
      claimable: false,
      publicVisibility: 'limited',
      ownerUserId: 'u1',
      storeId: null,
      draftId: null,
      createdAt: '2026-06-16T09:00:00.000Z',
      updatedAt: '2026-06-16T11:00:00.000Z',
      claimStartedAt: '2026-06-16T10:00:00.000Z',
      verifiedAt: '2026-06-16T10:30:00.000Z',
      activatedAt: '2026-06-16T11:00:00.000Z',
    });
    expect(seed.verificationDurationMs).toBe(1_800_000);
    expect(seed.activationDurationMs).toBe(1_800_000);
  });

  it('isActivationStalled is true when claim started beyond threshold without verification', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-20T10:00:00.000Z'));
    expect(
      isActivationStalled({
        claimStartedAt: '2026-06-16T10:00:00.000Z',
        verifiedAt: null,
        verificationStatus: 'seeded_claimable',
      }),
    ).toBe(true);
    expect(
      isActivationStalled({
        claimStartedAt: '2026-06-20T09:00:00.000Z',
        verifiedAt: null,
        verificationStatus: 'seeded_claimable',
      }),
    ).toBe(false);
    expect(ACTIVATION_STALL_THRESHOLD_MS).toBe(72 * 60 * 60 * 1000);
  });

  it('averageDurationMs ignores invalid values', () => {
    expect(averageDurationMs([1000, 3000, null])).toBe(2000);
    expect(averageDurationMs([])).toBeNull();
  });

  it('formatDurationMs renders human units', () => {
    expect(formatDurationMs(45_000)).toBe('45s');
    expect(formatDurationMs(120_000)).toBe('2m');
  });
});
