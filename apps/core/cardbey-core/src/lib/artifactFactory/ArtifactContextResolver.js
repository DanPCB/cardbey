/**
 * Universal context resolver — one resolver for all artifact types.
 */

import { getPrismaClient } from '../prisma.js';
import { resolveRuntimePrincipal } from '../runtime/resolveRuntimePrincipal.js';

/**
 * @typedef {Object} ResolvedArtifactContext
 * @property {string} userId
 * @property {boolean} authenticated
 * @property {string|null} accountId
 * @property {string|null} storeId
 * @property {string|null} missionId
 * @property {Record<string, unknown>|null} mission
 * @property {Record<string, unknown>|null} business
 * @property {Record<string, unknown>|null} brandProfile
 * @property {string|null} locale
 * @property {Record<string, unknown>} uploads
 * @property {Record<string, unknown>} campaign
 * @property {Record<string, unknown>} loyalty
 * @property {Record<string, unknown>} catalog
 * @property {Record<string, unknown>} services
 * @property {Record<string, unknown>} extras
 */

/**
 * @param {{
 *   req?: import('express').Request;
 *   userId?: string;
 *   storeId?: string;
 *   missionId?: string;
 *   context?: Record<string, unknown>;
 * }} input
 * @returns {Promise<ResolvedArtifactContext>}
 */
export async function resolveArtifactContext(input = {}) {
  const req = input.req;
  const principal = req ? resolveRuntimePrincipal(req) : null;
  const userId =
    (principal?.kind === 'authenticated' ? principal.userId : null) ||
    (typeof input.userId === 'string' ? input.userId.trim() : '') ||
    null;
  const storeId =
    (typeof input.storeId === 'string' && input.storeId.trim() ? input.storeId.trim() : null) ||
    (input.context?.storeId && typeof input.context.storeId === 'string'
      ? input.context.storeId.trim()
      : null);
  const missionId =
    (typeof input.missionId === 'string' && input.missionId.trim() ? input.missionId.trim() : null) ||
    (input.context?.missionId && typeof input.context.missionId === 'string'
      ? input.context.missionId.trim()
      : null);

  const ctx = input.context && typeof input.context === 'object' ? input.context : {};
  const prisma = getPrismaClient();

  let mission = null;
  if (missionId) {
    try {
      const row = await prisma.mission.findUnique({
        where: { id: missionId },
        select: { id: true, userId: true, storeId: true, context: true, status: true, goal: true },
      });
      if (row) mission = /** @type {Record<string, unknown>} */ (row);
    } catch {
      mission = null;
    }
  }

  let business = null;
  const resolvedStoreId = storeId || (mission?.storeId ? String(mission.storeId) : null);
  if (resolvedStoreId) {
    try {
      const row = await prisma.business.findUnique({
        where: { id: resolvedStoreId },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          logo: true,
          heroImage: true,
          metadata: true,
          locale: true,
        },
      });
      if (row) business = /** @type {Record<string, unknown>} */ (row);
    } catch {
      business = null;
    }
  }

  const brandProfile =
    (business?.metadata && typeof business.metadata === 'object'
      ? /** @type {Record<string, unknown>} */ (business.metadata).brand
      : null) ??
    ctx.brandProfile ??
    null;

  return {
    userId: userId || '',
    authenticated: principal?.kind === 'authenticated' || Boolean(userId),
    accountId: principal?.kind === 'authenticated' ? principal.accountId ?? userId : userId,
    storeId: resolvedStoreId,
    missionId,
    mission,
    business,
    brandProfile:
      brandProfile && typeof brandProfile === 'object'
        ? /** @type {Record<string, unknown>} */ (brandProfile)
        : null,
    locale:
      (typeof business?.locale === 'string' && business.locale) ||
      (typeof ctx.locale === 'string' ? ctx.locale : null) ||
      'en-AU',
    uploads:
      ctx.uploads && typeof ctx.uploads === 'object'
        ? /** @type {Record<string, unknown>} */ (ctx.uploads)
        : {},
    campaign:
      ctx.campaign && typeof ctx.campaign === 'object'
        ? /** @type {Record<string, unknown>} */ (ctx.campaign)
        : {},
    loyalty:
      ctx.loyalty && typeof ctx.loyalty === 'object'
        ? /** @type {Record<string, unknown>} */ (ctx.loyalty)
        : {},
    catalog:
      ctx.catalog && typeof ctx.catalog === 'object'
        ? /** @type {Record<string, unknown>} */ (ctx.catalog)
        : {},
    services:
      ctx.services && typeof ctx.services === 'object'
        ? /** @type {Record<string, unknown>} */ (ctx.services)
        : {},
    extras: ctx,
  };
}
