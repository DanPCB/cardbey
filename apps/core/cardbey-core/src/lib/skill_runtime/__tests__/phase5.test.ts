// DANH: skill-runtime-phase5
/**
 * Phase 5 tests — step adapter, executor factories, and real-step integration.
 *
 * The tool executors are mocked so these tests never touch Prisma/DB. The mocks
 * are declared with `vi.mock` (hoisted) at the top of the file and shared across
 * the factory + integration + regression cases.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock every tool executor the factories import (default export = execute) ──
const okResult = { status: 'ok' } as const;

vi.mock('../../toolExecutors/booking/check_booking_availability.js', () => ({
  default: vi.fn(async () => ({ ...okResult, step: 'check_availability' })),
}));
vi.mock('../../toolExecutors/booking/create_booking_record.js', () => ({
  default: vi.fn(async () => ({ ...okResult, step: 'create_booking' })),
}));
vi.mock('../../toolExecutors/booking/get_booking_summary.js', () => ({
  default: vi.fn(async () => ({ ...okResult, step: 'booking_summary' })),
}));
vi.mock('../../toolExecutors/catalog/manage_product_catalog.js', () => ({
  default: vi.fn(async () => ({ ...okResult, step: 'manage_catalog' })),
}));
vi.mock('../../toolExecutors/menu/manage_menu_sync.js', () => ({
  default: vi.fn(async () => ({ ...okResult, step: 'sync_menu' })),
}));
vi.mock('../../toolExecutors/get_store_analytics.js', () => ({
  default: vi.fn(async () => ({ ...okResult, step: 'store_analytics' })),
}));
vi.mock('../../toolExecutors/generate_report_summary.js', () => ({
  default: vi.fn(async () => ({ ...okResult, step: 'report_summary' })),
}));
vi.mock('../../toolExecutors/audit_store_completeness.js', () => ({
  default: vi.fn(async () => ({ ...okResult, step: 'audit_completeness' })),
}));
vi.mock('../../toolExecutors/generate_health_report.js', () => ({
  default: vi.fn(async () => ({ ...okResult, step: 'health_report' })),
}));

import { wrapExecutor, buildExecutorInput } from '../stepAdapter.js';
import {
  bookingManagementSteps,
  catalogManagementSteps,
  menuSyncSteps,
  storeHealthSteps,
  analyticsReportSteps,
  createPromotionSteps,
} from '../executorFactories.js';
import { SkillRuntime } from '../skill.js';
import { runtimeRegistry } from '../runtimeRegistry.js';
import type { SkillContext } from '../types.js';

function makeContext(overrides: Partial<SkillContext> = {}): SkillContext {
  return {
    query: 'test query',
    userId: 'user-1',
    conversationId: 'conv-1',
    userHasProducts: false,
    existingSegments: [],
    metadata: { storeId: 'store-1' },
    ...overrides,
  };
}

describe('stepAdapter — wrapExecutor', () => {
  it('returns a Step with the correct id and name', () => {
    const step = wrapExecutor('my_step', 'My description', async () => ({}));
    expect(step.id).toBe('my_step');
    expect(step.name).toBe('My description');
    expect(typeof step.execute).toBe('function');
  });

  it('buildExecutorInput pulls storeId from metadata and userId from top level', () => {
    const input = buildExecutorInput(
      makeContext({ userId: 'u-9', metadata: { storeId: 's-9', missionId: 'm-9' } })
    );
    expect(input.storeId).toBe('s-9');
    expect(input.userId).toBe('u-9');
    expect(input.missionId).toBe('m-9');
  });

  it('execute() calls the wrapped fn with storeId/userId and returns completed + output', async () => {
    const fn = vi.fn(async (input: Record<string, unknown>) => ({ echoed: input.storeId }));
    const step = wrapExecutor('s', 'd', fn);
    const result = await step.execute(
      makeContext({ userId: 'user-7', metadata: { storeId: 'store-7' } }),
      'running'
    );

    expect(fn).toHaveBeenCalledTimes(1);
    const passed = fn.mock.calls[0][0];
    expect(passed.storeId).toBe('store-7');
    expect(passed.userId).toBe('user-7');
    expect(result).toEqual({ stepId: 's', status: 'completed', output: { echoed: 'store-7' } });
  });

  it('execute() returns { status: failed, error } when fn throws — does not rethrow', async () => {
    const step = wrapExecutor('boom', 'd', async () => {
      throw new Error('kaboom');
    });
    const result = await step.execute(makeContext(), 'running');
    expect(result).toEqual({ stepId: 'boom', status: 'failed', error: 'kaboom' });
  });
});

describe('executorFactories — step counts', () => {
  it('bookingManagementSteps() returns 3 steps', () => {
    const steps = bookingManagementSteps();
    expect(steps).toHaveLength(3);
    expect(steps.map((s) => s.id)).toEqual([
      'check_availability',
      'create_booking',
      'booking_summary',
    ]);
  });

  it('catalogManagementSteps() returns 1 step', () => {
    expect(catalogManagementSteps()).toHaveLength(1);
    expect(catalogManagementSteps()[0].id).toBe('manage_catalog');
  });

  it('menuSyncSteps() returns 1 step', () => {
    expect(menuSyncSteps()).toHaveLength(1);
    expect(menuSyncSteps()[0].id).toBe('sync_menu');
  });

  it('storeHealthSteps() returns 2 steps', () => {
    expect(storeHealthSteps().map((s) => s.id)).toEqual([
      'audit_completeness',
      'health_report',
    ]);
  });

  it('analyticsReportSteps() returns 2 steps', () => {
    expect(analyticsReportSteps().map((s) => s.id)).toEqual([
      'store_analytics',
      'report_summary',
    ]);
  });

  it('createPromotionSteps() returns 1 step', () => {
    expect(createPromotionSteps()).toHaveLength(1);
    expect(createPromotionSteps()[0].id).toBe('create_promotion');
  });
});

describe('integration — SkillRuntime with real factory steps (mocked executors)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs all 3 booking steps to completion', async () => {
    const runtime = new SkillRuntime(
      'booking_management',
      'booking_management',
      bookingManagementSteps(),
      makeContext()
    );

    await runtime.start();

    expect(runtime.getState()).toBe('completed');

    const results = ['check_availability', 'create_booking', 'booking_summary'].map((id) =>
      runtime.getStepResult(id)
    );
    expect(results.every((r) => r?.status === 'completed')).toBe(true);
    expect(results.some((r) => r?.status === 'failed')).toBe(false);
  });
});

describe('regression — runtimeRegistry dispatches real steps', () => {
  it('booking dispatch resolves to a runtime with 3 steps (not 0)', async () => {
    const skill = await runtimeRegistry.dispatch(
      makeContext({ query: 'Book an appointment', userHasProducts: false })
    );
    expect(skill).not.toBeNull();
    expect(skill?.steps).toHaveLength(3);
  });
});
