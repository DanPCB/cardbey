import { describe, expect, it } from 'vitest';
import {
  assertSignagePlaylistAccess,
  isPlausibleTenantId,
  isValidScopeId,
  resolvePlaylistTenantStore,
} from '../src/lib/playlistScope.js';

describe('playlistScope integration', () => {
  it('resolvePlaylistTenantStore rejects tenant equal to store without DB', async () => {
    await expect(
      resolvePlaylistTenantStore(
        { tenantId: 'same_id', storeId: 'same_id' },
        {
          business: {
            findUnique: async () => null,
            findFirst: async () => null,
          },
        },
      ),
    ).rejects.toMatchObject({ code: 'missing_tenant_store' });
  });

  it('resolvePlaylistTenantStore uses business.userId', async () => {
    const scope = await resolvePlaylistTenantStore(
      { storeId: 'store_1' },
      {
        business: {
          findUnique: async () => ({ id: 'store_1', userId: 'user_owner' }),
          findFirst: async () => null,
        },
      },
    );
    expect(scope.tenantId).toBe('user_owner');
    expect(scope.storeId).toBe('store_1');
  });
});

describe('playlistScope validators', () => {
  it('flags invalid tenant values', () => {
    expect(isValidScopeId('missing')).toBe(false);
    expect(isPlausibleTenantId('store_x', 'store_x')).toBe(false);
    expect(isPlausibleTenantId('user_y', 'store_x')).toBe(true);
  });
});

describe('assertSignagePlaylistAccess', () => {
  const prismaMock = {
    business: {
      findUnique: async ({ where }) =>
        where.id === 'store_1' ? { id: 'store_1', userId: 'user_owner' } : null,
      findFirst: async () => null,
    },
    playlist: {
      findUnique: async ({ where }) =>
        where.id === 'pl_1'
          ? {
              id: 'pl_1',
              type: 'SIGNAGE',
              name: 'Playlist02',
              tenantId: 'user_owner',
              storeId: 'store_1',
            }
          : null,
    },
    devicePlaylistBinding: {
      findFirst: async () => null,
    },
    device: {
      findUnique: async () => null,
    },
  };

  it('allows access when scope matches playlist row', async () => {
    const req = {
      query: { storeId: 'store_1', tenantId: 'user_owner' },
      userId: 'user_owner',
      path: '/api/signage/playlist/pl_1',
    };
    const playlist = {
      id: 'pl_1',
      type: 'SIGNAGE',
      name: 'Playlist02',
      tenantId: 'user_owner',
      storeId: 'store_1',
    };
    const result = await assertSignagePlaylistAccess(playlist, req, prismaMock, {
      sourceRoute: 'test',
    });
    expect(result.ok).toBe(true);
    expect(result.playlist.id).toBe('pl_1');
  });

  it('allows owner when query store matches playlist store', async () => {
    const req = {
      query: { storeId: 'store_1', tenantId: 'user_owner' },
      userId: 'user_owner',
      path: '/api/signage/playlist/pl_1',
    };
    const playlist = {
      id: 'pl_1',
      type: 'SIGNAGE',
      name: 'Playlist02',
      tenantId: 'user_owner',
      storeId: 'store_1',
    };
    const result = await assertSignagePlaylistAccess(playlist, req, prismaMock, {
      sourceRoute: 'test',
    });
    expect(result.ok).toBe(true);
  });

  it('returns 403 for cross-store when query store is explicit', async () => {
    const req = {
      query: { storeId: 'store_other', tenantId: 'user_owner' },
      userId: 'user_owner',
      path: '/api/signage/playlist/pl_1',
    };
    const playlist = {
      id: 'pl_1',
      type: 'SIGNAGE',
      name: 'Playlist02',
      tenantId: 'user_owner',
      storeId: 'store_1',
    };
    const result = await assertSignagePlaylistAccess(playlist, req, prismaMock, {
      sourceRoute: 'test',
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    expect(result.deniedCtx?.playlistId).toBe('pl_1');
    expect(result.deniedCtx?.playlistStoreId).toBe('store_1');
    expect(result.deniedCtx?.currentStoreId).toBe('store_other');
  });
});
