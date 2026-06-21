import { describe, expect, it, beforeEach, vi } from 'vitest';
import { LLM_PLATFORMS } from '../../lib/platforms/platformRegistry.js';

const mockPrisma = {
  oAuthConnection: {
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
  },
  platformConnection: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    updateMany: vi.fn(),
  },
};

vi.mock('../../lib/prisma.js', () => ({
  getPrismaClient: () => mockPrisma,
}));

describe('platformService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TOKEN_ENCRYPTION_KEY =
      process.env.TOKEN_ENCRYPTION_KEY ||
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  });

  it('returns not_connected for api_key platform without row', async () => {
    mockPrisma.platformConnection.findUnique.mockResolvedValue(null);
    const { PlatformService } = await import('./platformService.js');
    const svc = new PlatformService(mockPrisma);
    const status = await svc.checkPlatformStatus('user-1', LLM_PLATFORMS.openai_gpt);
    expect(status.connected).toBe(false);
    expect(status.status).toBe('not_connected');
    expect(status.capabilities).toContain('actions_api');
  });

  it('connectPlatform persists encrypted credentials for api_key platforms', async () => {
    mockPrisma.platformConnection.upsert.mockResolvedValue({
      id: 'pc1',
      createdAt: new Date('2026-06-21T00:00:00.000Z'),
    });

    const { PlatformService } = await import('./platformService.js');
    const svc = new PlatformService(mockPrisma);
    const result = await svc.connectPlatform('user-1', 'openai_gpt', {
      OPENAI_API_KEY: 'sk-test-key',
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('connected');
    expect(mockPrisma.platformConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_platformId: { userId: 'user-1', platformId: 'openai_gpt' } },
        create: expect.objectContaining({
          userId: 'user-1',
          platformId: 'openai_gpt',
          credentialsEnc: expect.any(String),
        }),
      }),
    );
  });

  it('disconnectPlatform marks platform connection inactive', async () => {
    mockPrisma.platformConnection.updateMany.mockResolvedValue({ count: 1 });
    const { PlatformService } = await import('./platformService.js');
    const svc = new PlatformService(mockPrisma);
    const result = await svc.disconnectPlatform('user-1', 'perplexity');
    expect(result.status).toBe('disconnected');
    expect(mockPrisma.platformConnection.updateMany).toHaveBeenCalled();
  });

  it('connectPlatform returns oauth redirect metadata', async () => {
    const { PlatformService } = await import('./platformService.js');
    const svc = new PlatformService(mockPrisma);
    const result = await svc.connectPlatform('user-1', 'twitter', {});
    expect(result.status).toBe('redirect');
    expect(result.redirectUrl).toBe('/api/oauth/twitter/connect');
  });
});
