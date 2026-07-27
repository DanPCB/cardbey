/**
 * Helper functions to build MIEntity objects from asset generation context
 */

import type {
  MIEntity,
  MIProductType,
  MIMediaType,
  MIBrainRole,
  MIFormat,
  MIOrigin,
  MIContext,
  MIBrain,
  MICapabilities,
  MIBehaviorRules,
  MICTAPlan,
  MIAnalyticsPlan,
  MILifecycle,
} from './miTypes.js';

export interface BuildMIEntityParams {
  productId: string;
  productType: MIProductType;
  fileUrl: string;
  previewUrl?: string;
  mediaType: MIMediaType;
  dimensions?: { width?: number; height?: number };
  durationSec?: number;
  createdByUserId: string;
  createdByEngine?: string;
  sourceProjectId?: string;
  tenantId?: string;
  storeId?: string;
  campaignId?: string;
  locales?: string[];
  timeZone?: string;
}

/**
 * Build an MIEntity from asset generation parameters
 */
export function buildMIEntity(params: BuildMIEntityParams): MIEntity {
  const {
    productId,
    productType,
    fileUrl,
    previewUrl,
    mediaType,
    dimensions,
    durationSec,
    createdByUserId,
    createdByEngine = 'creative_engine_v3',
    sourceProjectId,
    tenantId,
    storeId,
    campaignId,
    locales = ['vi-VN', 'en-AU'],
    timeZone = 'Australia/Melbourne',
  } = params;

  // Build format
  const format: MIFormat = {
    mediaType,
    fileUrl,
    previewUrl: previewUrl || fileUrl,
    durationSec,
  };

  // Add dimensions if available
  if (dimensions?.width && dimensions?.height) {
    const dimStr = `${dimensions.width}x${dimensions.height}`;
    format.dimensions = dimStr;
    
    // Determine orientation
    if (dimensions.width > dimensions.height) {
      format.orientation = 'horizontal';
    } else if (dimensions.height > dimensions.width) {
      format.orientation = 'vertical';
    } else {
      format.orientation = 'square';
    }
  }

  // Build origin
  const origin: MIOrigin = {
    createdByUserId,
    createdByEngine,
    sourceProjectId,
    createdAt: new Date().toISOString(),
  };

  // Determine role and primary intent based on productType
  const { role, primaryIntent } = getRoleAndIntent(productType, campaignId);

  // Build context
  const context: MIContext = {
    tenantId,
    storeId,
    campaignId,
    locales,
    channels: getChannelsForProductType(productType),
    environmentHints: {
      timeZone,
      isPhysical: productType === 'packaging',
      isOnDeviceEngine: productType === 'screen_item',
      screenOrientation: format.orientation === 'vertical' ? 'vertical' : 'horizontal',
    },
  };

  // Build capabilities
  const capabilities: MICapabilities = {
    personalisation: {
      enabled: shouldEnablePersonalisation(productType),
    },
    localisation: {
      autoTranslate: locales.length > 1,
      fallbackLocale: locales[0],
    },
    channelAdaptation: {
      enabled: getChannelsForProductType(productType).length > 1,
    },
    dynamicLayout: {
      enabled: shouldEnableDynamicLayout(productType),
      allowedVariants: getAllowedVariants(productType),
    },
    dataBindings: {
      enabled: shouldEnableDataBindings(productType, campaignId),
      bindings: getDataBindings(productType, campaignId),
    },
  };

  // Build behavior rules
  const behaviorRules: MIBehaviorRules = {
    onView: [
      {
        action: 'emit_event',
        payload: { eventName: 'mi.view', productId, productType },
      },
    ],
  };

  // Add onClick for clickable contexts
  if (isClickableContext(productType)) {
    behaviorRules.onClick = [
      {
        action: 'emit_event',
        payload: { eventName: 'mi.click', productId, productType },
      },
    ];
  }

  // Build CTA plan
  const ctaPlan: MICTAPlan = buildCTAPlan(productType, campaignId);

  // Build analytics plan
  const analyticsPlan: MIAnalyticsPlan = {
    kpis: getKPIsForProductType(productType),
    attribution: {
      sourceTag: 'creative_engine',
    },
  };

  // Build lifecycle
  const lifecycle: MILifecycle = {
    status: 'active',
    validFrom: new Date().toISOString(),
    regenerationPolicy: {
      autoRegenerate: false, // Stage 1: keep it simple
    },
  };

  // Build miBrain
  const miBrain: MIBrain = {
    role,
    primaryIntent,
    context,
    capabilities,
    behaviorRules,
    ctaPlan,
    analyticsPlan,
    lifecycle,
  };

  return {
    productId,
    productType,
    format,
    origin,
    miBrain,
  };
}

/**
 * Get role and primary intent based on productType
 */
function getRoleAndIntent(
  productType: MIProductType,
  campaignId?: string
): { role: MIBrainRole; primaryIntent: string } {
  switch (productType) {
    case 'poster':
      return {
        role: campaignId ? 'event_promoter' : 'generic',
        primaryIntent: campaignId ? 'drive_event_signups' : 'attract_attention_to_promo',
      };
    case 'pdf_report':
      return {
        role: 'insights_explainer',
        primaryIntent: 'explain_store_performance',
      };
    case 'packaging':
      return {
        role: 'brand_carrier',
        primaryIntent: 'extend_brand_experience',
      };
    case 'screen_item':
      return {
        role: 'in_store_attractor',
        primaryIntent: 'attract_attention_to_promo',
      };
    case 'video':
      return {
        role: campaignId ? 'event_promoter' : 'in_store_attractor',
        primaryIntent: campaignId ? 'drive_event_signups' : 'attract_attention_to_promo',
      };
    default:
      return {
        role: 'generic',
        primaryIntent: 'generic_engagement',
      };
  }
}

/**
 * Get channels for product type
 */
function getChannelsForProductType(productType: MIProductType): string[] {
  switch (productType) {
    case 'poster':
      return ['whatsapp', 'facebook', 'instagram'];
    case 'pdf_report':
      return ['email', 'dashboard_download'];
    case 'packaging':
      return ['in_store'];
    case 'screen_item':
      return ['cnet_screen'];
    case 'video':
      return ['whatsapp', 'facebook', 'instagram', 'cnet_screen'];
    default:
      return ['generic'];
  }
}

/**
 * Should enable personalisation for this product type
 */
function shouldEnablePersonalisation(productType: MIProductType): boolean {
  return ['poster', 'pdf_report', 'video'].includes(productType);
}

/**
 * Should enable dynamic layout for this product type
 */
function shouldEnableDynamicLayout(productType: MIProductType): boolean {
  return ['poster', 'screen_item', 'video'].includes(productType);
}

/**
 * Get allowed variants for dynamic layout
 */
function getAllowedVariants(productType: MIProductType): string[] | undefined {
  if (!shouldEnableDynamicLayout(productType)) {
    return undefined;
  }
  return ['1080x1920', '1080x1080', '1920x1080'];
}

/**
 * Should enable data bindings for this product type
 */
function shouldEnableDataBindings(productType: MIProductType, campaignId?: string): boolean {
  if (!campaignId) return false;
  return ['poster', 'screen_item', 'video'].includes(productType);
}

/**
 * Get data bindings for this product type
 */
function getDataBindings(
  productType: MIProductType,
  campaignId?: string
): Array<{ key: string; source: string }> | undefined {
  if (!shouldEnableDataBindings(productType, campaignId)) {
    return undefined;
  }
  return [
    { key: 'event_date', source: 'campaign.eventDate' },
    { key: 'event_url', source: 'campaign.registrationUrl' },
  ];
}

/**
 * Is this a clickable context?
 */
function isClickableContext(productType: MIProductType): boolean {
  return ['poster', 'screen_item', 'video'].includes(productType);
}

/**
 * Build CTA plan based on product type
 */
function buildCTAPlan(productType: MIProductType, campaignId?: string): MICTAPlan {
  switch (productType) {
    case 'poster':
      if (campaignId) {
        return {
          primaryCTA: {
            labelKey: 'cta_register_now',
            targetType: 'url',
            targetValuePath: 'campaign.registrationUrl',
          },
        };
      }
      return {};
    case 'pdf_report':
      return {
        primaryCTA: {
          labelKey: 'cta_view_dashboard',
          targetType: 'dashboard_link',
        },
      };
    case 'packaging':
      return {
        primaryCTA: {
          labelKey: 'cta_visit_portal',
          targetType: 'url',
          targetValuePath: 'store.customerPortalUrl',
        },
      };
    default:
      return {};
  }
}

/**
 * Get KPIs for product type
 */
function getKPIsForProductType(productType: MIProductType): string[] {
  switch (productType) {
    case 'poster':
    case 'screen_item':
      return ['impressions', 'cta_clicks'];
    case 'pdf_report':
      return ['report_views', 'report_downloads'];
    case 'video':
      return ['impressions', 'views', 'cta_clicks'];
    default:
      return ['impressions'];
  }
}
