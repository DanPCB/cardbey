/**
 * MI Template Helpers
 * Helper functions for registering MIEntity for CreativeTemplate
 */

import * as miService from '../services/miService.js';
import type { CreativeTemplate } from '@prisma/client';

/**
 * Register or update MIEntity for a CreativeTemplate
 * 
 * @param template - The CreativeTemplate to register
 * @returns The created/updated MIEntity or null if registration fails
 */
export async function registerTemplateMIEntity(template: CreativeTemplate) {
  try {
    // Parse JSON fields
    const channels = typeof template.channels === 'string' 
      ? JSON.parse(template.channels) 
      : (Array.isArray(template.channels) ? template.channels : []);
    
    const tags = typeof template.tags === 'string'
      ? JSON.parse(template.tags)
      : (Array.isArray(template.tags) ? template.tags : []);

    // Build MI Brain structure
    const miBrain = {
      role: template.role ?? 'creative_generic',
      primaryIntent: template.primaryIntent ?? 'generic_marketing_asset',
      secondaryIntents: [],
      context: {
        tenantId: template.tenantId ?? null,
        storeId: template.storeId ?? null,
        locales: [], // Can be extended later
        channels: channels.length ? channels : ['creative_engine'],
      },
      capabilities: {
        personalisation: { enabled: false },
        localisation: { 
          enabled: true,
          autoTranslate: false,
          fallbackLocale: 'en-AU',
        },
        channelAdaptation: { enabled: true },
        dynamicLayout: { enabled: false },
        dataBindings: { enabled: false },
      },
      behaviorRules: {},
      ctaPlan: null,
      analyticsPlan: {
        kpis: ['views', 'engagement'],
        attributionSource: 'creative_template',
      },
      lifecycle: {
        status: 'active',
      },
    };

    return await miService.registerOrUpdateEntity({
      productId: template.id,
      productType: 'creative_template',
      mediaType: 'image', // Default, can be extended based on template type
      fileUrl: template.thumbnailUrl || '',
      previewUrl: template.thumbnailUrl || null,
      dimensions: null, // Can be extended if template has dimensions
      orientation: template.orientation as 'vertical' | 'horizontal' | 'square' | 'flat' | undefined,
      durationSec: template.maxDurationS || null,
      createdByUserId: 'system', // Templates are system-created or user-created
      createdByEngine: 'template_engine_v1',
      tenantId: template.tenantId || undefined,
      storeId: template.storeId || undefined,
      miBrain,
      status: template.isActive ? 'active' : 'draft',
      links: {
        templateId: template.id,
      },
    });
  } catch (err) {
    console.error('[MI][Template] Failed to register MIEntity for template', {
      templateId: template.id,
      error: err,
    });
    return null;
  }
}



