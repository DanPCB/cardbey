/**
 * Unit tests for MIService
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  registerOrUpdateEntity,
  getEntityById,
  getEntityByLink,
  getEntitiesByContext,
  deleteEntity,
} from './miService.js';
import type { MIRegisterInput } from './miService.js';

const prisma = new PrismaClient();

describe('MIService', () => {
  let testEntityId: string | null = null;

  beforeEach(async () => {
    // Clean up any test entities
    await prisma.mIEntity.deleteMany({
      where: {
        productId: { startsWith: 'test-' },
      },
    });
  });

  afterEach(async () => {
    // Clean up test entity
    if (testEntityId) {
      try {
        await prisma.mIEntity.delete({ where: { id: testEntityId } });
      } catch (err) {
        // Ignore if already deleted
      }
      testEntityId = null;
    }
  });

  it('should register a new MIEntity', async () => {
    const input: MIRegisterInput = {
      productId: 'test-poster-1',
      productType: 'poster',
      mediaType: 'image',
      fileUrl: 'https://example.com/poster.jpg',
      previewUrl: 'https://example.com/poster-thumb.jpg',
      dimensions: '1080x1920',
      orientation: 'vertical',
      createdByUserId: 'user-123',
      createdByEngine: 'creative_engine_v3',
      tenantId: 'tenant-123',
      storeId: 'store-123',
      miBrain: {
        role: 'event_promoter',
        primaryIntent: 'drive_event_signups',
        context: {
          tenantId: 'tenant-123',
          storeId: 'store-123',
          locales: ['vi-VN', 'en-AU'],
          channels: ['whatsapp', 'facebook'],
        },
        capabilities: {
          personalisation: { enabled: true },
          localisation: { autoTranslate: true },
        },
        analyticsPlan: {
          kpis: ['impressions', 'cta_clicks'],
        },
        lifecycle: {
          status: 'active',
          validFrom: new Date().toISOString(),
        },
      },
      links: {
        creativeAssetId: 'asset-123',
      },
    };

    const entity = await registerOrUpdateEntity(input);
    testEntityId = entity.id;

    expect(entity).toBeDefined();
    expect(entity.productId).toBe('test-poster-1');
    expect(entity.productType).toBe('poster');
    expect(entity.mediaType).toBe('image');
    expect(entity.fileUrl).toBe('https://example.com/poster.jpg');
    expect(entity.creativeAssetId).toBe('asset-123');
    expect(entity.tenantId).toBe('tenant-123');
    expect(entity.storeId).toBe('store-123');
    expect((entity.miBrain as any).role).toBe('event_promoter');
  });

  it('should update existing MIEntity for the same link', async () => {
    // Create initial entity
    const input1: MIRegisterInput = {
      productId: 'test-poster-1',
      productType: 'poster',
      mediaType: 'image',
      fileUrl: 'https://example.com/poster-v1.jpg',
      createdByUserId: 'user-123',
      miBrain: {
        role: 'event_promoter',
        primaryIntent: 'drive_event_signups',
        lifecycle: { status: 'active' },
      },
      links: {
        creativeAssetId: 'asset-123',
      },
    };

    const entity1 = await registerOrUpdateEntity(input1);
    testEntityId = entity1.id;

    // Update with same link
    const input2: MIRegisterInput = {
      productId: 'test-poster-1',
      productType: 'poster',
      mediaType: 'image',
      fileUrl: 'https://example.com/poster-v2.jpg', // Updated URL
      createdByUserId: 'user-123',
      miBrain: {
        role: 'event_promoter',
        primaryIntent: 'drive_event_signups_updated', // Updated intent
        lifecycle: { status: 'active' },
      },
      links: {
        creativeAssetId: 'asset-123', // Same link
      },
    };

    const entity2 = await registerOrUpdateEntity(input2);

    // Should be the same entity ID
    expect(entity2.id).toBe(entity1.id);
    // But with updated values
    expect(entity2.fileUrl).toBe('https://example.com/poster-v2.jpg');
    expect((entity2.miBrain as any).primaryIntent).toBe('drive_event_signups_updated');
  });

  it('should get entity by ID', async () => {
    const input: MIRegisterInput = {
      productId: 'test-poster-2',
      productType: 'poster',
      mediaType: 'image',
      fileUrl: 'https://example.com/poster.jpg',
      createdByUserId: 'user-123',
      miBrain: {
        role: 'event_promoter',
        primaryIntent: 'drive_event_signups',
        lifecycle: { status: 'active' },
      },
    };

    const created = await registerOrUpdateEntity(input);
    testEntityId = created.id;

    const found = await getEntityById(created.id);

    expect(found).toBeDefined();
    expect(found?.id).toBe(created.id);
    expect(found?.productId).toBe('test-poster-2');
  });

  it('should get entity by link', async () => {
    const input: MIRegisterInput = {
      productId: 'test-poster-3',
      productType: 'poster',
      mediaType: 'image',
      fileUrl: 'https://example.com/poster.jpg',
      createdByUserId: 'user-123',
      miBrain: {
        role: 'event_promoter',
        primaryIntent: 'drive_event_signups',
        lifecycle: { status: 'active' },
      },
      links: {
        reportId: 'report-123',
      },
    };

    const created = await registerOrUpdateEntity(input);
    testEntityId = created.id;

    const found = await getEntityByLink({ reportId: 'report-123' });

    expect(found).toBeDefined();
    expect(found?.id).toBe(created.id);
    expect(found?.reportId).toBe('report-123');
  });

  it('should query entities by context', async () => {
    // Create multiple entities
    await registerOrUpdateEntity({
      productId: 'test-poster-4',
      productType: 'poster',
      mediaType: 'image',
      fileUrl: 'https://example.com/poster1.jpg',
      createdByUserId: 'user-123',
      tenantId: 'tenant-123',
      storeId: 'store-123',
      miBrain: {
        role: 'event_promoter',
        primaryIntent: 'drive_event_signups',
        lifecycle: { status: 'active' },
      },
    });

    await registerOrUpdateEntity({
      productId: 'test-poster-5',
      productType: 'poster',
      mediaType: 'image',
      fileUrl: 'https://example.com/poster2.jpg',
      createdByUserId: 'user-123',
      tenantId: 'tenant-123',
      storeId: 'store-456', // Different store
      miBrain: {
        role: 'event_promoter',
        primaryIntent: 'drive_event_signups',
        lifecycle: { status: 'active' },
      },
    });

    await registerOrUpdateEntity({
      productId: 'test-report-1',
      productType: 'pdf_report',
      mediaType: 'pdf',
      fileUrl: 'https://example.com/report.pdf',
      createdByUserId: 'user-123',
      tenantId: 'tenant-123',
      storeId: 'store-123',
      miBrain: {
        role: 'insights_explainer',
        primaryIntent: 'explain_store_performance',
        lifecycle: { status: 'active' },
      },
    });

    // Query by tenant and store
    const results = await getEntitiesByContext({
      tenantId: 'tenant-123',
      storeId: 'store-123',
    });

    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.every((e) => e.tenantId === 'tenant-123')).toBe(true);
    expect(results.every((e) => e.storeId === 'store-123')).toBe(true);

    // Query by productType
    const posters = await getEntitiesByContext({
      tenantId: 'tenant-123',
      productType: 'poster',
    });

    expect(posters.length).toBeGreaterThanOrEqual(2);
    expect(posters.every((e) => e.productType === 'poster')).toBe(true);

    // Query by role
    const explainers = await getEntitiesByContext({
      tenantId: 'tenant-123',
      role: 'insights_explainer',
    });

    expect(explainers.length).toBeGreaterThanOrEqual(1);
    expect(explainers.every((e) => (e.miBrain as any).role === 'insights_explainer')).toBe(true);
  });

  it('should delete entity', async () => {
    const input: MIRegisterInput = {
      productId: 'test-poster-6',
      productType: 'poster',
      mediaType: 'image',
      fileUrl: 'https://example.com/poster.jpg',
      createdByUserId: 'user-123',
      miBrain: {
        role: 'event_promoter',
        primaryIntent: 'drive_event_signups',
        lifecycle: { status: 'active' },
      },
    };

    const created = await registerOrUpdateEntity(input);
    const id = created.id;

    await deleteEntity(id);

    const found = await getEntityById(id);
    expect(found).toBeNull();
  });
});
