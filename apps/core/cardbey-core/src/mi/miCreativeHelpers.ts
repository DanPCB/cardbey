/**
 * MI Helpers for Creative Engine / Content Studio
 * Builds MIEntity data for creative assets (Content designs)
 */

import type { MIBrain } from './miTypes.js';

export interface ContentContext {
  tenantId?: string | null;
  storeId?: string | null;
  userId: string;
  purpose?: string;
  intent?: string;
}

/**
 * Infer role from content type/settings
 * Simple defaults for now
 */
export function inferCreativeRole(content: {
  settings?: Record<string, unknown>;
  elements?: unknown[];
}): MIBrain['role'] {
  const settings = content.settings || {};
  const elements = content.elements || [];

  // Check if it's a menu layout
  if (settings.menuLayout || (settings as any).isMenu) {
    return 'menu_page';
  }

  // Check if it's a video (has video elements)
  const hasVideo = elements.some((el: any) => 
    el?.type === 'video' || el?.kind === 'video'
  );
  if (hasVideo) {
    return 'social_clip';
  }

  // Check if it's a poster/static image
  const hasImage = elements.some((el: any) => 
    el?.type === 'image' || el?.kind === 'image'
  );
  if (hasImage || !hasVideo) {
    return 'ad_poster';
  }

  // Default fallback
  return 'creative_generic';
}

/**
 * Infer primary intent from content context
 */
export function inferCreativeIntent(context: ContentContext): string {
  // Use explicit intent if provided
  if (context.intent) {
    return context.intent;
  }

  // Use purpose if provided
  if (context.purpose) {
    return context.purpose;
  }

  // Default intent
  return 'generic_marketing_asset';
}

/**
 * Build MIBrain for a creative asset (Content design)
 */
export function buildCreativeAssetMIBrain(
  content: {
    id: string;
    name?: string;
    settings?: Record<string, unknown>;
    elements?: unknown[];
  },
  context: ContentContext
): MIBrain {
  const role = inferCreativeRole(content);
  const primaryIntent = inferCreativeIntent(context);

  // Infer channels from settings or default to creative_engine
  const channels = ['creative_engine'];
  if (context.storeId) {
    channels.push('cnet_screen');
  }

  return {
    role,
    primaryIntent,
    secondaryIntents: [],
    context: {
      tenantId: context.tenantId || undefined,
      storeId: context.storeId || undefined,
      channels,
      environmentHints: {
        isPhysical: false,
        isOnDeviceEngine: false,
      },
    },
    capabilities: {
      personalisation: { enabled: false },
      localisation: { autoTranslate: false, fallbackLocale: 'en-AU' },
      channelAdaptation: { enabled: true },
      dynamicLayout: { enabled: false },
      dataBindings: { enabled: false },
    },
    behaviorRules: {},
    ctaPlan: null,
    analyticsPlan: {
      kpis: ['content_views', 'content_exports'],
      attributionSource: 'creative_engine',
    },
    lifecycle: {
      status: 'active',
    },
  };
}
