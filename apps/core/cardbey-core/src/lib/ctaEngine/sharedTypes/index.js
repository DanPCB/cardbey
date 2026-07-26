/**
 * CTA Engine shared contracts (JSDoc).
 * @typedef {'platform'|'store'|'performer'|'discovery'|'campaign'} CtaProviderId
 * @typedef {'sticky'|'floating'|'inline'|'section'|'hero'|'bottom_sheet'|'drawer'|'notification'} CtaPlacement
 * @typedef {'primary'|'secondary'|'hidden'|'deferred'} CtaSlotKind
 * @typedef {'guest'|'authenticated'|'owner'|'staff'|'visitor'|'partner'} CtaAudience
 *
 * @typedef {object} CtaCapability
 * @property {string} id
 * @property {string} title
 * @property {string} [description]
 * @property {string} [category]
 * @property {CtaProviderId} provider
 * @property {string[]} [requiredPermissions]
 * @property {boolean} [requiresAuth]
 * @property {string[]} [requiredFeatureFlags]
 * @property {string} [deepLink]
 * @property {number} [priority]  higher = more important (default 50)
 * @property {CtaAudience[]} [supportedAudiences]
 * @property {string[]} [dependencies]
 * @property {string} [analyticsId]
 * @property {string} [completionKey]  personalisation key when capability is done
 * @property {string} [proposedAction]  governance key when applicable
 * @property {Record<string, unknown>} [meta]
 *
 * @typedef {object} CtaVariant
 * @property {string} id
 * @property {string} capabilityId
 * @property {string} label
 * @property {string} [sublabel]
 * @property {string} [action]  e.g. booking|order|create_store
 * @property {CtaPlacement[]} [placements]
 * @property {string[]} [contexts]  semantic page/section tags
 * @property {number} [weight]
 * @property {Record<string, unknown>} [meta]
 *
 * @typedef {object} CtaSemanticContext
 * @property {string} [route]
 * @property {string} [pageKind]  storefront|marketplace|performer|marketing|discovery
 * @property {string} [section]  about|loyalty|catalog|ai|display|creator
 * @property {number} [scrollRatio]  0..1
 * @property {string|null} [missionId]
 * @property {string|null} [storeId]
 * @property {string|null} [businessType]
 * @property {string|null} [commerceMode]
 * @property {boolean} [authenticated]
 * @property {CtaAudience} [audience]
 * @property {string[]} [completedCapabilityIds]
 * @property {string[]} [dismissedCtaIds]
 * @property {string[]} [recentActivity]
 * @property {Record<string, boolean>} [featureFlags]
 * @property {'mobile'|'tablet'|'desktop'} [device]
 * @property {string} [language]
 * @property {string} [journeyStage]  explore|create|operate|grow
 * @property {Record<string, unknown>} [extras]
 *
 * @typedef {object} RankedCta
 * @property {string} capabilityId
 * @property {string} variantId
 * @property {string} label
 * @property {string} [sublabel]
 * @property {string} [action]
 * @property {string} [deepLink]
 * @property {CtaProviderId} provider
 * @property {number} score
 * @property {CtaSlotKind} slot
 * @property {string[]} [reasons]
 * @property {string} [proposedAction]
 * @property {string} [analyticsId]
 *
 * @typedef {object} CtaEvaluateResult
 * @property {RankedCta|null} primary
 * @property {RankedCta[]} secondary
 * @property {RankedCta[]} hidden
 * @property {RankedCta[]} deferred
 * @property {CtaSemanticContext} context
 *
 * @typedef {object} CtaRenderModel
 * @property {string} id
 * @property {string} capabilityId
 * @property {string} variantId
 * @property {string} label
 * @property {string} [sublabel]
 * @property {string} [action]
 * @property {string} [deepLink]
 * @property {CtaPlacement} placement
 * @property {CtaProviderId} provider
 * @property {string} [analyticsId]
 * @property {string} [proposedAction]
 * @property {Record<string, unknown>} [styleHints]
 * @property {Record<string, unknown>} [meta]
 *
 * @typedef {object} CtaProvider
 * @property {CtaProviderId} id
 * @property {string} [label]
 * @property {(ctx: CtaSemanticContext) => CtaCapability[]} listCapabilities
 * @property {(ctx: CtaSemanticContext, capability: CtaCapability) => CtaVariant[]} listVariants
 */

export const CTA_PROVIDERS = Object.freeze([
  'platform',
  'store',
  'performer',
  'discovery',
  'campaign',
]);

export const CTA_PLACEMENTS = Object.freeze([
  'sticky',
  'floating',
  'inline',
  'section',
  'hero',
  'bottom_sheet',
  'drawer',
  'notification',
]);
