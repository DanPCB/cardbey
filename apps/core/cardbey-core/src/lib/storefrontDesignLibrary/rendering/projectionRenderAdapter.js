/**
 * Adapt StorefrontProjection → StorefrontRenderViewModel (advisory).
 */

import {
  ADAPTER_VERSION,
  RENDER_VIEW_MODEL_VERSION,
  RENDER_ACTION_LABELS,
  resolveRendererCapabilities,
} from './renderCompatibility.js';
import { adaptProjectedSection } from './projectionSectionAdapter.js';
import { validateRenderViewModel } from './renderAdapterValidator.js';

/**
 * @param {{
 *   projection: import('../projection/projectionResult.js').StorefrontProjection,
 *   businessData?: Record<string, unknown>,
 *   catalogItems?: unknown[],
 *   theme?: { id?: string, visualThemeId?: string } | null,
 *   rendererCapabilities?: Partial<import('./renderCompatibility.js').RendererCapabilities>,
 * }} input
 */
export function adaptProjectionToRenderViewModel(input) {
  const projection = input.projection;
  if (!projection || typeof projection !== 'object') {
    throw new Error('[designLibrary.rendering] projection is required');
  }

  const caps = resolveRendererCapabilities(input.rendererCapabilities);
  const businessData = input.businessData && typeof input.businessData === 'object' ? input.businessData : {};
  const catalogItems = Array.isArray(input.catalogItems) ? input.catalogItems : [];
  const policy = businessData.commercePolicy ?? businessData.designLibraryCommercePolicy ?? {};

  const primaryAction = buildRenderAction(projection.primaryAction ?? policy.primaryAction, {
    businessData,
    policy,
    placement: ['hero', 'footer'],
  });
  const secondaryActions = (projection.secondaryActions?.length
    ? projection.secondaryActions
    : policy.secondaryAction
      ? [policy.secondaryAction]
      : []
  )
    .map((a) =>
      buildRenderAction(a, {
        businessData,
        policy,
        placement: ['hero', 'contact', 'footer'],
      }),
    )
    .filter(Boolean);

  /** @type {import('./projectionSectionAdapter.js').RenderSection[]} */
  const sections = [];
  /** @type {string[]} */
  const unsupportedSectionRoles = [];
  /** @type {string[]} */
  const unsupportedVariants = [];
  let fallbackCount = 0;
  let order = 0;

  for (const projected of projection.sections ?? []) {
    const sectionActions = (projected.metadata?.preferredActions ?? [])
      .map((a) =>
        buildRenderAction(a, {
          businessData,
          policy,
          placement: [projected.role],
        }),
      )
      .filter(Boolean);

    const adapted = adaptProjectedSection(projected, {
      catalogItems,
      capabilities: caps,
      sectionActions,
      order: order + 1,
    });

    if (adapted.unsupportedRole) unsupportedSectionRoles.push(adapted.unsupportedRole);
    if (adapted.unsupportedVariant) unsupportedVariants.push(adapted.unsupportedVariant);
    if (adapted.skipped || !adapted.section) continue;
    if (adapted.section.visibility === 'hidden' && adapted.section.compatibilityFallback?.used) {
      // Keep for debug but omit from public preview sections list
      fallbackCount += 1;
      continue;
    }
    if (adapted.section.compatibilityFallback?.used) fallbackCount += 1;
    order += 1;
    sections.push(
      Object.freeze({
        ...adapted.section,
        order,
      }),
    );
  }

  // Ensure career/policy footer-only never appear as commerce items in any section
  for (const section of sections) {
    if (['services', 'products', 'menu', 'featured_items'].includes(section.semanticRole)) {
      const bad = section.items.filter((i) =>
        ['policy', 'career', 'testimonial', 'trust_content', 'navigation'].includes(i.contentRole),
      );
      if (bad.length) {
        throw new Error(
          `[designLibrary.rendering] Forbidden commerce mapping: ${bad.map((b) => b.contentRole).join(',')}`,
        );
      }
    }
  }

  const viewModel = Object.freeze({
    version: RENDER_VIEW_MODEL_VERSION,
    source: /** @type {const} */ ('design_library_projection'),
    blueprintId: projection.blueprintId,
    visualThemeId:
      input.theme?.visualThemeId ??
      input.theme?.id ??
      projection.metadata?.themeId ??
      null,
    businessModel: projection.businessModel,
    primaryAction,
    secondaryActions: Object.freeze(secondaryActions),
    sections: Object.freeze(sections),
    compatibility: Object.freeze({
      fullySupported: fallbackCount === 0 && unsupportedSectionRoles.length === 0,
      fallbackCount,
      unsupportedSectionRoles: Object.freeze([...new Set(unsupportedSectionRoles)]),
      unsupportedVariants: Object.freeze([...new Set(unsupportedVariants)]),
    }),
    authoritative: false,
    adapterVersion: ADAPTER_VERSION,
  });

  const validation = validateRenderViewModel(viewModel, { catalogItems, businessData });
  if (!validation.ok) {
    const err = new Error(
      `[designLibrary.rendering] Invalid render view model: ${validation.errors.join(', ')}`,
    );
    err.validation = validation;
    throw err;
  }

  return viewModel;
}

/**
 * @param {string | null | undefined} action
 * @param {{
 *   businessData: Record<string, unknown>,
 *   policy: Record<string, unknown>,
 *   placement?: string[],
 * }} ctx
 * @returns {import('./projectionSectionAdapter.js').RenderAction | null}
 */
export function buildRenderAction(action, ctx) {
  if (!action || typeof action !== 'string') return null;
  const evidence = ctx.policy.evidenceSummary ?? ctx.businessData.evidenceSummary ?? {};
  const phone = String(ctx.businessData.phone ?? '').trim();
  const bookingUrl = String(ctx.businessData.bookingUrl ?? '').trim();
  const bookingProvider = String(ctx.businessData.bookingProvider ?? '').trim();
  const hasPhone = Boolean(phone) || Boolean(evidence.hasPhone);
  const hasBooking =
    Boolean(bookingUrl) ||
    Boolean(bookingProvider) ||
    Boolean(evidence.hasBookingUrl) ||
    Boolean(evidence.hasBookingProvider);
  const hasPurchasable = Boolean(evidence.hasPricedPurchasableProduct);

  let enabled = true;
  let evidenceBacked = false;
  /** @type {string | undefined} */
  let href;

  switch (action) {
    case 'call':
      enabled = hasPhone;
      evidenceBacked = hasPhone;
      href = hasPhone ? `tel:${phone.replace(/\s+/g, '')}` : undefined;
      break;
    case 'book':
      enabled = hasBooking;
      evidenceBacked = hasBooking;
      href = bookingUrl || undefined;
      break;
    case 'buy':
    case 'add_to_cart':
      enabled = hasPurchasable;
      evidenceBacked = hasPurchasable;
      break;
    case 'request_quote':
    case 'enquire':
    case 'contact':
      enabled = true;
      evidenceBacked = true;
      href = ctx.businessData.quoteHref ?? ctx.businessData.contactHref ?? '#quote';
      break;
    case 'order':
    case 'reserve':
      enabled = Boolean(ctx.businessData.deliveryUrl || ctx.businessData.reservationUrl || hasBooking);
      evidenceBacked = enabled;
      href = String(ctx.businessData.deliveryUrl || ctx.businessData.reservationUrl || bookingUrl || '') || undefined;
      break;
    case 'get_directions':
      enabled = Boolean(ctx.businessData.address || ctx.businessData.location);
      evidenceBacked = enabled;
      break;
    default:
      enabled = true;
      evidenceBacked = false;
  }

  // Never emit Book when policy primary is request_quote (caller should pass request_quote)
  const label = RENDER_ACTION_LABELS[action] ?? action;

  return Object.freeze({
    action,
    label,
    ...(href ? { href } : {}),
    enabled,
    evidenceBacked,
    ...(ctx.placement ? { placement: Object.freeze([...ctx.placement]) } : {}),
  });
}

/**
 * Compact summary for metadata persistence (avoid huge payloads).
 * @param {ReturnType<typeof adaptProjectionToRenderViewModel>} viewModel
 */
export function summarizeRenderViewModel(viewModel) {
  return Object.freeze({
    source: viewModel.source,
    blueprintId: viewModel.blueprintId ?? null,
    businessModel: viewModel.businessModel ?? null,
    primaryAction: viewModel.primaryAction?.action ?? null,
    primaryLabel: viewModel.primaryAction?.label ?? null,
    sectionCount: viewModel.sections.length,
    visibleSectionCount: viewModel.sections.filter((s) => s.visibility === 'visible').length,
    footerOnlySectionCount: viewModel.sections.filter((s) => s.visibility === 'footer_only').length,
    fallbackCount: viewModel.compatibility.fallbackCount,
    sectionRoles: Object.freeze(viewModel.sections.map((s) => s.semanticRole)),
    adapterVersion: viewModel.adapterVersion,
  });
}
