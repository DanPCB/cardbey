/**
 * Template Instance service — create/read used by apply_store_website_template.
 */

import { prisma } from '../prisma.js';
import {
  mapInstanceRecord,
  mapTemplateRecord,
  mapVersionRecord,
  loadStoreBindingContext,
  parseJsonArray,
} from './templateLibraryHelpers.js';
import { getTemplateDetails } from './templateLibraryService.js';

function modelAvailable() {
  return Boolean(prisma.templateInstance && prisma.contentTemplate);
}

export async function getTemplateInstance({ actor, instanceId }) {
  if (!modelAvailable()) return { ok: false, error: 'model_not_available' };

  const instance = await prisma.templateInstance.findUnique({
    where: { id: instanceId },
    include: {
      template: { include: { library: true } },
      templateVersion: true,
    },
  });

  if (!instance) return { ok: false, error: 'not_found' };
  if (actor?.userId && instance.createdBy && instance.createdBy !== actor.userId) {
    // Soft allow for platform admins; otherwise require ownership
    if (actor.role !== 'admin' && actor.role !== 'platform_admin') {
      return { ok: false, error: 'forbidden' };
    }
  }

  return {
    ok: true,
    instance: {
      ...mapInstanceRecord(instance),
      template: instance.template ? mapTemplateRecord(instance.template, instance.template.library) : null,
      templateVersion: mapVersionRecord(instance.templateVersion),
    },
  };
}

export async function createTemplateInstanceInternal({
  actor,
  templateId,
  versionId,
  name,
  ownerType,
  ownerId,
  storeId,
  selectedVariant,
  locale = 'en',
  sourceMissionId,
  idempotencyKey,
  dataOverrides = {},
  allowWithoutStore = false,
}) {
  if (!modelAvailable()) return { ok: false, error: 'model_not_available' };

  if (idempotencyKey) {
    const existing = await prisma.templateInstance.findUnique({ where: { idempotencyKey } });
    if (existing) return { ok: true, instance: mapInstanceRecord(existing), deduplicated: true };
  }

  const details = await getTemplateDetails({ actor, templateId });
  if (!details.ok) return details;

  const template = details.template;
  const version = versionId
    ? await prisma.contentTemplateVersion.findFirst({ where: { id: versionId, templateId } })
    : details.currentVersion
      ? await prisma.contentTemplateVersion.findUnique({ where: { id: details.currentVersion.id } })
      : null;

  if (!version) return { ok: false, error: 'version_not_found' };

  const requiresStore = String(template.contentType || '').toUpperCase().startsWith('STORE_');
  if (requiresStore && !storeId && !allowWithoutStore) {
    return { ok: false, error: 'store_required', message: 'This content type requires a store' };
  }

  const storeContext = storeId ? await loadStoreBindingContext(storeId) : {};
  const defaultData =
    version.defaultData && typeof version.defaultData === 'object' ? version.defaultData : {};

  const instanceName = name || `${template.name} — ${new Date().toISOString().slice(0, 10)}`;
  const variants = parseJsonArray(version.supportedVariants);
  const variant = selectedVariant || variants[0] || null;

  const instance = await prisma.templateInstance.create({
    data: {
      templateId,
      templateVersionId: version.id,
      ownerType: ownerType || 'USER',
      ownerId: ownerId || actor.userId,
      storeId: storeId || null,
      name: instanceName,
      contentType: template.contentType,
      status: 'DRAFT',
      data: { ...defaultData, ...storeContext, ...dataOverrides },
      selectedVariant: variant,
      locale,
      sourceMissionId: sourceMissionId || null,
      idempotencyKey: idempotencyKey || null,
      createdBy: actor.userId,
    },
  });

  await prisma.contentTemplate.update({
    where: { id: templateId },
    data: { usageCount: { increment: 1 } },
  });

  return { ok: true, instance: mapInstanceRecord(instance) };
}
