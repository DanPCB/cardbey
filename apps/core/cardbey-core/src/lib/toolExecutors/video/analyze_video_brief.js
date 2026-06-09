// DANH: skill-round5-video
/**
 * analyze_video_brief — derive video style from store context (read-only).
 */

import { getPrismaClient } from '../../prisma.js';

/**
 * @param {string} storeId
 */
export async function loadStoreVideoContext(storeId) {
  const sid = typeof storeId === 'string' ? storeId.trim() : '';
  if (!sid) return null;

  try {
    const prisma = getPrismaClient();
    const business = await prisma.business.findFirst({
      where: { id: sid },
      select: {
        name: true,
        type: true,
        tagline: true,
        products: {
          where: { deletedAt: null },
          take: 5,
          orderBy: { updatedAt: 'desc' },
          select: { name: true },
        },
      },
    });
    if (!business) return null;
    return {
      name: business.name ?? 'Your store',
      type: business.type ?? 'General',
      tagline: business.tagline ?? null,
      products: Array.isArray(business.products) ? business.products : [],
    };
  } catch {
    return null;
  }
}

/**
 * @param {{ name?: string | null; tagline?: string | null; type?: string | null; products?: Array<{ name?: string | null }> }} store
 */
export function buildVideoPromptFromStore(store) {
  if (!store || typeof store !== 'object') return '';
  const productNames = (Array.isArray(store.products) ? store.products : [])
    .map((p) => String(p?.name ?? '').trim())
    .filter(Boolean)
    .slice(0, 3);
  return [store.name, store.tagline, store.type, productNames.join(', ')]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join('. ');
}

/**
 * @param {string} storeId
 */
export async function buildVideoPromptFromStoreContext(storeId) {
  const store = await loadStoreVideoContext(storeId);
  return store ? buildVideoPromptFromStore(store) : '';
}

export async function execute(input = {}) {
  const storeId = typeof input?.storeId === 'string' ? input.storeId.trim() : '';
  const userMessage = typeof input?.userMessage === 'string' ? input.userMessage : '';

  const store = storeId ? await loadStoreVideoContext(storeId) : null;
  let storeName = store?.name ?? 'Your store';
  let category = store?.type ?? 'General';

  const msg = userMessage.toLowerCase();
  const style = msg.includes('fashion') || msg.includes('runway')
    ? 'fashion_runway'
    : msg.includes('promo') || msg.includes('sale')
      ? 'promotional'
      : 'brand_story';
  const duration = msg.includes('short') ? 15 : 30;
  const mood =
    msg.includes('energetic') || msg.includes('fun') || msg.includes('fashion')
      ? 'energetic'
      : 'warm';

  const autoPrompt =
    (userMessage.trim() && userMessage.trim().length > 12 ? userMessage.trim() : '') ||
    (store ? buildVideoPromptFromStore(store) : '');

  return {
    status: 'ok',
    output: {
      style,
      duration,
      mood,
      keywords: [category, storeName, style, mood].filter(Boolean),
      storeName,
      category,
      autoPrompt,
      storeContext: store,
    },
  };
}

export default execute;
