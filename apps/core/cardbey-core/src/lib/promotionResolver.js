/**
 * Promotion Slot Pipeline v1: resolve best promotion for a slot.
 * Finds active slot, enabled placements, filters by time and promotion status, returns single result or null.
 *
 * Initial slot keys (pipeline supports; create via POST /api/promotions/slots):
 * - store_entry_popup
 * - homepage_hero
 * - cnet_main_screen
 * - qr_landing_banner
 */

import { getPrismaClient } from '../lib/prisma.js';

/** Initial slot keys for Promotion Slot Pipeline v1. */
export const PROMOTION_SLOT_KEYS = [
  'store_entry_popup',
  'homepage_hero',
  'cnet_main_screen',
  'qr_landing_banner',
];

/**
 * Resolve the single best promotion for a slot (and optional store).
 *
 * @param {{
 *   slotKey: string;
 *   storeId?: string;
 *   now?: Date;
 * }} params
 * @returns {Promise<{
 *   ok: boolean;
 *   slot: { slotKey: string; surfaceType: string; displayMode: string } | null;
 *   promotion: {
 *     id: string;
 *     title: string;
 *     message?: string;
 *     mediaType?: string;
 *     mediaUrl?: string;
 *     ctaLabel?: string;
 *     ctaUrl?: string;
 *   } | null;
 * }>}
 */
export async function resolvePromotionForSlot(params) {
  const slotKey = typeof params.slotKey === 'string' ? params.slotKey.trim() : '';
  const storeId = typeof params.storeId === 'string' ? params.storeId.trim() || null : null;
  const now = params.now instanceof Date ? params.now : new Date();

  if (!slotKey) {
    return { ok: true, slot: null, promotion: null };
  }

  const prisma = getPrismaClient();

  const slot = await prisma.promotionSlot.findFirst({
    where: { slotKey, isActive: true },
    select: { id: true, slotKey: true, surfaceType: true, displayMode: true },
  });
  if (!slot) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[PromotionResolver] slot=${slotKey} store=${storeId ?? 'none'} match=none (slot not found or inactive)`);
    }
    return { ok: true, slot: null, promotion: null };
  }

  const placements = await prisma.promotionPlacement.findMany({
    where: {
      slotId: slot.id,
      enabled: true,
      promotion: { status: 'active' },
      AND: [
        { OR: [{ startAt: null }, { startAt: { lte: now } }] },
        { OR: [{ endAt: null }, { endAt: { gte: now } }] },
      ],
    },
    include: {
      promotion: {
        select: {
          id: true,
          title: true,
          message: true,
          mediaType: true,
          mediaUrl: true,
          ctaLabel: true,
          ctaUrl: true,
          startAt: true,
          endAt: true,
        },
      },
    },
    orderBy: [{ priority: 'desc' }, { startAt: 'desc' }],
  });

  // Filter promotion validity window
  const validPlacements = placements.filter((p) => {
    const prom = p.promotion;
    if (prom.startAt && now < prom.startAt) return false;
    if (prom.endAt && now > prom.endAt) return false;
    return true;
  });

  // Prefer store-matching placement when storeId provided
  let chosen = null;
  if (storeId) {
    chosen = validPlacements.find((p) => p.storeId === storeId) ?? validPlacements.find((p) => p.storeId == null);
  } else {
    chosen = validPlacements.find((p) => p.storeId == null) ?? validPlacements[0];
  }
  const placement = chosen ?? validPlacements[0] ?? null;

  const promotion = placement
    ? {
        id: placement.promotion.id,
        title: placement.promotion.title,
        message: placement.promotion.message ?? undefined,
        mediaType: placement.promotion.mediaType ?? undefined,
        mediaUrl: placement.promotion.mediaUrl ?? undefined,
        ctaLabel: placement.promotion.ctaLabel ?? undefined,
        ctaUrl: placement.promotion.ctaUrl ?? undefined,
      }
    : null;

  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[PromotionResolver] slot=${slotKey} store=${storeId ?? 'none'} match=${promotion ? promotion.id : 'none'}`
    );
  }

  return {
    ok: true,
    slot: {
      slotKey: slot.slotKey,
      surfaceType: slot.surfaceType,
      displayMode: slot.displayMode,
    },
    promotion,
  };
}
