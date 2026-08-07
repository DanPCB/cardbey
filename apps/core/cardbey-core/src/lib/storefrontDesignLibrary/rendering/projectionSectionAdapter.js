/**
 * Adapt one projected section → RenderSection with capability fallbacks.
 */

import {
  SEMANTIC_TO_RENDERER_TYPE,
  RENDER_ACTION_LABELS,
} from './renderCompatibility.js';
import { resolveProjectionItems, assertNonCommerceRole } from './projectionItemAdapter.js';
import { isStorefrontAction } from '../contracts/storefrontAction.js';

/**
 * @typedef {{
 *   action: string,
 *   label: string,
 *   href?: string,
 *   enabled: boolean,
 *   evidenceBacked: boolean,
 *   placement?: string[],
 * }} RenderAction
 *
 * @typedef {{
 *   id: string,
 *   semanticRole: string,
 *   rendererType: string,
 *   variant: string,
 *   order: number,
 *   visibility: string,
 *   heading?: string,
 *   description?: string,
 *   items: import('./projectionItemAdapter.js').RenderItem[],
 *   actions?: RenderAction[],
 *   contentOrigin: string,
 *   requiresOwnerReview: boolean,
 *   compatibilityFallback?: {
 *     used: boolean,
 *     reason?: string,
 *     originalRole?: string,
 *     originalVariant?: string,
 *   },
 * }} RenderSection
 */

/**
 * @param {import('../projection/projectionResult.js').ProjectedStorefrontSection} projected
 * @param {{
 *   catalogItems: unknown[],
 *   capabilities: import('./renderCompatibility.js').RendererCapabilities,
 *   sectionActions?: RenderAction[],
 *   order: number,
 * }} opts
 * @returns {{ section: RenderSection | null, skipped: boolean, unsupportedRole?: string, unsupportedVariant?: string }}
 */
export function adaptProjectedSection(projected, opts) {
  if (!projected || projected.visibility === 'hidden') {
    return { section: null, skipped: true };
  }

  const caps = opts.capabilities;
  let visibility = projected.visibility;

  // Collapsed unsupported → hidden in public compatibility view (still diagnosable via original)
  if (visibility === 'collapsed' && !caps.supportsCollapsedSections) {
    return {
      section: freezeRenderSection({
        id: projected.id,
        semanticRole: projected.role,
        rendererType: 'hidden-placeholder',
        variant: projected.variant,
        order: opts.order,
        visibility: 'hidden',
        items: [],
        contentOrigin: projected.contentOrigin,
        requiresOwnerReview: projected.requiresOwnerReview,
        compatibilityFallback: {
          used: true,
          reason: 'collapsed_unsupported_hidden_in_public_view',
          originalRole: projected.role,
          originalVariant: projected.variant,
        },
      }),
      skipped: false,
    };
  }

  // Footer-only unsupported → fold to footer-links visibility footer_only
  let mapping = SEMANTIC_TO_RENDERER_TYPE[projected.role];
  if (!mapping) {
    return {
      section: null,
      skipped: true,
      unsupportedRole: projected.role,
    };
  }

  /** @type {{ used: boolean, reason?: string, originalRole?: string, originalVariant?: string } | undefined} */
  let compatibilityFallback;
  let rendererType = mapping.rendererType;
  let variant = projected.variant;

  const roleSupported = caps.supportedSectionRoles.includes(projected.role);
  if (!roleSupported && mapping.fallbackRendererType) {
    rendererType = mapping.fallbackRendererType;
    compatibilityFallback = {
      used: true,
      reason: mapping.fallbackReason ?? 'section_role_fallback',
      originalRole: projected.role,
      originalVariant: projected.variant,
    };
  }

  // Legacy renderer: dedicated trust/policies UI unsupported → explicit compatibility fallback.
  // Cutover renderer (supportsFooterOnly / native trust) keeps semantic rendererType + role.
  const legacyCompatRenderer = caps.rendererId === 'cardbey-legacy-storefront-v1';
  if (projected.role === 'trust' && mapping.fallbackRendererType && legacyCompatRenderer) {
    rendererType = mapping.fallbackRendererType;
    compatibilityFallback = {
      used: true,
      reason: mapping.fallbackReason,
      originalRole: 'trust',
      originalVariant: projected.variant,
    };
  }
  if (projected.role === 'policies') {
    if (!caps.supportsFooterOnly) {
      rendererType = mapping.fallbackRendererType ?? 'footer-links';
      visibility = 'footer_only';
      compatibilityFallback = {
        used: true,
        reason: mapping.fallbackReason ?? 'policies_footer_fallback',
        originalRole: 'policies',
        originalVariant: projected.variant,
      };
    } else if (visibility !== 'footer_only' && projected.visibility === 'footer_only') {
      visibility = 'footer_only';
    }
  }

  // Grouped services unsupported
  if (
    projected.role === 'service_categories' &&
    !caps.supportsGroupedServices &&
    (variant === 'grouped-list' || variant === 'category-grid')
  ) {
    compatibilityFallback = {
      used: true,
      reason: 'grouped_services_unsupported_flat_list',
      originalRole: projected.role,
      originalVariant: variant,
    };
    rendererType = mapping.fallbackRendererType ?? 'service-list';
    variant = 'card-grid';
  }

  const supportedVariants = caps.supportedVariantsByRole[projected.role] ?? ['default'];
  let unsupportedVariant;
  if (!supportedVariants.includes(variant)) {
    unsupportedVariant = variant;
    compatibilityFallback = {
      used: true,
      reason: `variant_unsupported:${variant}`,
      originalRole: projected.role,
      originalVariant: variant,
    };
    variant = supportedVariants.includes(projected.variant)
      ? projected.variant
      : supportedVariants[0] ?? 'default';
  }

  const { items, unresolved } = resolveProjectionItems(projected.itemRefs, opts.catalogItems);
  // Drop any item that would become commerce incorrectly
  const safeItems = items.filter((it) => assertNonCommerceRole(it));

  const preferred = projected.metadata?.preferredActions;
  const actions =
    opts.sectionActions ??
    (Array.isArray(preferred)
      ? preferred
          .filter((a) => isStorefrontAction(a))
          .map((a) => ({
            action: a,
            label: RENDER_ACTION_LABELS[a] ?? a,
            enabled: false,
            evidenceBacked: false,
            placement: [projected.role],
          }))
      : undefined);

  const heading =
    projected.role === 'service_categories'
      ? 'Service Categories'
      : projected.role === 'services'
        ? 'Services'
        : undefined;

  const section = freezeRenderSection({
    id: projected.id,
    semanticRole: projected.role,
    rendererType,
    variant,
    order: opts.order,
    visibility,
    heading,
    items: safeItems,
    actions,
    contentOrigin: projected.contentOrigin,
    requiresOwnerReview: projected.requiresOwnerReview,
    compatibilityFallback,
    metadata: {
      unresolvedItemRefs: unresolved,
      groups: projected.metadata?.groups ?? null,
      careerPlacement: projected.metadata?.careerPlacement,
    },
  });

  return { section, skipped: false, unsupportedVariant };
}

/**
 * @param {RenderSection & { metadata?: Record<string, unknown> }} partial
 */
function freezeRenderSection(partial) {
  return Object.freeze({
    id: partial.id,
    semanticRole: partial.semanticRole,
    rendererType: partial.rendererType,
    variant: partial.variant,
    order: partial.order,
    visibility: partial.visibility,
    ...(partial.heading != null ? { heading: partial.heading } : {}),
    ...(partial.description != null ? { description: partial.description } : {}),
    items: Object.freeze([...(partial.items ?? [])]),
    ...(partial.actions ? { actions: Object.freeze([...partial.actions]) } : {}),
    contentOrigin: partial.contentOrigin,
    requiresOwnerReview: Boolean(partial.requiresOwnerReview),
    ...(partial.compatibilityFallback
      ? { compatibilityFallback: Object.freeze({ ...partial.compatibilityFallback }) }
      : {}),
    ...(partial.metadata ? { metadata: Object.freeze({ ...partial.metadata }) } : {}),
  });
}
