/**
 * Owner-configurable commerce mode + CTA for drafts and published stores.
 */

import { extendedBusinessFieldsFromCommerce } from '../../lib/dbCapabilities.js';
import {
  COMMERCE_MODES,
  resolveCommerceFromMode,
  resolveCommerceMode,
} from '../../lib/storeTransactionMode.js';
import { resolveBrandKitTarget } from './brandKitService.js';

export const CTA_LABEL_PRESETS = [
  'Book now',
  'Reserve spot',
  'Order',
  'Add to cart',
  'Learn more',
  'Watch & Shop',
  'Enquire',
  'Call now',
];

export const CTA_ACTIONS = [
  'booking',
  'order',
  'cart',
  'inquiry',
  'visit',
  'phone',
  'chat',
  'url',
  'checkout',
];

/**
 * @param {object} body
 */
export function validateCommercePatch(body = {}) {
  const out = {};

  if (body.commerceMode !== undefined) {
    const mode = String(body.commerceMode ?? '').trim().toLowerCase();
    if (!COMMERCE_MODES.includes(mode)) {
      return {
        ok: false,
        code: 'INVALID_COMMERCE_MODE',
        message: `commerceMode must be one of: ${COMMERCE_MODES.join(', ')}`,
      };
    }
    out.commerceMode = mode;
  }

  if (body.transactionMode !== undefined) {
    const tm = String(body.transactionMode ?? '').trim().toLowerCase();
    if (tm !== 'booking' && tm !== 'order') {
      return { ok: false, code: 'INVALID_TRANSACTION_MODE', message: 'transactionMode must be booking or order' };
    }
    out.transactionMode = tm;
  }

  if (body.catalogLabel !== undefined) {
    const label = body.catalogLabel === null ? null : String(body.catalogLabel ?? '').trim();
    if (label && label.length > 40) {
      return { ok: false, code: 'INVALID_CATALOG_LABEL', message: 'catalogLabel must be at most 40 characters' };
    }
    out.catalogLabel = label || null;
  }

  if (body.ctaLabel !== undefined) {
    const label = body.ctaLabel === null ? null : String(body.ctaLabel ?? '').trim();
    if (!label) {
      return { ok: false, code: 'INVALID_CTA_LABEL', message: 'ctaLabel cannot be empty' };
    }
    if (label.length > 40) {
      return { ok: false, code: 'INVALID_CTA_LABEL', message: 'ctaLabel must be at most 40 characters' };
    }
    out.ctaLabel = label;
  }

  if (body.ctaAction !== undefined) {
    const action = String(body.ctaAction ?? '').trim().toLowerCase();
    if (!CTA_ACTIONS.includes(action)) {
      return {
        ok: false,
        code: 'INVALID_CTA_ACTION',
        message: `ctaAction must be one of: ${CTA_ACTIONS.join(', ')}`,
      };
    }
    out.ctaAction = action;
  }

  if (body.ctaUrl !== undefined) {
    const url = body.ctaUrl === null ? null : String(body.ctaUrl ?? '').trim();
    if (url && !/^https?:\/\//i.test(url)) {
      return { ok: false, code: 'INVALID_CTA_URL', message: 'ctaUrl must be an http(s) URL' };
    }
    out.ctaUrl = url;
  }

  if (!Object.keys(out).length) {
    return {
      ok: false,
      code: 'EMPTY_PATCH',
      message: 'Provide at least one of commerceMode, transactionMode, catalogLabel, ctaLabel, ctaAction, ctaUrl',
    };
  }

  return { ok: true, data: out };
}

/**
 * @param {import('../../lib/prisma.js').PrismaClient} prisma
 * @param {string} storeId
 * @param {ReturnType<typeof validateCommercePatch> extends { ok: true, data: infer D } ? D : never} patch
 */
export async function updateCommerceForStoreId(prisma, storeId, patch) {
  const target = await resolveBrandKitTarget(prisma, storeId);
  if (!target) {
    return { ok: false, code: 'STORE_NOT_FOUND', message: 'Store or draft not found' };
  }

  if (target.kind === 'draft') {
    let preview = target.record.preview;
    if (typeof preview === 'string') {
      try {
        preview = JSON.parse(preview);
      } catch {
        preview = {};
      }
    }
    if (!preview || typeof preview !== 'object') preview = {};

    const businessType = preview.storeType ?? preview.meta?.storeType ?? null;
    const baseMode = patch.commerceMode
      ?? resolveCommerceMode(businessType, { commerceMode: preview.commerceMode });
    const commerce = resolveCommerceFromMode(baseMode, businessType, {
      ctaLabel: patch.ctaLabel ?? preview.ctaLabel,
      ctaAction: patch.ctaAction ?? preview.storefront?.cta?.action,
      catalogLabel: patch.catalogLabel ?? preview.catalogLabel,
    });

    preview.commerceMode = patch.commerceMode ?? commerce.commerceMode;
    preview.transactionMode = patch.transactionMode ?? commerce.transactionMode;
    preview.catalogLabel = patch.catalogLabel ?? commerce.catalogLabel;
    preview.ctaLabel = patch.ctaLabel ?? commerce.ctaLabel;
    const sf = preview.storefront && typeof preview.storefront === 'object' ? { ...preview.storefront } : {};
    const cta = sf.cta && typeof sf.cta === 'object' ? { ...sf.cta } : {};
    cta.label = patch.ctaLabel ?? commerce.ctaLabel;
    cta.action = patch.ctaAction ?? commerce.ctaAction;
    if (patch.ctaUrl !== undefined) cta.url = patch.ctaUrl;
    sf.cta = cta;
    sf.commerceMode = preview.commerceMode;
    preview.storefront = sf;

    await prisma.draftStore.update({
      where: { id: storeId },
      data: { preview, updatedAt: new Date() },
    });

    return {
      ok: true,
      commerce: {
        commerceMode: preview.commerceMode,
        transactionMode: preview.transactionMode,
        catalogLabel: preview.catalogLabel,
        ctaLabel: preview.ctaLabel,
        ctaAction: cta.action,
        ctaUrl: cta.url ?? null,
      },
    };
  }

  const businessRow = await prisma.business.findUnique({
    where: { id: storeId },
    select: {
      type: true,
      transactionMode: true,
      catalogLabel: true,
      ctaLabel: true,
      storefrontSettings: true,
    },
  });
  if (!businessRow) {
    return { ok: false, code: 'STORE_NOT_FOUND', message: 'Store or draft not found' };
  }
  const businessType = businessRow.type ?? null;
  const existingSf =
    businessRow.storefrontSettings && typeof businessRow.storefrontSettings === 'object'
      ? businessRow.storefrontSettings
      : typeof businessRow.storefrontSettings === 'string'
        ? (() => {
            try {
              return JSON.parse(businessRow.storefrontSettings);
            } catch {
              return {};
            }
          })()
        : {};

  const baseMode = patch.commerceMode
    ?? resolveCommerceMode(businessType, { commerceMode: existingSf.commerceMode });
  const commerce = resolveCommerceFromMode(baseMode, businessType, {
    ctaLabel: patch.ctaLabel ?? businessRow.ctaLabel,
    ctaAction: patch.ctaAction ?? existingSf.cta?.action,
    catalogLabel: patch.catalogLabel ?? businessRow.catalogLabel,
  });

  const storefrontSettings = {
    ...existingSf,
    commerceMode: patch.commerceMode ?? commerce.commerceMode,
    cta: {
      ...(existingSf.cta && typeof existingSf.cta === 'object' ? existingSf.cta : {}),
      label: patch.ctaLabel ?? commerce.ctaLabel,
      action: patch.ctaAction ?? commerce.ctaAction,
      ...(patch.ctaUrl !== undefined ? { url: patch.ctaUrl } : {}),
    },
  };

  const businessPatch = {
    ...extendedBusinessFieldsFromCommerce({
      transactionMode: patch.transactionMode ?? commerce.transactionMode,
      catalogLabel: patch.catalogLabel ?? commerce.catalogLabel,
      ctaLabel: patch.ctaLabel ?? commerce.ctaLabel,
      ctaAction: commerce.ctaAction,
    }),
    storefrontSettings,
    updatedAt: new Date(),
  };

  await prisma.business.update({
    where: { id: storeId },
    data: businessPatch,
  });

  return {
    ok: true,
    commerce: {
      commerceMode: storefrontSettings.commerceMode,
      transactionMode: businessPatch.transactionMode,
      catalogLabel: businessPatch.catalogLabel,
      ctaLabel: businessPatch.ctaLabel,
      ctaAction: storefrontSettings.cta?.action,
      ctaUrl: storefrontSettings.cta?.url ?? null,
    },
  };
}
