/**
 * Unit tests for MIEntity building
 */

import { describe, it, expect } from 'vitest';
import { buildMIEntity } from './buildMIEntity.js';
import type { MIEntity } from './miTypes.js';

describe('buildMIEntity', () => {
  it('should build MIEntity for a poster asset', () => {
    const entity = buildMIEntity({
      productId: 'poster-123',
      productType: 'poster',
      fileUrl: 'https://example.com/poster.jpg',
      previewUrl: 'https://example.com/poster-thumb.jpg',
      mediaType: 'image',
      dimensions: { width: 1080, height: 1920 },
      createdByUserId: 'user-123',
      createdByEngine: 'creative_engine_v3',
      sourceProjectId: 'campaign-456',
      tenantId: 'tenant-123',
      storeId: 'store-123',
      campaignId: 'campaign-456',
    });

    expect(entity.productId).toBe('poster-123');
    expect(entity.productType).toBe('poster');
    expect(entity.format.mediaType).toBe('image');
    expect(entity.format.dimensions).toBe('1080x1920');
    expect(entity.format.orientation).toBe('vertical');
    expect(entity.origin.createdByUserId).toBe('user-123');
    expect(entity.origin.createdByEngine).toBe('creative_engine_v3');
    expect(entity.miBrain.role).toBe('event_promoter');
    expect(entity.miBrain.primaryIntent).toBe('drive_event_signups');
    expect(entity.miBrain.context?.tenantId).toBe('tenant-123');
    expect(entity.miBrain.context?.storeId).toBe('store-123');
    expect(entity.miBrain.context?.campaignId).toBe('campaign-456');
    expect(entity.miBrain.capabilities?.personalisation?.enabled).toBe(true);
    expect(entity.miBrain.capabilities?.localisation?.autoTranslate).toBe(true);
    expect(entity.miBrain.capabilities?.dynamicLayout?.enabled).toBe(true);
    expect(entity.miBrain.ctaPlan?.primaryCTA?.targetType).toBe('url');
    expect(entity.miBrain.analyticsPlan?.kpis).toContain('impressions');
    expect(entity.miBrain.analyticsPlan?.kpis).toContain('cta_clicks');
    expect(entity.miBrain.lifecycle?.status).toBe('active');
  });

  it('should build MIEntity for a PDF report', () => {
    const entity = buildMIEntity({
      productId: 'report-789',
      productType: 'pdf_report',
      fileUrl: 'https://example.com/report.pdf',
      mediaType: 'pdf',
      createdByUserId: 'user-123',
      tenantId: 'tenant-123',
    });

    expect(entity.productId).toBe('report-789');
    expect(entity.productType).toBe('pdf_report');
    expect(entity.format.mediaType).toBe('pdf');
    expect(entity.miBrain.role).toBe('insights_explainer');
    expect(entity.miBrain.primaryIntent).toBe('explain_store_performance');
    expect(entity.miBrain.context?.channels).toContain('email');
    expect(entity.miBrain.context?.channels).toContain('dashboard_download');
    expect(entity.miBrain.ctaPlan?.primaryCTA?.targetType).toBe('dashboard_link');
    expect(entity.miBrain.analyticsPlan?.kpis).toContain('report_views');
  });

  it('should build MIEntity for a screen item (video)', () => {
    const entity = buildMIEntity({
      productId: 'screen-video-456',
      productType: 'screen_item',
      fileUrl: 'https://example.com/video.mp4',
      mediaType: 'video',
      dimensions: { width: 1920, height: 1080 },
      durationSec: 30,
      createdByUserId: 'user-123',
      tenantId: 'tenant-123',
      storeId: 'store-123',
    });

    expect(entity.productId).toBe('screen-video-456');
    expect(entity.productType).toBe('screen_item');
    expect(entity.format.mediaType).toBe('video');
    expect(entity.format.dimensions).toBe('1920x1080');
    expect(entity.format.orientation).toBe('horizontal');
    expect(entity.format.durationSec).toBe(30);
    expect(entity.miBrain.role).toBe('in_store_attractor');
    expect(entity.miBrain.primaryIntent).toBe('attract_attention_to_promo');
    expect(entity.miBrain.context?.channels).toContain('cnet_screen');
    expect(entity.miBrain.context?.environmentHints?.isOnDeviceEngine).toBe(true);
    expect(entity.miBrain.behaviorRules?.onView).toBeDefined();
    expect(entity.miBrain.behaviorRules?.onClick).toBeDefined();
  });

  it('should build MIEntity for packaging', () => {
    const entity = buildMIEntity({
      productId: 'packaging-789',
      productType: 'packaging',
      fileUrl: 'https://example.com/box-design.pdf',
      mediaType: 'print_layout',
      createdByUserId: 'user-123',
      tenantId: 'tenant-123',
      storeId: 'store-123',
    });

    expect(entity.productId).toBe('packaging-789');
    expect(entity.productType).toBe('packaging');
    expect(entity.format.mediaType).toBe('print_layout');
    expect(entity.miBrain.role).toBe('brand_carrier');
    expect(entity.miBrain.primaryIntent).toBe('extend_brand_experience');
    expect(entity.miBrain.context?.channels).toContain('in_store');
    expect(entity.miBrain.context?.environmentHints?.isPhysical).toBe(true);
    expect(entity.miBrain.capabilities?.personalisation?.enabled).toBe(false);
    expect(entity.miBrain.ctaPlan?.primaryCTA?.targetValuePath).toBe('store.customerPortalUrl');
  });

  it('should use default values when optional params are missing', () => {
    const entity = buildMIEntity({
      productId: 'generic-123',
      productType: 'generic',
      fileUrl: 'https://example.com/asset.jpg',
      mediaType: 'image',
      createdByUserId: 'user-123',
    });

    expect(entity.origin.createdByEngine).toBe('creative_engine_v3');
    expect(entity.origin.createdAt).toBeDefined();
    expect(entity.miBrain.role).toBe('generic');
    expect(entity.miBrain.primaryIntent).toBe('generic_engagement');
    expect(entity.miBrain.context?.locales).toEqual(['vi-VN', 'en-AU']);
    expect(entity.miBrain.context?.environmentHints?.timeZone).toBe('Australia/Melbourne');
    expect(entity.miBrain.lifecycle?.regenerationPolicy?.autoRegenerate).toBe(false);
  });

  it('should set dataBindings enabled only when campaignId is provided', () => {
    const entityWithoutCampaign = buildMIEntity({
      productId: 'poster-1',
      productType: 'poster',
      fileUrl: 'https://example.com/poster.jpg',
      mediaType: 'image',
      createdByUserId: 'user-123',
      tenantId: 'tenant-123',
    });

    expect(entityWithoutCampaign.miBrain.capabilities?.dataBindings?.enabled).toBe(false);

    const entityWithCampaign = buildMIEntity({
      productId: 'poster-2',
      productType: 'poster',
      fileUrl: 'https://example.com/poster.jpg',
      mediaType: 'image',
      createdByUserId: 'user-123',
      tenantId: 'tenant-123',
      campaignId: 'campaign-456',
    });

    expect(entityWithCampaign.miBrain.capabilities?.dataBindings?.enabled).toBe(true);
    expect(entityWithCampaign.miBrain.capabilities?.dataBindings?.bindings).toBeDefined();
    expect(entityWithCampaign.miBrain.capabilities?.dataBindings?.bindings?.length).toBeGreaterThan(0);
  });
});
