/**
 * MCP adapter: read-only store/business branding and asset metadata (internal Prisma).
 * Leaf node — no orchestration; Mission Pipeline / tool executor decides when to invoke.
 */

import { getPrismaClient } from '../../prisma.js';

/**
 * @param {object} row — Business select row
 */
function mapBusinessToStoreAssets(row) {
  const hero = row.heroImageUrl != null && String(row.heroImageUrl).trim();
  const avatar = row.avatarImageUrl != null && String(row.avatarImageUrl).trim();
  const logo = row.logo != null && String(row.logo).trim();
  return {
    storeId: row.id,
    name: row.name,
    slug: row.slug,
    heroImageUrl: row.heroImageUrl ?? null,
    avatarImageUrl: row.avatarImageUrl ?? null,
    logo: row.logo ?? null,
    primaryColor: row.primaryColor ?? null,
    secondaryColor: row.secondaryColor ?? null,
    tagline: row.tagline ?? null,
    heroText: row.heroText ?? null,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
    stylePreferences: row.stylePreferences ?? null,
    storefrontSettings: row.storefrontSettings ?? null,
    publishStatus: row.publishedAt ? 'published' : 'draft',
    hasHeroImage: Boolean(hero),
    hasAvatarImage: Boolean(avatar),
    hasLogo: Boolean(logo),
  };
}

const businessAssetSelect = {
  id: true,
  name: true,
  slug: true,
  logo: true,
  primaryColor: true,
  secondaryColor: true,
  tagline: true,
  heroText: true,
  heroImageUrl: true,
  avatarImageUrl: true,
  publishedAt: true,
  stylePreferences: true,
  storefrontSettings: true,
  updatedAt: true,
};

/**
 * @param {object} args
 * @param {string} [args.storeId]
 * @param {import('../invocationEnvelope.js').McpInvocationEnvelope} envelope
 * @returns {Promise<{ success: boolean, data?: object, error?: { code: string, message: string }, metadata: object }>}
 */
export async function invokeContextStoreAssets(args = {}, envelope) {
  const adapterId = 'mcp_context_store_assets';
  const metaBase = {
    adapterId,
    source: envelope?.source ?? 'unknown',
    missionId: envelope?.missionId ?? null,
    tenantKey: envelope?.tenantKey ?? envelope?.tenantId ?? null,
  };

  const userId = envelope?.userId != null ? String(envelope.userId).trim() : '';
  if (!userId) {
    return {
      success: false,
      error: { code: 'USER_REQUIRED', message: 'MCP context store assets requires userId on invocation envelope' },
      metadata: metaBase,
    };
  }

  const rawStore =
    args?.storeId != null && String(args.storeId).trim() ? String(args.storeId).trim() : null;

  const prisma = getPrismaClient();
  try {
    if (rawStore) {
      const row = await prisma.business.findFirst({
        where: { id: rawStore, userId },
        select: businessAssetSelect,
      });
      if (!row) {
        return {
          success: false,
          error: {
            code: 'STORE_NOT_FOUND',
            message: 'No business found for this store id and user',
          },
          metadata: { ...metaBase, storeId: rawStore },
        };
      }
      return {
        success: true,
        data: {
          resourceType: 'store_assets',
          scope: 'single',
          assets: [mapBusinessToStoreAssets(row)],
        },
        metadata: { ...metaBase, count: 1, storeId: rawStore },
      };
    }

    const rows = await prisma.business.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: businessAssetSelect,
    });

    return {
      success: true,
      data: {
        resourceType: 'store_assets',
        scope: 'all',
        assets: rows.map(mapBusinessToStoreAssets),
      },
      metadata: { ...metaBase, count: rows.length },
    };
  } catch (err) {
    const message = err?.message || String(err);
    return {
      success: false,
      error: { code: 'MCP_CONTEXT_STORE_ASSETS_FAILED', message: message.slice(0, 500) },
      metadata: metaBase,
    };
  }
}
