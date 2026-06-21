import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const executeRuntimeActionMock = vi.hoisted(() => vi.fn());
const emitFactoryRouteAttemptedMock = vi.hoisted(() => vi.fn());
const emitFactoryRouteAcceptedMock = vi.hoisted(() => vi.fn());
const emitFactoryRouteRejectedMock = vi.hoisted(() => vi.fn());

vi.mock('../runtime/performerRuntime/executeRuntimeAction.js', () => ({
  executeRuntimeAction: (...args) => executeRuntimeActionMock(...args),
}));

vi.mock('./factoryTelemetry.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    emitFactoryRouteAttempted: (...args) => emitFactoryRouteAttemptedMock(...args),
    emitFactoryRouteAccepted: (...args) => emitFactoryRouteAcceptedMock(...args),
    emitFactoryRouteRejected: (...args) => emitFactoryRouteRejectedMock(...args),
  };
});

vi.mock('../missionBlackboard.js', () => ({
  appendEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../prisma.js', () => ({
  getPrismaClient: () => ({
    mission: {
      findUnique: vi.fn().mockResolvedValue({ context: null }),
    },
  }),
}));

describe('factoryIntentRouter broker bypass', () => {
  const envBackup = {};

  beforeEach(() => {
    for (const key of [
      'BROKER_BLOCK_DIRECT_ACTION',
      'ENABLE_CREATIVE_FACTORY_V1',
      'ENABLE_CREATIVE_FACTORY_V2',
      'ENABLE_CREATIVE_FACTORY_V3',
      'ENABLE_CREATIVE_FACTORY_V4',
    ]) {
      envBackup[key] = process.env[key];
    }
    process.env.BROKER_BLOCK_DIRECT_ACTION = 'true';
    process.env.ENABLE_CREATIVE_FACTORY_V1 = 'true';
    process.env.ENABLE_CREATIVE_FACTORY_V4 = 'true';
    delete process.env.ENABLE_CREATIVE_FACTORY_V2;
    delete process.env.ENABLE_CREATIVE_FACTORY_V3;
    executeRuntimeActionMock.mockReset();
    emitFactoryRouteAttemptedMock.mockClear();
    emitFactoryRouteAcceptedMock.mockClear();
    emitFactoryRouteRejectedMock.mockClear();
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(envBackup)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  it('routes Father\'s Day promo video via run_factory through kernel-authorized source', async () => {
    executeRuntimeActionMock.mockResolvedValue({
      status: 'ok',
      output: {
        factoryExecution: {
          factoryId: 'creative_asset_factory_v4',
          status: 'awaiting_factory_approval',
          missionId: 'm-fathers-day',
        },
      },
    });

    const { tryRouteFactoryIntent } = await import('./factoryIntentRouter.js');
    const result = await tryRouteFactoryIntent({
      intentLabel: 'create_video',
      userMessage: "Create a Father's Day promotional video for my store.",
      missionId: 'm-fathers-day',
      userId: 'user-1',
      storeId: 'store-1',
    });

    expect(executeRuntimeActionMock).toHaveBeenCalledTimes(1);
    const call = executeRuntimeActionMock.mock.calls[0][0];
    expect(call.actionType).toBe('run_factory');
    expect(call.source).toBe('intake_v2_unified');
    expect(call.payload.factoryId).toBe('creative_asset_factory_v4');
    expect(result?.factoryId).toBe('creative_asset_factory_v4');
    expect(result?.status).toBe('awaiting_factory_approval');
    expect(result?.actionType).toBe('run_factory');
    expect(result?.dispatchedVia).toBe('unified_dispatch');
    expect(emitFactoryRouteAttemptedMock).toHaveBeenCalled();
    expect(emitFactoryRouteAcceptedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        factoryId: 'creative_asset_factory_v4',
        missionId: 'm-fathers-day',
        userId: 'user-1',
      }),
    );
    expect(emitFactoryRouteRejectedMock).not.toHaveBeenCalled();
  });

  it('emits FACTORY_ROUTE_REJECTED when intent does not match factory registry', async () => {
    const { tryRouteFactoryIntent } = await import('./factoryIntentRouter.js');
    const result = await tryRouteFactoryIntent({
      intentLabel: 'analyze_store',
      userMessage: 'analyze store performance',
      missionId: 'm-1',
      userId: 'user-1',
    });

    expect(result).toBeNull();
    expect(executeRuntimeActionMock).not.toHaveBeenCalled();
    expect(emitFactoryRouteRejectedMock).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'no_factory_match' }),
    );
    expect(emitFactoryRouteAcceptedMock).not.toHaveBeenCalled();
  });
});
