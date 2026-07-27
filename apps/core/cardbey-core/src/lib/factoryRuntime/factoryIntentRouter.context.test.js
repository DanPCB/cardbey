import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const executeRuntimeActionMock = vi.hoisted(() => vi.fn());
const resolveFactoryRoutingContextMock = vi.hoisted(() => vi.fn());
const emitFactoryRouteAttemptedMock = vi.hoisted(() => vi.fn());
const emitFactoryRouteAcceptedMock = vi.hoisted(() => vi.fn());
const emitFactoryRouteRejectedMock = vi.hoisted(() => vi.fn());

vi.mock('../runtime/performerRuntime/executeRuntimeAction.js', () => ({
  executeRuntimeAction: (...args) => executeRuntimeActionMock(...args),
}));

vi.mock('./factoryRoutingContext.js', () => ({
  resolveFactoryRoutingContext: (...args) => resolveFactoryRoutingContextMock(...args),
  isPlaceholderStoreId: (id) => String(id ?? '').trim().toLowerCase() === 'temp',
  resolveRealStoreId: (id) => (String(id ?? '').trim().toLowerCase() === 'temp' ? null : String(id ?? '').trim()),
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

describe('factoryIntentRouter context recovery', () => {
  const envBackup = {};

  beforeEach(() => {
    for (const key of ['ENABLE_CREATIVE_FACTORY_V1', 'ENABLE_CREATIVE_FACTORY_V4']) {
      envBackup[key] = process.env[key];
    }
    process.env.ENABLE_CREATIVE_FACTORY_V1 = 'true';
    process.env.ENABLE_CREATIVE_FACTORY_V4 = 'true';
    executeRuntimeActionMock.mockReset();
    resolveFactoryRoutingContextMock.mockReset();
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

  it('routes Father\'s Day promo via run_factory after mission is created in context resolution', async () => {
    resolveFactoryRoutingContextMock.mockResolvedValue({
      ok: true,
      userId: 'user-1',
      storeId: 'store-1',
      missionId: 'mission-created-1',
      factoryId: 'creative_asset_factory_v4',
      missionCreated: true,
      missionRecovered: false,
    });
    executeRuntimeActionMock.mockResolvedValue({
      status: 'ok',
      output: {
        factoryExecution: {
          factoryId: 'creative_asset_factory_v4',
          status: 'awaiting_factory_approval',
          missionId: 'mission-created-1',
        },
      },
    });

    const { tryRouteFactoryIntent } = await import('./factoryIntentRouter.js');
    const result = await tryRouteFactoryIntent({
      intentLabel: 'create_video',
      userMessage: "Create a Father's Day promotional video for my store.",
      userId: 'user-1',
      storeId: 'store-1',
    });

    expect(resolveFactoryRoutingContextMock).toHaveBeenCalled();
    expect(executeRuntimeActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'run_factory',
        missionId: 'mission-created-1',
        userId: 'user-1',
        payload: expect.objectContaining({
          factoryId: 'creative_asset_factory_v4',
        }),
      }),
    );
    expect(result?.factoryId).toBe('creative_asset_factory_v4');
    expect(result?.missionId).toBe('mission-created-1');
  });

  it('returns store checkpoint instead of raw missing-context error', async () => {
    resolveFactoryRoutingContextMock.mockResolvedValue({
      ok: false,
      code: 'STORE_SELECTION_REQUIRED',
      message: 'Please select a store first so I can create the promotional video for it.',
      checkpoint: {
        checkpoint: 'store_selection',
        clarifyType: 'store_picker',
        response: 'Please select a store first so I can create the promotional video for it.',
        options: [],
        pendingIntent: { userMessage: "Create a Father's Day promotional video for my store." },
      },
    });

    const { tryRouteFactoryIntent } = await import('./factoryIntentRouter.js');
    const result = await tryRouteFactoryIntent({
      intentLabel: 'create_video',
      userMessage: "Create a Father's Day promotional video for my store.",
      userId: 'user-1',
      storeId: 'temp',
    });

    expect(executeRuntimeActionMock).not.toHaveBeenCalled();
    expect(result?.checkpoint).toBe('store_selection');
    expect(result?.response).toContain('Please select a store first');
    expect(result?.error?.code).toBe('STORE_SELECTION_REQUIRED');
  });

  it('returns auth-required when userId is missing', async () => {
    resolveFactoryRoutingContextMock.mockResolvedValue({
      ok: false,
      code: 'AUTH_REQUIRED',
      message: 'Please sign in to create promotional videos for your store.',
    });

    const { tryRouteFactoryIntent } = await import('./factoryIntentRouter.js');
    const result = await tryRouteFactoryIntent({
      intentLabel: 'create_video',
      userMessage: "Create a Father's Day promotional video for my store.",
      userId: '',
      storeId: 'store-1',
    });

    expect(result?.error?.code).toBe('AUTH_REQUIRED');
    expect(executeRuntimeActionMock).not.toHaveBeenCalled();
  });
});
