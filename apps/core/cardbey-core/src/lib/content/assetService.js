/**
 * Asset service — store-scoped content library CRUD.
 */

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { lookup as mimeLookup } from 'mime-types';
import { getPrismaClient } from '../prisma.js';
import { uploadBufferToS3 } from '../s3Client.js';
import { normalizeMediaUrlForStorage } from '../../utils/publicUrl.js';
import {
  DEFAULT_MAX_STORAGE_BYTES,
  detectAssetType,
  mapAssetRow,
  mapCollectionRow,
  sumAssetStorage,
} from './assetTypes.js';
import { VIDEO_UPLOAD_MAX_BYTES, VIDEO_UPLOAD_MAX_MB } from '../../constants/videoUploadLimits.js';

export class AssetService {
  /** @param {import('@prisma/client').PrismaClient} [prisma] */
  constructor(prisma = getPrismaClient()) {
    this.prisma = prisma;
  }

  /**
   * @param {string} storeId
   * @param {string} userId
   */
  async assertStoreOwner(storeId, userId) {
    const biz = await this.prisma.business.findUnique({
      where: { id: storeId },
      select: { userId: true },
    });
    if (!biz || biz.userId !== userId) {
      const err = new Error('Not allowed for this store');
      err.status = 403;
      err.code = 'forbidden';
      throw err;
    }
  }

  /**
   * @param {string} storeId
   * @param {{ type?: string; source?: string; q?: string; limit?: number; offset?: number }} [filters]
   */
  async listAssets(storeId, filters = {}) {
    const rows = await this.prisma.contentLibraryAsset.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
    });
    let assets = rows.map(mapAssetRow);
    if (filters.type) {
      assets = assets.filter((a) => a.type === filters.type);
    }
    if (filters.source) {
      assets = assets.filter((a) => a.source === filters.source);
    }
    if (filters.q) {
      const q = filters.q.toLowerCase();
      assets = assets.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    const offset = filters.offset || 0;
    const limit = filters.limit || 100;
    return assets.slice(offset, offset + limit);
  }

  /** @param {string} storeId */
  async getLibrarySummary(storeId) {
    const [assets, collections] = await Promise.all([
      this.listAssets(storeId, { limit: 10_000 }),
      this.listCollections(storeId),
    ]);
    return {
      assets,
      collections,
      totalAssets: assets.length,
      totalCollections: collections.length,
      usedStorage: sumAssetStorage(assets),
      maxStorage: DEFAULT_MAX_STORAGE_BYTES,
    };
  }

  /**
   * @param {Express.Multer.File} file
   * @param {Record<string, any>} metadata
   * @param {string} storeId
   * @param {string} userId
   */
  async uploadAsset(file, metadata, storeId, userId) {
    await this.assertStoreOwner(storeId, userId);
    const originalname = file.originalname || 'upload';
    const mimetype = file.mimetype || mimeLookup(originalname) || 'application/octet-stream';
    const type = detectAssetType(mimetype, originalname);
    if (type === 'video' && file.size > VIDEO_UPLOAD_MAX_BYTES) {
      const err = new Error(`Video must be ${VIDEO_UPLOAD_MAX_MB}MB or smaller.`);
      err.status = 400;
      throw err;
    }
    const assetId = randomUUID();
    const ext = path.extname(originalname) || '';
    const safeName = (metadata.name || path.basename(originalname, ext) || 'asset')
      .replace(/[^\w.-]+/g, '_')
      .slice(0, 80);
    const fileName = `${safeName}-${assetId.slice(0, 8)}${ext || '.bin'}`;

    const { url: storageUrl } = await uploadBufferToS3(file.buffer, fileName, mimetype, 'artifacts');
    const normalizedUrl = normalizeMediaUrlForStorage(storageUrl, null);

    let format = ext.replace(/^\./, '') || 'bin';
    if (mimetype.includes('svg')) format = 'svg';
    if (mimetype.includes('webp')) format = 'webp';
    if (mimetype.includes('jpeg') || mimetype.includes('jpg')) format = 'jpg';
    if (mimetype.includes('png')) format = 'png';
    if (mimetype.includes('mp4')) format = 'mp4';
    if (mimetype.includes('mpeg') || mimetype.includes('mp3')) format = 'mp3';
    if (mimetype.includes('pdf')) format = 'pdf';

    const tags = Array.isArray(metadata.tags) ? metadata.tags.map(String) : [];
    const meta = {
      ...metadata,
      mimeType: mimetype,
      fileSize: file.size,
      thumbnailUrl: type === 'image' ? normalizedUrl : metadata.thumbnailUrl ?? null,
      uploadedAt: new Date().toISOString(),
      uploadedBy: userId,
      mediaKind: type,
    };

    const row = await this.prisma.contentLibraryAsset.create({
      data: {
        id: assetId,
        storeId,
        name: safeName.slice(0, 512),
        url: normalizedUrl,
        sourceUrl: normalizedUrl,
        type,
        format,
        source: metadata.source || 'user_uploaded',
        category: metadata.category || null,
        tags,
        license: metadata.license || null,
        metadata: meta,
      },
    });

    return mapAssetRow(row);
  }

  /** @param {string} storeId @param {string} assetId @param {string} userId */
  async deleteAsset(storeId, assetId, userId) {
    await this.assertStoreOwner(storeId, userId);
    const row = await this.prisma.contentLibraryAsset.findFirst({
      where: { id: assetId, storeId },
    });
    if (!row) {
      const err = new Error('Asset not found');
      err.status = 404;
      throw err;
    }
    await this.prisma.contentLibraryAsset.delete({ where: { id: assetId } });
    return { ok: true, id: assetId };
  }

  /** @param {string} storeId */
  async listCollections(storeId) {
    const rows = await this.prisma.contentLibraryCollection.findMany({
      where: { storeId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(mapCollectionRow);
  }

  /** @param {string} storeId @param {Record<string, any>} data @param {string} userId */
  async createCollection(storeId, data, userId) {
    await this.assertStoreOwner(storeId, userId);
    const row = await this.prisma.contentLibraryCollection.create({
      data: {
        id: randomUUID(),
        storeId,
        name: String(data.name || 'Untitled collection').slice(0, 256),
        description: data.description ? String(data.description).slice(0, 2000) : null,
        type: data.type || 'custom',
        assets: Array.isArray(data.assetIds) ? data.assetIds.map(String) : [],
        layout: data.layout || 'grid',
        metadata: data.metadata && typeof data.metadata === 'object' ? data.metadata : {},
        published: data.published === true,
      },
    });
    return mapCollectionRow(row);
  }

  /** @param {string} storeId @param {string} collectionId @param {Record<string, any>} patch @param {string} userId */
  async updateCollection(storeId, collectionId, patch, userId) {
    await this.assertStoreOwner(storeId, userId);
    const existing = await this.prisma.contentLibraryCollection.findFirst({
      where: { id: collectionId, storeId },
    });
    if (!existing) {
      const err = new Error('Collection not found');
      err.status = 404;
      throw err;
    }

    /** @type {Record<string, any>} */
    const data = {};
    if (patch.name != null) data.name = String(patch.name).slice(0, 256);
    if (patch.description != null) data.description = String(patch.description).slice(0, 2000);
    if (patch.type != null) data.type = patch.type;
    if (patch.layout != null) data.layout = patch.layout;
    if (patch.published != null) data.published = patch.published === true;
    if (patch.metadata != null && typeof patch.metadata === 'object') data.metadata = patch.metadata;

    if (Array.isArray(patch.assetIds)) {
      data.assets = patch.assetIds.map(String);
    } else if (Array.isArray(patch.addAssetIds) || Array.isArray(patch.removeAssetIds)) {
      const current = Array.isArray(existing.assets) ? existing.assets.map(String) : [];
      const add = Array.isArray(patch.addAssetIds) ? patch.addAssetIds.map(String) : [];
      const remove = new Set(Array.isArray(patch.removeAssetIds) ? patch.removeAssetIds.map(String) : []);
      const merged = [...current, ...add].filter((id) => !remove.has(id));
      data.assets = [...new Set(merged)];
    }

    const row = await this.prisma.contentLibraryCollection.update({
      where: { id: collectionId },
      data,
    });
    return mapCollectionRow(row);
  }

  /** @param {string} storeId @param {string} collectionId @param {string} userId */
  async deleteCollection(storeId, collectionId, userId) {
    await this.assertStoreOwner(storeId, userId);
    const existing = await this.prisma.contentLibraryCollection.findFirst({
      where: { id: collectionId, storeId },
    });
    if (!existing) {
      const err = new Error('Collection not found');
      err.status = 404;
      throw err;
    }
    await this.prisma.contentLibraryCollection.delete({ where: { id: collectionId } });
    return { ok: true, id: collectionId };
  }

  /**
   * @param {string} storeId
   * @param {string} query
   * @param {Record<string, any>} filters
   */
  async searchAssets(storeId, query, filters = {}) {
    return this.listAssets(storeId, { ...filters, q: query });
  }
}

export const assetService = new AssetService();
export default AssetService;
