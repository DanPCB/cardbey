/**
 * Unit tests for MI Orchestrator Service
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { getSignagePlaylistSuggestions } from './miOrchestratorService.js';
import * as miService from './miService.js';

const prisma = new PrismaClient();

describe('MI Orchestrator Service', () => {
  let testTenantId = 'test-tenant-orchestrator';
  let testStoreId = 'test-store-orchestrator';
  let testPlaylistId: string | null = null;
  let testAssetId: string | null = null;
  let testItemId: string | null = null;
  let testMIEntityId: string | null = null;

  beforeEach(async () => {
    // Clean up test data
    if (testItemId) {
      await prisma.playlistItem.deleteMany({ where: { id: testItemId } });
    }
    if (testPlaylistId) {
      await prisma.playlist.deleteMany({ where: { id: testPlaylistId } });
    }
    if (testAssetId) {
      await prisma.signageAsset.deleteMany({ where: { id: testAssetId } });
    }
    if (testMIEntityId) {
      await prisma.mIEntity.deleteMany({ where: { id: testMIEntityId } });
    }
  });

  afterEach(async () => {
    // Clean up test data
    if (testItemId) {
      await prisma.playlistItem.deleteMany({ where: { id: testItemId } }).catch(() => {});
    }
    if (testPlaylistId) {
      await prisma.playlist.deleteMany({ where: { id: testPlaylistId } }).catch(() => {});
    }
    if (testAssetId) {
      await prisma.signageAsset.deleteMany({ where: { id: testAssetId } }).catch(() => {});
    }
    if (testMIEntityId) {
      await prisma.mIEntity.deleteMany({ where: { id: testMIEntityId } }).catch(() => {});
    }
  });

  it('should suggest increasing duration for attractor items with short duration', async () => {
    // Create test asset
    const asset = await prisma.signageAsset.create({
      data: {
        url: 'https://example.com/asset.jpg',
        type: 'image',
        tenantId: testTenantId,
        storeId: testStoreId,
        durationS: 8,
      },
    });
    testAssetId = asset.id;

    // Create test playlist
    const playlist = await prisma.playlist.create({
      data: {
        name: 'Test Playlist',
        type: 'SIGNAGE',
        tenantId: testTenantId,
        storeId: testStoreId,
      },
    });
    testPlaylistId = playlist.id;

    // Create playlist item with short duration
    const item = await prisma.playlistItem.create({
      data: {
        playlistId: playlist.id,
        assetId: asset.id,
        orderIndex: 0,
        durationS: 3, // Short duration
      },
    });
    testItemId = item.id;

    // Create MIEntity with attractor intent
    const miEntity = await miService.registerOrUpdateEntity({
      productId: item.id,
      productType: 'screen_item',
      mediaType: 'image',
      fileUrl: asset.url,
      createdByUserId: 'test-user',
      miBrain: {
        role: 'ad_poster',
        primaryIntent: 'attract_attention_to_promo', // Attractor intent
        secondaryIntents: [],
        context: {
          tenantId: testTenantId,
          storeId: testStoreId,
          channels: ['cnet_screen'],
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
          kpis: ['views'],
          attributionSource: 'signage',
        },
        lifecycle: {
          status: 'active',
        },
      },
      links: {
        screenItemId: item.id,
      },
    });
    testMIEntityId = miEntity.id;

    // Get suggestions
    const suggestions = await getSignagePlaylistSuggestions({
      playlistId: playlist.id,
      tenantId: testTenantId,
      storeId: testStoreId,
    });

    // Should have at least one recommendation for increasing duration
    const attractorSuggestion = suggestions.find(
      (s) => s.code === 'increase_duration_for_attractor' && s.type === 'recommendation'
    );
    expect(attractorSuggestion).toBeDefined();
    expect(attractorSuggestion?.message).toContain('attractor promo');
    expect(attractorSuggestion?.message).toContain('3s');
    expect(attractorSuggestion?.itemId).toBe(item.id);
  });

  it('should suggest adding more items for single-item playlist', async () => {
    // Create test asset
    const asset = await prisma.signageAsset.create({
      data: {
        url: 'https://example.com/asset.jpg',
        type: 'image',
        tenantId: testTenantId,
        storeId: testStoreId,
        durationS: 8,
      },
    });
    testAssetId = asset.id;

    // Create test playlist
    const playlist = await prisma.playlist.create({
      data: {
        name: 'Single Item Playlist',
        type: 'SIGNAGE',
        tenantId: testTenantId,
        storeId: testStoreId,
      },
    });
    testPlaylistId = playlist.id;

    // Create single playlist item
    const item = await prisma.playlistItem.create({
      data: {
        playlistId: playlist.id,
        assetId: asset.id,
        orderIndex: 0,
        durationS: 8,
      },
    });
    testItemId = item.id;

    // Get suggestions
    const suggestions = await getSignagePlaylistSuggestions({
      playlistId: playlist.id,
      tenantId: testTenantId,
      storeId: testStoreId,
    });

    // Should have suggestion for single-item playlist
    const singleItemSuggestion = suggestions.find((s) => s.code === 'single_item_playlist');
    expect(singleItemSuggestion).toBeDefined();
    expect(singleItemSuggestion?.type).toBe('info');
    expect(singleItemSuggestion?.message).toContain('only one item');
  });

  it('should return "no issues detected" for well-configured playlist', async () => {
    // Create test assets
    const asset1 = await prisma.signageAsset.create({
      data: {
        url: 'https://example.com/asset1.jpg',
        type: 'image',
        tenantId: testTenantId,
        storeId: testStoreId,
        durationS: 8,
      },
    });
    const asset2 = await prisma.signageAsset.create({
      data: {
        url: 'https://example.com/asset2.jpg',
        type: 'image',
        tenantId: testTenantId,
        storeId: testStoreId,
        durationS: 10,
      },
    });

    // Create test playlist
    const playlist = await prisma.playlist.create({
      data: {
        name: 'Well Configured Playlist',
        type: 'SIGNAGE',
        tenantId: testTenantId,
        storeId: testStoreId,
      },
    });
    testPlaylistId = playlist.id;

    // Create playlist items with proper durations
    const item1 = await prisma.playlistItem.create({
      data: {
        playlistId: playlist.id,
        assetId: asset1.id,
        orderIndex: 0,
        durationS: 8, // Good duration
      },
    });
    const item2 = await prisma.playlistItem.create({
      data: {
        playlistId: playlist.id,
        assetId: asset2.id,
        orderIndex: 1,
        durationS: 10, // Good duration
      },
    });

    // Create MIEntities with proper roles
    const miEntity1 = await miService.registerOrUpdateEntity({
      productId: item1.id,
      productType: 'screen_item',
      mediaType: 'image',
      fileUrl: asset1.url,
      createdByUserId: 'test-user',
      miBrain: {
        role: 'ad_poster',
        primaryIntent: 'generic_marketing_asset',
        secondaryIntents: [],
        context: {
          tenantId: testTenantId,
          storeId: testStoreId,
          channels: ['cnet_screen'],
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
          kpis: ['views'],
          attributionSource: 'signage',
        },
        lifecycle: {
          status: 'active',
        },
      },
      links: {
        screenItemId: item1.id,
      },
    });

    const miEntity2 = await miService.registerOrUpdateEntity({
      productId: item2.id,
      productType: 'screen_item',
      mediaType: 'image',
      fileUrl: asset2.url,
      createdByUserId: 'test-user',
      miBrain: {
        role: 'ad_poster',
        primaryIntent: 'generic_marketing_asset',
        secondaryIntents: [],
        context: {
          tenantId: testTenantId,
          storeId: testStoreId,
          channels: ['cnet_screen'],
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
          kpis: ['views'],
          attributionSource: 'signage',
        },
        lifecycle: {
          status: 'active',
        },
      },
      links: {
        screenItemId: item2.id,
      },
    });

    // Get suggestions
    const suggestions = await getSignagePlaylistSuggestions({
      playlistId: playlist.id,
      tenantId: testTenantId,
      storeId: testStoreId,
    });

    // Should have exactly one "no issues detected" suggestion
    const noIssuesSuggestion = suggestions.find((s) => s.code === 'no_issues_detected');
    expect(noIssuesSuggestion).toBeDefined();
    expect(noIssuesSuggestion?.type).toBe('info');
    expect(noIssuesSuggestion?.message).toContain('No obvious MI issues');

    // Clean up
    await prisma.mIEntity.deleteMany({ where: { id: { in: [miEntity1.id, miEntity2.id] } } });
    await prisma.playlistItem.deleteMany({ where: { id: { in: [item1.id, item2.id] } } });
    await prisma.signageAsset.deleteMany({ where: { id: { in: [asset1.id, asset2.id] } } });
  });

  it('should return warning for playlist not found', async () => {
    const suggestions = await getSignagePlaylistSuggestions({
      playlistId: 'non-existent-playlist-id',
      tenantId: testTenantId,
      storeId: testStoreId,
    });

    expect(suggestions.length).toBeGreaterThan(0);
    const notFoundSuggestion = suggestions.find((s) => s.code === 'playlist_not_found');
    expect(notFoundSuggestion).toBeDefined();
    expect(notFoundSuggestion?.type).toBe('warning');
  });
});

