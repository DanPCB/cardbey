/**
 * Template Library query and search service (read-only).
 */

import { prisma } from '../prisma.js';
import {
  mapLibraryRecord,
  mapTemplateRecord,
  mapVersionRecord,
  parseJsonArray,
} from './templateLibraryHelpers.js';
import { isTemplateFeatureEnabled, TEMPLATE_FEATURE_FLAGS } from './templateFeatureFlags.js';

function modelAvailable() {
  return Boolean(prisma.templateLibrary && prisma.contentTemplate);
}

function canViewPublic(actor, tpl) {
  const visibility = String(tpl.visibility || 'PUBLIC').toUpperCase();
  if (visibility === 'PUBLIC' || visibility === 'UNLISTED') return true;
  if (!actor?.userId) return false;
  return true;
}

export async function listTemplateLibraries({ actor, filters = {} }) {
  if (!modelAvailable()) return { ok: false, error: 'model_not_available' };
  if (!isTemplateFeatureEnabled(TEMPLATE_FEATURE_FLAGS.ENABLE_TEMPLATE_LIBRARY)) {
    return { ok: false, error: 'feature_disabled' };
  }

  const where = { status: filters.status || 'ACTIVE' };
  if (filters.ownerType) where.ownerType = filters.ownerType;
  if (filters.category) where.category = filters.category;

  const libraries = await prisma.templateLibrary.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    take: filters.limit || 50,
    skip: filters.offset || 0,
  });

  return { ok: true, libraries: libraries.map(mapLibraryRecord) };
}

export async function searchTemplates({ actor, query = {} }) {
  if (!modelAvailable()) return { ok: false, error: 'model_not_available' };
  if (!isTemplateFeatureEnabled(TEMPLATE_FEATURE_FLAGS.ENABLE_TEMPLATE_LIBRARY)) {
    return { ok: false, error: 'feature_disabled' };
  }

  const where = { status: 'PUBLISHED' };
  if (query.contentType) where.contentType = String(query.contentType).toUpperCase();
  if (query.industry) where.industry = query.industry;
  if (query.useCase) where.useCase = query.useCase;

  const templates = await prisma.contentTemplate.findMany({
    where,
    include: { library: true },
    orderBy: query.sort === 'recent' ? { createdAt: 'desc' } : { usageCount: 'desc' },
    take: Math.min(query.limit || 24, 100),
    skip: query.offset || 0,
  });

  let filtered = templates
    .map((t) => mapTemplateRecord(t, t.library))
    .filter((t) => canViewPublic(actor, t));

  if (query.keyword) {
    const kw = String(query.keyword).toLowerCase();
    filtered = filtered.filter(
      (t) =>
        t.name?.toLowerCase().includes(kw) ||
        t.description?.toLowerCase().includes(kw) ||
        parseJsonArray(t.tags).some((tag) => String(tag).toLowerCase().includes(kw)),
    );
  }

  if (query.channel) {
    filtered = filtered.filter((t) => parseJsonArray(t.supportedChannels).includes(query.channel));
  }

  return { ok: true, templates: filtered, total: filtered.length };
}

export async function getTemplateDetails({ actor, templateId }) {
  if (!modelAvailable()) return { ok: false, error: 'model_not_available' };

  const template = await prisma.contentTemplate.findUnique({
    where: { id: templateId },
    include: {
      library: true,
      versions: { orderBy: { versionNumber: 'desc' }, take: 5 },
    },
  });

  if (!template) return { ok: false, error: 'not_found' };
  const mapped = mapTemplateRecord(template, template.library);
  if (!canViewPublic(actor, mapped)) return { ok: false, error: 'forbidden' };

  let currentVersion = null;
  if (template.currentVersionId) {
    currentVersion = await prisma.contentTemplateVersion.findUnique({
      where: { id: template.currentVersionId },
    });
  } else if (template.versions?.[0]) {
    currentVersion = template.versions[0];
  }

  return {
    ok: true,
    template: mapped,
    currentVersion: mapVersionRecord(currentVersion),
    versions: (template.versions || []).map(mapVersionRecord),
  };
}

export async function getTemplateVersion({ actor, templateId, versionId }) {
  const details = await getTemplateDetails({ actor, templateId });
  if (!details.ok) return details;

  const version = await prisma.contentTemplateVersion.findFirst({
    where: { id: versionId, templateId },
  });
  if (!version) return { ok: false, error: 'version_not_found' };

  return { ok: true, template: details.template, version: mapVersionRecord(version) };
}

export async function previewTemplate({ actor, templateId, versionId, storeId }) {
  const { loadStoreBindingContext } = await import('./templateLibraryHelpers.js');

  const versionResult = versionId
    ? await getTemplateVersion({ actor, templateId, versionId })
    : await getTemplateDetails({ actor, templateId });

  if (!versionResult.ok) return versionResult;

  const version = versionResult.version || versionResult.currentVersion;
  if (!version) return { ok: false, error: 'no_version' };

  const storeContext = storeId ? await loadStoreBindingContext(storeId) : {};

  return {
    ok: true,
    template: versionResult.template,
    version,
    preview: {
      definition: version.definition,
      defaultData: version.defaultData,
      bindingContext: storeContext,
      thumbnailUrl: versionResult.template.thumbnailUrl,
      previewUrls: parseJsonArray(versionResult.template.previewUrls),
    },
  };
}
