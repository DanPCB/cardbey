/**
 * Canonical tenantId + storeId for SIGNAGE playlists.
 * tenantId = store owner's User.id (Business.userId), storeId = Business.id.
 */

import { getPrismaClient } from './prisma.js';

const BAD_TENANT_VALUES = new Set(['', 'missing', 'temp', 'provisional']);

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidScopeId(value) {
  if (value == null || typeof value !== 'string') return false;
  const s = value.trim();
  if (!s || BAD_TENANT_VALUES.has(s)) return false;
  if (s.startsWith('guest_')) return false;
  return true;
}

/**
 * tenantId must not equal storeId (common bug: business id used as both).
 * @param {unknown} tenantId
 * @param {unknown} storeId
 */
export function isPlausibleTenantId(tenantId, storeId) {
  if (!isValidScopeId(tenantId)) return false;
  const t = String(tenantId).trim();
  const s = typeof storeId === 'string' ? storeId.trim() : '';
  if (s && t === s) return false;
  return true;
}

/**
 * @param {import('@prisma/client').PrismaClient} [prismaClient]
 * @param {{ tenantId?: string | null, storeId?: string | null, userId?: string | null }} input
 */
export async function resolvePlaylistTenantStore(input, prismaClient) {
  const prisma = prismaClient || getPrismaClient();
  let storeId = isValidScopeId(input.storeId) ? String(input.storeId).trim() : null;
  let tenantId = isPlausibleTenantId(input.tenantId, storeId)
    ? String(input.tenantId).trim()
    : null;

  let ownerUserId = null;
  if (storeId) {
    const business = await prisma.business.findUnique({
      where: { id: storeId },
      select: { id: true, userId: true },
    });
    if (business?.userId && isValidScopeId(business.userId)) {
      ownerUserId = String(business.userId).trim();
      if (!tenantId || tenantId === storeId) {
        tenantId = ownerUserId;
      }
    }
  }

  if (!tenantId && isValidScopeId(input.userId)) {
    tenantId = String(input.userId).trim();
  }

  if (!storeId && tenantId) {
    const business = await prisma.business.findFirst({
      where: { userId: tenantId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, userId: true },
    });
    if (business?.id) {
      storeId = business.id;
      ownerUserId = business.userId;
    }
  }

  if (!isValidScopeId(storeId) || !isPlausibleTenantId(tenantId, storeId)) {
    const err = new Error(
      'tenantId and storeId are required (tenantId = store owner user id, storeId = business id)',
    );
    err.code = 'missing_tenant_store';
    throw err;
  }

  return { tenantId, storeId, ownerUserId: ownerUserId || tenantId };
}

/**
 * Repair SIGNAGE playlists for a store that have missing/wrong tenantId.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} storeId
 * @param {string} ownerUserId
 */
export async function repairSignagePlaylistTenantForStore(prisma, storeId, ownerUserId) {
  if (!storeId || !ownerUserId) return 0;
  const result = await prisma.playlist.updateMany({
    where: {
      type: 'SIGNAGE',
      storeId,
      OR: [
        { tenantId: null },
        { tenantId: '' },
        { tenantId: 'missing' },
        { tenantId: 'temp' },
        { tenantId: storeId },
        { tenantId: { not: ownerUserId } },
      ],
    },
    data: { tenantId: ownerUserId },
  });
  if (result.count > 0) {
    console.log('[playlistScope] repaired playlist tenantId rows', {
      storeId,
      ownerUserId,
      count: result.count,
    });
  }
  return result.count;
}

/**
 * List active SIGNAGE playlists for store (after optional tenant repair).
 */
/**
 * Resolve tenant/store from an Express request (query, body, auth) using Business.userId.
 * @param {import('express').Request} req
 * @param {import('@prisma/client').PrismaClient} [prismaClient]
 */
export async function resolvePlaylistScopeFromRequest(req, prismaClient) {
  const queryTenant = req.query?.tenantId ? String(req.query.tenantId).trim() : null;
  const queryStore = req.query?.storeId ? String(req.query.storeId).trim() : null;
  const bodyTenant = req.body?.tenantId ? String(req.body.tenantId).trim() : null;
  const bodyStore = req.body?.storeId ? String(req.body.storeId).trim() : null;

  const storeId = queryStore || bodyStore || req.user?.business?.id;
  const tenantId = queryTenant || bodyTenant || req.userId;

  return resolvePlaylistTenantStore(
    {
      tenantId,
      storeId,
      userId: req.userId,
    },
    prismaClient,
  );
}

/**
 * DEV/ops log before access decision (including denials).
 */
export function logSignagePlaylistScopeCheck(playlist, req, scope, extra = {}) {
  console.log('[SIGNAGE_PLAYLIST_SCOPE_CHECK]', {
    playlistId: playlist?.id,
    playlistName: playlist?.name,
    playlistStoreId: playlist?.storeId,
    playlistTenantId: playlist?.tenantId,
    reqQueryStoreId: req.query?.storeId ?? null,
    reqQueryTenantId: req.query?.tenantId ?? null,
    resolvedStoreId: scope?.storeId,
    resolvedTenantId: scope?.tenantId,
    userId: req.userId ?? null,
    sourceRoute: extra.sourceRoute ?? req.path ?? req.originalUrl,
  });
}

/**
 * @param {object} ctx
 */
export function logPlaylistAccessDenied(ctx) {
  console.warn('[PLAYLIST_ACCESS_DENIED]', ctx);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} playlist
 * @param {{ tenantId: string, storeId: string }} scope
 * @param {import('express').Request} req
 * @param {{ sourceRoute?: string, deviceId?: string, device?: object }} [extra]
 */
export async function buildPlaylistAccessDeniedContext(prisma, playlist, scope, req, extra = {}) {
  let device = extra.device || null;
  if (!device && extra.deviceId) {
    device = await prisma.device.findUnique({
      where: { id: extra.deviceId },
      select: { id: true, storeId: true, tenantId: true },
    });
  }
  if (!device) {
    const binding = await prisma.devicePlaylistBinding.findFirst({
      where: { playlistId: playlist.id },
      orderBy: { lastPushedAt: 'desc' },
      include: {
        device: { select: { id: true, storeId: true, tenantId: true } },
      },
    });
    device = binding?.device || null;
  }

  return {
    playlistId: playlist.id,
    playlistName: playlist.name,
    playlistTenantId: playlist.tenantId,
    playlistStoreId: playlist.storeId,
    deviceId: device?.id ?? null,
    deviceStoreId: device?.storeId ?? null,
    deviceTenantId: device?.tenantId ?? null,
    currentTenantId: scope.tenantId,
    currentStoreId: scope.storeId,
    userId: req.userId ?? null,
    sourceRoute: extra.sourceRoute ?? req.path ?? req.originalUrl,
  };
}

/**
 * Assert caller may access a SIGNAGE playlist (same resolver as list/create).
 * @returns {Promise<{ ok: true, scope: object, playlist: object } | { ok: false, status: number, error: string, message?: string, deniedCtx?: object }>}
 */
export async function assertSignagePlaylistAccess(playlist, req, prisma, options = {}) {
  if (!playlist) {
    return { ok: false, status: 404, error: 'not_found', message: 'Playlist not found' };
  }
  if (String(playlist.type || '').toUpperCase() !== 'SIGNAGE') {
    return {
      ok: false,
      status: 400,
      error: 'invalid_type',
      message: 'This endpoint only supports SIGNAGE playlists',
    };
  }

  let scope;
  try {
    scope = await resolvePlaylistScopeFromRequest(req, prisma);
  } catch (err) {
    return {
      ok: false,
      status: 400,
      error: 'missing_tenant_store',
      message: err?.message || 'tenantId and storeId are required',
    };
  }

  logSignagePlaylistScopeCheck(playlist, req, scope, options);

  const explicitQueryStore = req.query?.storeId ? String(req.query.storeId).trim() : null;

  if (explicitQueryStore && explicitQueryStore !== playlist.storeId) {
    const deniedCtx = await buildPlaylistAccessDeniedContext(prisma, playlist, scope, req, options);
    logPlaylistAccessDenied({ ...deniedCtx, reason: 'query_store_mismatch' });
    return {
      ok: false,
      status: 403,
      error: 'access_denied',
      message: 'Access denied: playlist does not belong to your tenant/store',
      deniedCtx,
    };
  }

  const matchesScope =
    playlist.tenantId === scope.tenantId && playlist.storeId === scope.storeId;
  if (matchesScope) {
    return { ok: true, scope, playlist };
  }

  if (playlist.storeId === scope.storeId) {
    await repairSignagePlaylistTenantForStore(prisma, scope.storeId, scope.tenantId);
    const refreshed = await prisma.playlist.findUnique({ where: { id: playlist.id } });
    if (
      refreshed &&
      refreshed.tenantId === scope.tenantId &&
      refreshed.storeId === scope.storeId
    ) {
      return { ok: true, scope, playlist: refreshed };
    }
  }

  const ownerScope = await resolvePlaylistTenantStore({ storeId: playlist.storeId }, prisma);
  if (
    req.userId &&
    req.userId === ownerScope.tenantId &&
    playlist.storeId === ownerScope.storeId
  ) {
    if (!explicitQueryStore || explicitQueryStore === playlist.storeId) {
      if (playlist.tenantId !== ownerScope.tenantId) {
        await repairSignagePlaylistTenantForStore(
          prisma,
          ownerScope.storeId,
          ownerScope.tenantId,
        );
        const refreshed = await prisma.playlist.findUnique({ where: { id: playlist.id } });
        if (refreshed) {
          return { ok: true, scope: ownerScope, playlist: refreshed };
        }
      }
      return { ok: true, scope: ownerScope, playlist };
    }
  }

  const deniedCtx = await buildPlaylistAccessDeniedContext(prisma, playlist, scope, req, options);
  logPlaylistAccessDenied(deniedCtx);
  return {
    ok: false,
    status: 403,
    error: 'access_denied',
    message: 'Access denied: playlist does not belong to your tenant/store',
    deniedCtx,
  };
}

export async function listSignagePlaylistsForStore(prisma, { tenantId, storeId, repair = true }) {
  const scope = await resolvePlaylistTenantStore({ tenantId, storeId }, prisma);
  const effectiveTenantId = scope.tenantId;
  const effectiveStoreId = scope.storeId;

  if (repair) {
    await repairSignagePlaylistTenantForStore(prisma, effectiveStoreId, effectiveTenantId);
  }

  return prisma.playlist.findMany({
    where: {
      type: 'SIGNAGE',
      storeId: effectiveStoreId,
      tenantId: effectiveTenantId,
      active: true,
    },
    include: {
      items: { select: { id: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });
}
