/**
 * Import Cardbey Originals from an explicit approved manifest.
 * Never scans arbitrary repository files. Fail closed on missing source/rights.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  ASSET_PROVIDER,
  ASSET_STATUS,
  RIGHTS_STATUS,
  ENTITY_KIND,
} from './universalAssetTypes.js';
import { createUniversalAsset, publishUniversalAsset } from './universalAssetService.js';
import { CATALOGUE_QUALITY, CONTENT_ORIGIN } from './contentOrigin.js';
import { upsertTaxonomyEntity } from './taxonomyService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MANIFEST = path.join(__dirname, 'cardbey-originals.manifest.json');
const CORE_PUBLIC = path.resolve(__dirname, '../../../public');
/** apps/core/cardbey-core → apps/dashboard/cardbey-marketing-dashboard/public */
const DASH_PUBLIC = path.resolve(
  __dirname,
  '../../../../../dashboard/cardbey-marketing-dashboard/public',
);

/**
 * @param {string} [manifestPath]
 */
export function loadOriginalsManifest(manifestPath = DEFAULT_MANIFEST) {
  const raw = fs.readFileSync(manifestPath, 'utf8');
  return JSON.parse(raw);
}

/**
 * Resolve a manifest public path against known public roots.
 * @param {string} rel
 */
export function resolveOriginalsSourcePath(rel) {
  const clean = String(rel || '').replace(/^\//, '');
  if (!clean || clean.startsWith('cardbey://')) return { ok: true, virtual: true, path: clean };
  const candidates = [path.join(CORE_PUBLIC, clean), path.join(DASH_PUBLIC, clean)];
  for (const abs of candidates) {
    if (fs.existsSync(abs) && fs.statSync(abs).isFile() && fs.statSync(abs).size > 0) {
      return { ok: true, virtual: false, path: abs };
    }
  }
  return { ok: false, error: 'source_file_missing', path: clean };
}

function fileChecksum(absPath) {
  return crypto.createHash('sha256').update(fs.readFileSync(absPath)).digest('hex');
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} [options]
 */
export async function importCardbeyOriginals(prisma, options = {}) {
  const manifest = options.manifest || loadOriginalsManifest(options.manifestPath);
  const rights = manifest.rightsDefault || {};
  const skipExisting = options.skipExisting !== false;
  const results = [];
  const previewChecksums = new Set();
  const sourceChecksums = new Set();

  for (const item of manifest.items || []) {
    const rightsRecordId = item.rightsRecordId || rights.rightsRecordId;
    if (!rightsRecordId && !rights.license) {
      results.push({ id: item.id, created: false, error: 'rights_record_missing' });
      continue;
    }
    if (!item.sourceFile) {
      results.push({ id: item.id, created: false, error: 'source_file_missing' });
      continue;
    }

    const resolved = resolveOriginalsSourcePath(item.sourceFile);
    if (!resolved.ok) {
      results.push({ id: item.id, created: false, error: resolved.error, sourceFile: item.sourceFile });
      continue;
    }

    let sourceChecksum = item.sourceChecksum || null;
    if (!resolved.virtual) {
      sourceChecksum = fileChecksum(resolved.path);
      if (item.sourceChecksum && item.sourceChecksum !== sourceChecksum) {
        results.push({
          id: item.id,
          created: false,
          error: 'source_checksum_mismatch',
          expected: item.sourceChecksum,
          actual: sourceChecksum,
        });
        continue;
      }
      if (sourceChecksums.has(sourceChecksum)) {
        results.push({ id: item.id, skipped: true, reason: 'duplicate_source_checksum' });
        continue;
      }
      sourceChecksums.add(sourceChecksum);
    }

    const previewRel = item.preview || item.sourceFile;
    const previewResolved = resolveOriginalsSourcePath(previewRel);
    let previewChecksum = item.previewChecksum || null;
    if (previewResolved.ok && !previewResolved.virtual) {
      previewChecksum = fileChecksum(previewResolved.path);
      if (previewChecksums.has(previewChecksum) && options.allowSharedPreview !== true) {
        // Videos may share a still; only block when source is also an image/template with same preview+source
        if (item.assetType !== 'video' && item.assetType !== 'animation') {
          results.push({ id: item.id, skipped: true, reason: 'duplicate_preview_checksum' });
          continue;
        }
      }
      previewChecksums.add(previewChecksum);
    }

    if (item.skipIfDuplicatePreview) {
      results.push({ id: item.id, skipped: true, reason: 'skipIfDuplicatePreview' });
      continue;
    }

    const byManifest = await prisma.universalAsset.findMany({
      where: { provider: ASSET_PROVIDER.CARDBEY_INTERNAL },
      take: 2000,
    });
    const matched = byManifest.find((a) => {
      const m = a.metadata && typeof a.metadata === 'object' ? a.metadata : {};
      return m.manifestId === item.id || m.originalsId === item.id;
    });

    const metaBase = {
      contentOrigin: CONTENT_ORIGIN.REAL_FIRST_PARTY,
      catalogueQualityStatus: CATALOGUE_QUALITY.APPROVED,
      manifestId: item.id,
      originalsId: item.id,
      source: 'cardbey.originals',
      sourceFile: item.sourceFile,
      sourceChecksum,
      previewChecksum,
      rightsRecordId,
      contentOriginNote: item.contentOriginNote || null,
      qualityStatus: item.qualityStatus || 'APPROVED',
      approvedBy: item.approvedBy || 'library-editorial',
      approvedAt: item.approvedAt || new Date().toISOString().slice(0, 10),
      verifiedType: rights.verifiedType || 'FIRST_PARTY_VERIFIED',
      provenance: {
        source: 'cardbey.originals',
        manifestId: item.id,
        importedAt: new Date().toISOString(),
        rightsRecordId,
      },
      industry: item.industry,
      useCases: item.useCases || [],
      intendedUse: item.intendedUse,
      premium: false,
      openLicense: true,
      creatorLabel: rights.creatorLabel || 'Cardbey Originals',
      creatorVerified: true,
      aiGenerated: Boolean(item.contentOriginNote === 'AI_GENERATED_FIRST_PARTY'),
      views: 0,
      downloads: 0,
      rating: null,
      syntheticEngagement: false,
      collections: ['cardbey-originals'],
    };

    if (matched && skipExisting) {
      const prev = matched.metadata && typeof matched.metadata === 'object' ? matched.metadata : {};
      await prisma.universalAsset.update({
        where: { id: matched.id },
        data: {
          thumbnail: item.preview || matched.thumbnail,
          preview: item.preview || matched.preview,
          description: item.description || matched.description,
          categories: item.categories || matched.categories,
          tags: item.tags || matched.tags,
          creatorId: rights.creatorId || 'cardbey_originals',
          rightsStatus: RIGHTS_STATUS.CLEARED,
          license: rights.license || 'cardbey-internal',
          metadata: {
            ...prev,
            ...metaBase,
            collections: [
              'cardbey-originals',
              ...(Array.isArray(prev.collections)
                ? prev.collections.filter((c) => c !== 'cardbey-originals')
                : []),
            ],
          },
        },
      });
      if (matched.status !== ASSET_STATUS.PUBLISHED) {
        await publishUniversalAsset(prisma, matched.id);
      }
      results.push({ id: item.id, skipped: true, upgraded: true, assetId: matched.id });
      continue;
    }

    if (matched && !skipExisting) {
      results.push({ id: item.id, skipped: true, reason: 'exists', assetId: matched.id });
      continue;
    }

    const created = await createUniversalAsset(prisma, {
      title: item.title,
      description: item.description,
      type: item.assetType,
      provider: ASSET_PROVIDER.CARDBEY_INTERNAL,
      categories: item.categories,
      tags: item.tags,
      license: rights.license || 'cardbey-internal',
      thumbnail: item.preview,
      preview: item.preview,
      ownerId: rights.ownerId || 'cardbey_platform',
      creatorId: rights.creatorId || 'cardbey_originals',
      rightsStatus: RIGHTS_STATUS.CLEARED,
      hostingMode: rights.hostingMode || 'HOSTED',
      status: ASSET_STATUS.NORMALIZED,
      qualityScore: 85,
      metadata: metaBase,
    });

    if (!created.ok) {
      results.push({ id: item.id, created: false, error: created.error });
      continue;
    }

    const pub = await publishUniversalAsset(prisma, created.asset.id);
    results.push({
      id: item.id,
      created: true,
      assetId: created.asset.id,
      published: Boolean(pub.ok),
      error: pub.error,
    });
  }

  await upsertTaxonomyEntity(prisma, {
    kind: ENTITY_KIND.COLLECTION,
    name: 'Cardbey Originals',
    slug: 'cardbey-originals',
    metadata: {
      description: 'First-party Cardbey internal catalogue — real owned media only.',
      collectionType: 'CARDBEY_ORIGINALS',
      dimension: 'collection',
    },
  });

  const assetIds = results.map((r) => r.assetId).filter(Boolean);
  const entity = await prisma.universalEntity.findUnique({
    where: { kind_slug: { kind: ENTITY_KIND.COLLECTION, slug: 'cardbey-originals' } },
  });
  if (entity) {
    const prev = entity.metadata && typeof entity.metadata === 'object' ? entity.metadata : {};
    await prisma.universalEntity.update({
      where: { id: entity.id },
      data: {
        metadata: {
          ...prev,
          assetIds,
          assetCount: assetIds.length,
          collectionType: 'CARDBEY_ORIGINALS',
        },
      },
    });
  }

  const failed = results.filter((r) => r.error && !r.created && !r.upgraded && !r.skipped);
  const published = results.filter((r) => r.created || r.upgraded).length;
  return {
    ok: failed.length === 0,
    source: 'cardbey.originals',
    manifestVersion: manifest.version,
    results,
    importedOrUpgraded: published,
    catalogRealCount: assetIds.length,
    failed: failed.length,
  };
}
