/**
 * Resolve store context for promo capabilities (no synthetic storeId).
 */

/**
 * @param {{
 *   activeMission?: { storeId?: string; targetId?: string; targetType?: string } | null;
 *   activeStore?: { id?: string; name?: string; type?: string } | null;
 *   persistedIntent?: { storeId?: string; storeName?: string } | null;
 *   userSession?: { defaultStoreId?: string } | null;
 *   currentContext?: Record<string, unknown> | null;
 *   userMessage?: string;
 * }} input
 */
export function resolveActiveStoreContext(input = {}) {
  const ctx = input.currentContext && typeof input.currentContext === 'object' ? input.currentContext : {};
  const mission = input.activeMission && typeof input.activeMission === 'object' ? input.activeMission : null;
  const store = input.activeStore && typeof input.activeStore === 'object' ? input.activeStore : null;
  const intent =
    input.persistedIntent && typeof input.persistedIntent === 'object' ? input.persistedIntent : null;
  const session = input.userSession && typeof input.userSession === 'object' ? input.userSession : null;

  const storeId =
    (typeof ctx.activeStoreId === 'string' && ctx.activeStoreId.trim()) ||
    (typeof ctx.storeId === 'string' && ctx.storeId.trim()) ||
    (typeof store?.id === 'string' && store.id.trim()) ||
    (mission?.targetType === 'store' && typeof mission.targetId === 'string' && mission.targetId.trim()) ||
    (typeof mission?.storeId === 'string' && mission.storeId.trim()) ||
    (typeof intent?.storeId === 'string' && intent.storeId.trim()) ||
    (typeof session?.defaultStoreId === 'string' && session.defaultStoreId.trim()) ||
    null;

  const storeName =
    (typeof ctx.activeStoreName === 'string' && ctx.activeStoreName.trim()) ||
    (typeof store?.name === 'string' && store.name.trim()) ||
    (typeof intent?.storeName === 'string' && intent.storeName.trim()) ||
    extractStoreNameHint(input.userMessage) ||
    null;

  const businessType =
    (typeof ctx.activeStoreType === 'string' && ctx.activeStoreType.trim()) ||
    (typeof store?.type === 'string' && store.type.trim()) ||
    null;

  const assetHints = ctx.storeAssets ?? ctx.assets;
  const hasStoreImages = Boolean(
    (Array.isArray(assetHints) && assetHints.length > 0) ||
      (typeof ctx.heroImageUrl === 'string' && ctx.heroImageUrl.trim()) ||
      (typeof ctx.logoUrl === 'string' && ctx.logoUrl.trim()),
  );

  return {
    storeId,
    storeName,
    businessType,
    hasStoreImages,
  };
}

/**
 * Best-effort business name from phrases like "for PTH Furniture store".
 * @param {string} [message]
 */
function extractStoreNameHint(message) {
  const msg = String(message ?? '').trim();
  if (!msg) return null;
  const forStore = msg.match(/\bfor\s+(.{2,80}?)\s+store\b/i);
  if (forStore?.[1]) return forStore[1].trim();
  const forBiz = msg.match(/\bfor\s+([A-Z][A-Za-z0-9&'\-\s]{2,60})\b/);
  if (forBiz?.[1] && !/\b(my|this|the)\b/i.test(forBiz[1])) return forBiz[1].trim();
  return null;
}
