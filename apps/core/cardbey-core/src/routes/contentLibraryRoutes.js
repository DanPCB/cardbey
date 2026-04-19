/**
 * Content Library API — logos (SVGRepo + Brandfetch), brand kit lookup, save to library.
 */

import express from 'express';
import path from 'path';
import { lookup as mimeLookup } from 'mime-types';
import { optionalAuth } from '../middleware/auth.js';
import { getPrismaClient } from '../lib/prisma.js';
import { uploadBufferToS3 } from '../lib/s3Client.js';
import { normalizeMediaUrlForStorage } from '../utils/publicUrl.js';
import {
  searchSVGRepo,
  lookupBrandfetch,
  extractDomain,
  looksLikeDomain,
  brandfetchAssetsForDomain,
} from '../services/contentLibraryService.js';

const router = express.Router();
router.use(express.json({ limit: '2mb' }));

const LOGO_CATEGORIES = [
  { id: 'restaurant', label: 'Restaurant & Cafe', icon: '🍽️' },
  { id: 'retail', label: 'Retail & Fashion', icon: '🛍️' },
  { id: 'beauty', label: 'Beauty & Wellness', icon: '💄' },
  { id: 'fitness', label: 'Fitness & Sport', icon: '💪' },
  { id: 'realestate', label: 'Real Estate', icon: '🏠' },
  { id: 'professional', label: 'Professional Services', icon: '💼' },
  { id: 'food', label: 'Food & Beverage', icon: '🥗' },
  { id: 'tech', label: 'Technology', icon: '💻' },
  { id: 'education', label: 'Education', icon: '📚' },
  { id: 'health', label: 'Health & Medical', icon: '🏥' },
];

/**
 * GET /logos/categories — returns Category[] (10 items)
 */
router.get('/logos/categories', (_req, res) => {
  res.json(LOGO_CATEGORIES);
});

/**
 * GET /logos/search
 */
router.get('/logos/search', async (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20));

    const searchTerm = q || 'business logo';
    const svgAssets = await searchSVGRepo(searchTerm, category, limit * page);

    let bfAssets = [];
    const domainCandidate = extractDomain(q || '');
    if (looksLikeDomain(q || '') || (domainCandidate && looksLikeDomain(domainCandidate))) {
      const dom = domainCandidate || extractDomain(q);
      if (dom) {
        bfAssets = await brandfetchAssetsForDomain(dom);
      }
    }

    const seen = new Set();
    const merged = [];
    for (const a of [...bfAssets, ...svgAssets]) {
      const k = `${a.source}|${a.url}`;
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(a);
    }

    const total = merged.length;
    const start = (page - 1) * limit;
    const assets = merged.slice(start, start + limit);

    const source =
      bfAssets.length && svgAssets.length ? 'svgrepo+brandfetch' : bfAssets.length ? 'brandfetch' : 'svgrepo';

    res.json({
      assets,
      total,
      page,
      source,
    });
  } catch (e) {
    console.error('[contentLibrary] logos/search', e);
    res.status(500).json({ error: 'search_failed', message: e?.message || 'Search failed' });
  }
});

/**
 * GET /brandfetch/lookup?domain=
 */
router.get('/brandfetch/lookup', async (req, res) => {
  try {
    const domain = typeof req.query.domain === 'string' ? req.query.domain.trim() : '';
    if (!domain) {
      return res.status(400).json({ error: 'domain_required', message: 'Query param domain is required' });
    }
    const kit = await lookupBrandfetch(domain);
    if (!kit) {
      return res.status(404).json({ error: 'not_found', message: 'Brand not found or Brandfetch unavailable' });
    }
    res.json(kit);
  } catch (e) {
    console.error('[contentLibrary] brandfetch/lookup', e);
    res.status(500).json({ error: 'lookup_failed', message: e?.message || 'Lookup failed' });
  }
});

/**
 * POST /assets/save
 */
router.post('/assets/save', optionalAuth, async (req, res) => {
  const prisma = getPrismaClient();
  try {
    const body = req.body || {};
    const assetUrl = typeof body.assetUrl === 'string' ? body.assetUrl.trim() : '';
    const assetType = typeof body.assetType === 'string' ? body.assetType.trim() : 'logo';
    const name = typeof body.name === 'string' ? body.name.trim() : 'Asset';
    const category = typeof body.category === 'string' ? body.category.trim() : null;
    const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};
    const storeId = typeof body.storeId === 'string' ? body.storeId.trim() : null;

    if (!assetUrl) {
      return res.status(400).json({ error: 'assetUrl_required', message: 'assetUrl is required' });
    }
    if (!/^https?:\/\//i.test(assetUrl)) {
      return res.status(400).json({ error: 'invalid_url', message: 'assetUrl must be an http(s) URL' });
    }

    if (storeId) {
      if (!req.userId) {
        return res.status(401).json({ error: 'unauthorized', message: 'Authentication required to save to a store' });
      }
      const biz = await prisma.business.findUnique({
        where: { id: storeId },
        select: { userId: true },
      });
      if (!biz || biz.userId !== req.userId) {
        return res.status(403).json({ error: 'forbidden', message: 'Not allowed for this store' });
      }
    }

    let r;
    try {
      r = await fetch(assetUrl, {
        headers: { 'User-Agent': 'CardbeyContentLibrary/1.0' },
      });
    } catch (netErr) {
      return res.status(400).json({ error: 'download_failed', message: netErr?.message || 'Download failed' });
    }
    if (!r.ok) {
      return res.status(400).json({ error: 'download_failed', message: `HTTP ${r.status}` });
    }

    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length) {
      return res.status(400).json({ error: 'empty_file', message: 'Downloaded file is empty' });
    }

    let extFromUrl = '';
    try {
      extFromUrl = path.extname(new URL(assetUrl).pathname) || '';
    } catch {
      extFromUrl = '';
    }
    const baseName = (name || 'asset').replace(/[^\w.-]+/g, '_').slice(0, 80);
    const originalName = `${baseName}${extFromUrl || '.bin'}`;

    const ctype = r.headers.get('content-type') || '';
    const mime =
      ctype.split(';')[0].trim() ||
      mimeLookup(originalName) ||
      (assetUrl.toLowerCase().includes('.svg') ? 'image/svg+xml' : 'application/octet-stream');

    const { key, url: storageUrl } = await uploadBufferToS3(buf, originalName, mime);
    const normalizedUrl = normalizeMediaUrlForStorage(storageUrl, null);

    let format = 'png';
    const low = originalName.toLowerCase();
    if (low.endsWith('.svg') || mime.includes('svg')) format = 'svg';
    else if (low.endsWith('.webp') || mime.includes('webp')) format = 'webp';
    else if (low.endsWith('.mp4') || mime.includes('video')) format = 'mp4';

    const type = ['logo', 'icon', 'brand_kit', 'image', 'video'].includes(assetType) ? assetType : 'image';

    const tags = [];
    if (metadata?.tags && Array.isArray(metadata.tags)) tags.push(...metadata.tags.map(String));

    const row = await prisma.contentLibraryAsset.create({
      data: {
        storeId: storeId || null,
        name: name.slice(0, 512),
        url: normalizedUrl,
        sourceUrl: assetUrl,
        type,
        format,
        source: 'cardbey',
        category: category || null,
        tags: tags.length ? tags : [],
        license: typeof metadata.license === 'string' ? metadata.license : null,
        metadata,
      },
    });

    const tagsOut = Array.isArray(row.tags) ? row.tags : [];
    res.status(201).json({
      id: row.id,
      storeId: row.storeId,
      name: row.name,
      url: row.url,
      sourceUrl: row.sourceUrl,
      type: row.type,
      format: row.format,
      source: row.source,
      category: row.category,
      tags: tagsOut,
      license: row.license,
      metadata: row.metadata,
      usageCount: row.usageCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  } catch (e) {
    console.error('[contentLibrary] assets/save', e);
    res.status(500).json({ error: 'save_failed', message: e?.message || 'Save failed' });
  }
});

export default router;
