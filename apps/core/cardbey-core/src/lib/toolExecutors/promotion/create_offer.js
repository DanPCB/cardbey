/**
 * Create Offer — persist StoreOffer (+ optional DynamicQr) for a store.
 * Mirrors miIntentsRoutes create_offer contract for promotion handoff.
 */

import { getPrismaClient } from '../../../lib/prisma.js';
import { EXECUTION_STATES } from '../../telemetry/executionStates.js';

function slugifyTitle(title) {
  return title
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 80);
}

function formatPriceText(discount, type) {
  const value = typeof discount === 'number' ? discount : parseFloat(String(discount));
  if (!Number.isFinite(value) || value <= 0) return null;
  if (type === 'fixed') return `$${value} off`;
  if (type === 'buy_one_get_one') return 'Buy one get one free';
  return `${value}% off`;
}

/**
 * @param {object} input
 * @param {object} [context]
 */
export async function execute(input = {}, context = {}) {
  const storeId =
    (typeof input?.storeId === 'string' ? input.storeId.trim() : '') ||
    (typeof context?.storeId === 'string' ? context.storeId.trim() : '');

  if (!storeId) {
    return {
      status: 'blocked',
      blocker: {
        code: 'STORE_ID_REQUIRED',
        message: 'Store ID is required to create an offer',
        requiredAction: 'Provide storeId in mission metadata or tool input',
      },
      output: { executionState: EXECUTION_STATES.BLOCKED },
    };
  }

  const nameRaw =
    (typeof input?.name === 'string' ? input.name.trim() : '') ||
    (typeof input?.title === 'string' ? input.title.trim() : '');
  const title = nameRaw || 'Special offer';

  if (!nameRaw && !input?.discount && !input?.description && !input?.campaignContext) {
    return {
      status: 'blocked',
      blocker: {
        code: 'NAME_REQUIRED',
        message: 'Offer name is required',
        requiredAction: 'Provide name or title for the offer',
      },
      output: { executionState: EXECUTION_STATES.BLOCKED },
    };
  }

  const discountRaw = input?.discount;
  const discount =
    typeof discountRaw === 'number'
      ? discountRaw
      : discountRaw != null
        ? parseFloat(String(discountRaw))
        : null;
  const offerType = typeof input?.type === 'string' ? input.type.trim() : 'percentage';

  if (discountRaw != null && (!Number.isFinite(discount) || discount <= 0)) {
    return {
      status: 'blocked',
      blocker: {
        code: 'DISCOUNT_REQUIRED',
        message: 'Discount amount is required and must be greater than 0',
      },
      output: { executionState: EXECUTION_STATES.BLOCKED },
    };
  }

  const description =
    typeof input?.description === 'string'
      ? input.description.trim()
      : typeof input?.campaignContext === 'string'
        ? input.campaignContext.trim()
        : null;

  const priceText =
    (typeof input?.priceText === 'string' && input.priceText.trim()) ||
    (discount != null ? formatPriceText(discount, offerType) : null);

  const userId =
    (typeof input?.userId === 'string' ? input.userId.trim() : '') ||
    (typeof context?.userId === 'string' ? context.userId.trim() : '') ||
    null;

  const startsAt = input?.startDate ? new Date(input.startDate) : null;
  const endsAt = input?.endDate
    ? new Date(input.endDate)
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const prisma = getPrismaClient();

  try {
    const store = await prisma.business.findUnique({
      where: { id: storeId },
      select: { id: true, slug: true, isActive: true },
    });

    if (!store || store.isActive === false) {
      return {
        status: 'failed',
        error: { code: 'STORE_NOT_FOUND', message: 'Store not found or inactive' },
        output: { executionState: EXECUTION_STATES.FAILED },
      };
    }

    const slugRaw =
      (typeof input?.slug === 'string' && input.slug.trim()) || slugifyTitle(title);
    let slug = slugRaw || 'offer';

    const { nanoid } = await import('nanoid');

    let offer = await prisma.storeOffer.findFirst({
      where: { storeId: store.id, slug },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        priceText: true,
        isActive: true,
        endsAt: true,
      },
    });

    if (!offer) {
      try {
        offer = await prisma.storeOffer.create({
          data: {
            storeId: store.id,
            slug,
            title,
            description,
            priceText,
            isActive: true,
            ...(startsAt ? { startsAt } : {}),
            ...(endsAt ? { endsAt } : {}),
          },
        });
      } catch (createErr) {
        if (
          createErr?.code === 'P2002' &&
          (createErr?.meta?.target?.includes('storeId') || createErr?.meta?.target?.includes('slug'))
        ) {
          slug = `${slug.slice(0, 70)}-${nanoid(6).toLowerCase()}`;
          offer = await prisma.storeOffer.create({
            data: {
              storeId: store.id,
              slug,
              title,
              description,
              priceText,
              isActive: true,
              ...(startsAt ? { startsAt } : {}),
              ...(endsAt ? { endsAt } : {}),
            },
          });
        } else {
          throw createErr;
        }
      }
    }

    const baseUrl = (process.env.PUBLIC_BASE_URL || process.env.API_BASE || '').replace(/\/$/, '');
    const targetPath = `/p/${store.slug}/offers/${offer.slug}`;
    const publicUrl = baseUrl ? `${baseUrl}${targetPath}` : targetPath;

    const result = {
      offerId: offer.id,
      storeId: store.id,
      entityType: 'promotion',
      source: 'create_offer',
      offerName: title,
      title,
      description: description ?? undefined,
      isActive: offer.isActive,
      endsAt: offer.endsAt ? offer.endsAt.toISOString() : null,
      publicUrl,
      executionState: EXECUTION_STATES.EXECUTED,
    };

    if (userId) {
      let code;
      for (let attempt = 0; attempt < 10; attempt++) {
        code = nanoid(8).toLowerCase();
        const exists = await prisma.dynamicQr.findUnique({ where: { code } });
        if (!exists) break;
      }
      if (code) {
        try {
          await prisma.dynamicQr.create({
            data: {
              code,
              storeId: store.id,
              type: 'offer',
              payload: { offerId: offer.id, storeSlug: store.slug, offerSlug: offer.slug },
              targetPath,
              isActive: true,
              createdByUserId: userId,
            },
          });
          result.qrUrl = baseUrl ? `${baseUrl}/q/${code}` : `/q/${code}`;
        } catch {
          /* QR optional */
        }
      }
    }

    const discountLabel =
      discount != null ? `${discount}${offerType === 'fixed' ? '' : '%'} discount` : 'offer';

    return {
      status: 'ok',
      output: {
        ...result,
        offer,
        message: `Offer "${title}" created successfully${discount != null ? ` with ${discountLabel}` : ''}`,
      },
    };
  } catch (error) {
    console.error('[create_offer] Failed:', error);
    return {
      status: 'failed',
      error: {
        code: 'CREATE_FAILED',
        message: `Failed to create offer: ${error?.message ?? 'unknown error'}`,
      },
      output: { executionState: EXECUTION_STATES.FAILED },
    };
  }
}

export default execute;
