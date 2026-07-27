/**
 * MI Device Helpers
 * Centralized helpers for building MIEntity data for Device Engine / Signage playlist items
 */

import type { MIBrain, MIBrainRole, MIContext, MICapabilities, MIBehaviorRules, MIAnalyticsPlan, MILifecycle } from './miTypes.js';

export interface ScreenItemContext {
  tenantId: string;
  storeId: string;
  campaignId?: string | null;
  userId?: string | null;
  screenOrientation?: 'vertical' | 'horizontal';
}

export interface ScreenItemAsset {
  id: string;
  type: string; // 'image' | 'video' | 'html'
  url: string;
  durationS?: number | null;
  width?: number | null;
  height?: number | null;
  mimeType?: string | null;
}

export interface ScreenItemPlaylistItem {
  id: string;
  durationS: number;
}

/**
 * Infer the role for a screen item
 * Default: 'in_store_attractor'
 * Can be enhanced later based on asset type, campaign context, etc.
 */
export function inferScreenItemRole(
  asset: ScreenItemAsset,
  context: ScreenItemContext
): MIBrainRole {
  // For Stage 1, always use 'in_store_attractor'
  // Future: could vary based on campaign type, asset tags, etc.
  return 'in_store_attractor';
}

/**
 * Build MIBrain for a screen/playlist item
 */
export function buildScreenItemMIBrain(
  playlistItem: ScreenItemPlaylistItem,
  asset: ScreenItemAsset,
  context: ScreenItemContext
): MIBrain {
  const role = inferScreenItemRole(asset, context);
  const orientation = context.screenOrientation || 'horizontal';

  const miContext: MIContext = {
    tenantId: context.tenantId,
    storeId: context.storeId,
    campaignId: context.campaignId || undefined,
    channels: ['cnet_screen'],
    environmentHints: {
      isPhysical: true,
      isOnDeviceEngine: true,
      screenOrientation: orientation,
    },
  };

  const capabilities: MICapabilities = {
    personalisation: {
      enabled: false,
    },
    localisation: {
      autoTranslate: false,
      fallbackLocale: 'en-AU',
    },
    channelAdaptation: {
      enabled: true, // Can adapt to different screen sizes/orientations
    },
    dynamicLayout: {
      enabled: true,
      allowedVariants: ['1080x1920', '1080x1080', '1920x1080'],
    },
    dataBindings: {
      enabled: false, // Disabled for Stage 1
    },
  };

  const behaviorRules: MIBehaviorRules = {
    onPlaylistEnter: [
      {
        action: 'emit_event',
        payload: {
          eventName: 'mi.screen_item.play_started',
          productId: playlistItem.id,
          productType: 'screen_item',
        },
      },
    ],
  };

  const analyticsPlan: MIAnalyticsPlan = {
    kpis: ['play_count', 'screen_time'],
    attribution: {
      sourceTag: 'device_engine',
      campaignTagPath: context.campaignId ? 'campaign.id' : undefined,
    },
  };

  const lifecycle: MILifecycle = {
    status: 'active',
    validFrom: new Date().toISOString(),
    regenerationPolicy: {
      autoRegenerate: false,
    },
  };

  return {
    role,
    primaryIntent: 'attract_attention_to_promo',
    context: miContext,
    capabilities,
    behaviorRules,
    ctaPlan: {},
    analyticsPlan,
    lifecycle,
  };
}

/**
 * Determine media type from asset
 */
export function inferMediaType(asset: ScreenItemAsset): 'image' | 'video' {
  if (asset.mimeType?.startsWith('video/')) {
    return 'video';
  }
  if (asset.type === 'video') {
    return 'video';
  }
  return 'image';
}

/**
 * Build dimensions string from asset width/height
 */
export function buildDimensions(asset: ScreenItemAsset): string | null {
  if (asset.width && asset.height) {
    return `${asset.width}x${asset.height}`;
  }
  return null;
}

/**
 * Determine orientation from asset dimensions or context
 */
export function inferOrientation(
  asset: ScreenItemAsset,
  context: ScreenItemContext
): 'vertical' | 'horizontal' | 'square' | 'flat' | null {
  // Prefer screen orientation from context
  if (context.screenOrientation) {
    return context.screenOrientation;
  }

  // Fallback to infer from asset dimensions
  if (asset.width && asset.height) {
    if (asset.width > asset.height) {
      return 'horizontal';
    } else if (asset.height > asset.width) {
      return 'vertical';
    } else {
      return 'square';
    }
  }

  // Default to horizontal if unknown
  return 'horizontal';
}
