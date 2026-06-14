import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const createMissionPipelineMock = vi.hoisted(() => vi.fn());
const tryAutoResolveSingleStoreIdMock = vi.hoisted(() => vi.fn());
const resolveStoreAmbiguityMock = vi.hoisted(() => vi.fn());
const emitFactoryContextRecoveredMock = vi.hoisted(() => vi.fn());
const emitFactoryContextMissingMock = vi.hoisted(() => vi.fn());
const emitFactoryMissionCreatedForFactoryMock = vi.hoisted(() => vi.fn());

vi.mock('../missionPipelineService.js', () => ({
  createMissionPipeline: (...args) => createMissionPipelineMock(...args),
}));

vi.mock('../intake/resolveStoreAmbiguity.js', () => ({
  tryAutoResolveSingleStoreId: (...args) => tryAutoResolveSingleStoreIdMock(...args),
  resolveStoreAmbiguity: (...args) => resolveStoreAmbiguityMock(...args),
}));

vi.mock('./factoryTelemetry.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    emitFactoryContextRecovered: (...args) => emitFactoryContextRecoveredMock(...args),
    emitFactoryContextMissing: (...args) => emitFactoryContextMissingMock(...args),
    emitFactoryMissionCreatedForFactory: (...args) => emitFactoryMissionCreatedForFactoryMock(...args),
  };
});

describe('factoryRoutingContext', () => {
  const envBackup = {};

  beforeEach(async () => {
    for (const key of [
      'ENABLE_CREATIVE_FACTORY_V1',
      'ENABLE_CREATIVE_FACTORY_V4',
      'ENABLE_CREATIVE_FACTORY_V2',
      'ENABLE_CREATIVE_FACTORY_V3',
    ]) {
      envBackup[key] = process.env[key];
    }
    process.env.ENABLE_CREATIVE_FACTORY_V1 = 'true';
    process.env.ENABLE_CREATIVE_FACTORY_V4 = 'true';
    delete process.env.ENABLE_CREATIVE_FACTORY_V2;
    delete process.env.ENABLE_CREATIVE_FACTORY_V3;
    const { bootstrapFactoryRuntime } = await import('./factoryBootstrap.js');
    bootstrapFactoryRuntime();
    createMissionPipelineMock.mockReset();
    tryAutoResolveSingleStoreIdMock.mockReset();
    resolveStoreAmbiguityMock.mockReset();
    emitFactoryContextRecoveredMock.mockClear();
    emitFactoryContextMissingMock.mockClear();
    emitFactoryMissionCreatedForFactoryMock.mockClear();
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(envBackup)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  it('treats storeId=temp as missing store context', async () => {
    const { isPlaceholderStoreId, resolveRealStoreId } = await import('./factoryRoutingContext.js');
    expect(isPlaceholderStoreId('temp')).toBe(true);
    expect(resolveRealStoreId('temp')).toBeNull();
  });

  it('returns auth-required when userId is missing', async () => {
    const { resolveFactoryRoutingContext } = await import('./factoryRoutingContext.js');
    const result = await resolveFactoryRoutingContext({
      intentLabel: 'create_video',
      userMessage: "Create a Father's Day promotional video for my store.",
      userId: '',
      storeId: 'store-1',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('AUTH_REQUIRED');
    expect(emitFactoryContextMissingMock).toHaveBeenCalled();
  });

  it('returns store checkpoint when storeId is temp and no real store can be resolved', async () => {
    tryAutoResolveSingleStoreIdMock.mockResolvedValue(null);
    resolveStoreAmbiguityMock.mockResolvedValue(null);

    const { resolveFactoryRoutingContext } = await import('./factoryRoutingContext.js');
    const result = await resolveFactoryRoutingContext({
      intentLabel: 'create_video',
      userMessage: "Create a Father's Day promotional video for my store.",
      userId: 'user-1',
      storeId: 'temp',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('STORE_SELECTION_REQUIRED');
    expect(result.message).toContain('Please select a store first');
    expect(result.checkpoint.checkpoint).toBe('store_selection');
  });

  it('creates mission when missionId is missing', async () => {
    createMissionPipelineMock.mockResolvedValue({ id: 'mission-new-1' });

    const { resolveFactoryRoutingContext } = await import('./factoryRoutingContext.js');
    const result = await resolveFactoryRoutingContext({
      intentLabel: 'create_video',
      userMessage: "Create a Father's Day promotional video for my store.",
      userId: 'user-1',
      storeId: 'store-1',
      tenantId: 'tenant-1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.missionId).toBe('mission-new-1');
    expect(result.missionCreated).toBe(true);
    expect(createMissionPipelineMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'generic',
        targetType: 'store',
        targetId: 'store-1',
        createdBy: 'user-1',
        metadata: expect.objectContaining({
          source: 'performer_intake_v2',
          intentLabel: 'create_video',
          factoryId: 'creative_asset_factory_v4',
        }),
      }),
    );
    expect(emitFactoryMissionCreatedForFactoryMock).toHaveBeenCalled();
  });

  it('recovers existing missionId without creating a new mission', async () => {
    const { resolveFactoryRoutingContext } = await import('./factoryRoutingContext.js');
    const result = await resolveFactoryRoutingContext({
      intentLabel: 'create_video',
      userMessage: "Create a Father's Day promotional video for my store.",
      userId: 'user-1',
      storeId: 'store-1',
      missionId: 'mission-existing',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.missionId).toBe('mission-existing');
    expect(result.missionRecovered).toBe(true);
    expect(createMissionPipelineMock).not.toHaveBeenCalled();
    expect(emitFactoryContextRecoveredMock).toHaveBeenCalled();
  });
});
