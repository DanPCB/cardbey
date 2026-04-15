/**
 * Playlist Consolidation Tests
 * Tests for unified Playlist model with PlaylistType enum
 */

import { describe, it, expect, afterAll, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Playlist Consolidation', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.playlistItem.deleteMany({});
    await prisma.playlist.deleteMany({});
    await prisma.signageAsset.deleteMany({});
    await prisma.media.deleteMany({});
  });

  it('should create a SIGNAGE playlist with SignageAsset items', async () => {
    // Create a signage asset
    const asset = await prisma.signageAsset.create({
      data: {
        tenantId: 'test-tenant',
        storeId: 'test-store',
        type: 'image',
        url: 'https://example.com/image.jpg',
        durationS: 10,
      },
    });

    // Create a SIGNAGE playlist
    const playlist = await prisma.playlist.create({
      data: {
        type: 'SIGNAGE',
        tenantId: 'test-tenant',
        storeId: 'test-store',
        name: 'Test Signage Playlist',
        description: 'Test description',
        active: true,
        items: {
          create: {
            orderIndex: 0,
            durationS: 10,
            assetId: asset.id,
          },
        },
      },
      include: {
        items: {
          include: {
            asset: true,
          },
        },
      },
    });

    expect(playlist).toBeDefined();
    expect(playlist.type).toBe('SIGNAGE');
    expect(playlist.tenantId).toBe('test-tenant');
    expect(playlist.storeId).toBe('test-store');
    expect(playlist.items.length).toBe(1);
    expect(playlist.items[0].assetId).toBe(asset.id);
    expect(playlist.items[0].orderIndex).toBe(0);
    expect(playlist.items[0].durationS).toBe(10);
    expect(playlist.items[0].asset).toBeDefined();
    expect(playlist.items[0].mediaId).toBeNull();
  });

  it('should create a MEDIA playlist with Media items', async () => {
    // Create a media item
    const media = await prisma.media.create({
      data: {
        url: 'https://example.com/video.mp4',
        kind: 'VIDEO',
        mime: 'video/mp4',
        sizeBytes: 1000000,
        durationS: 30,
      },
    });

    // Create a MEDIA playlist
    const playlist = await prisma.playlist.create({
      data: {
        type: 'MEDIA',
        name: 'Test Media Playlist',
        items: {
          create: {
            orderIndex: 0,
            durationS: 8,
            fit: 'cover',
            muted: false,
            loop: false,
            displayOrientation: 'AUTO',
            mediaId: media.id,
          },
        },
      },
      include: {
        items: {
          include: {
            media: true,
          },
        },
      },
    });

    expect(playlist).toBeDefined();
    expect(playlist.type).toBe('MEDIA');
    expect(playlist.tenantId).toBeNull(); // MEDIA playlists don't require tenantId
    expect(playlist.storeId).toBeNull(); // MEDIA playlists don't require storeId
    expect(playlist.items.length).toBe(1);
    expect(playlist.items[0].mediaId).toBe(media.id);
    expect(playlist.items[0].orderIndex).toBe(0);
    expect(playlist.items[0].durationS).toBe(8);
    expect(playlist.items[0].fit).toBe('cover');
    expect(playlist.items[0].muted).toBe(false);
    expect(playlist.items[0].loop).toBe(false);
    expect(playlist.items[0].displayOrientation).toBe('AUTO');
    expect(playlist.items[0].media).toBeDefined();
    expect(playlist.items[0].assetId).toBeNull();
  });

  it('should query playlists by type', async () => {
    // Create SIGNAGE playlist
    const signageAsset = await prisma.signageAsset.create({
      data: {
        tenantId: 'test-tenant',
        storeId: 'test-store',
        type: 'image',
        url: 'https://example.com/image.jpg',
        durationS: 10,
      },
    });

    await prisma.playlist.create({
      data: {
        type: 'SIGNAGE',
        tenantId: 'test-tenant',
        storeId: 'test-store',
        name: 'Signage Playlist',
        items: {
          create: {
            orderIndex: 0,
            durationS: 10,
            assetId: signageAsset.id,
          },
        },
      },
    });

    // Create MEDIA playlist
    const media = await prisma.media.create({
      data: {
        url: 'https://example.com/video.mp4',
        kind: 'VIDEO',
        mime: 'video/mp4',
        sizeBytes: 1000000,
      },
    });

    await prisma.playlist.create({
      data: {
        type: 'MEDIA',
        name: 'Media Playlist',
        items: {
          create: {
            orderIndex: 0,
            durationS: 8,
            mediaId: media.id,
          },
        },
      },
    });

    // Query SIGNAGE playlists
    const signagePlaylists = await prisma.playlist.findMany({
      where: { type: 'SIGNAGE' },
    });

    expect(signagePlaylists.length).toBe(1);
    expect(signagePlaylists[0].type).toBe('SIGNAGE');
    expect(signagePlaylists[0].name).toBe('Signage Playlist');

    // Query MEDIA playlists
    const mediaPlaylists = await prisma.playlist.findMany({
      where: { type: 'MEDIA' },
    });

    expect(mediaPlaylists.length).toBe(1);
    expect(mediaPlaylists[0].type).toBe('MEDIA');
    expect(mediaPlaylists[0].name).toBe('Media Playlist');
  });

  it('should handle optional fields correctly', async () => {
    // MEDIA playlist without tenantId/storeId (legacy compatibility)
    const media = await prisma.media.create({
      data: {
        url: 'https://example.com/video.mp4',
        kind: 'VIDEO',
        mime: 'video/mp4',
        sizeBytes: 1000000,
      },
    });

    const playlist = await prisma.playlist.create({
      data: {
        type: 'MEDIA',
        name: 'Legacy Media Playlist',
        items: {
          create: {
            orderIndex: 0,
            durationS: 8,
            mediaId: media.id,
          },
        },
      },
    });

    expect(playlist.tenantId).toBeNull();
    expect(playlist.storeId).toBeNull();
    expect(playlist.description).toBeNull();
    expect(playlist.active).toBe(true); // Default value
  });
});



