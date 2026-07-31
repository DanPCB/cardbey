/**
 * Template Runtime Service — authoritative mutation path for template instances.
 */

import { markRuntimeOwnedContext } from '../runtime/performerRuntime/runtimeOwnership.js';
import { recordRuntimeAuthorityPathUsed } from '../runtime/performerRuntime/runtimeAuthorityGuard.js';
import { createTemplateInstanceInternal } from './templateInstanceService.js';
import { getTemplateDetails } from './templateLibraryService.js';
import { isTemplateFeatureEnabled, TEMPLATE_FEATURE_FLAGS } from './templateFeatureFlags.js';

export const TEMPLATE_RUNTIME_ACTIONS = {
  CREATE_CONTENT_FROM_TEMPLATE: 'create_content_from_template',
  APPLY_STORE_WEBSITE_TEMPLATE: 'apply_store_website_template',
  PUBLISH_TEMPLATE_INSTANCE: 'publish_template_instance',
};

/**
 * @param {{ action: string, actor: object, payload?: object, missionId?: string, source?: string, confirmed?: boolean }} params
 */
export async function executeTemplateRuntimeAction(params) {
  const action = String(params.action || '').trim();
  const actor = params.actor || {};
  const payload = params.payload && typeof params.payload === 'object' ? params.payload : {};
  const source = params.source || 'template_runtime';

  markRuntimeOwnedContext({ source, missionId: params.missionId || null });
  recordRuntimeAuthorityPathUsed({
    route: `template_runtime/${action}`,
    toolName: action,
    userId: actor.userId || null,
    missionId: params.missionId || null,
    source,
  });

  switch (action) {
    case TEMPLATE_RUNTIME_ACTIONS.CREATE_CONTENT_FROM_TEMPLATE:
      return createContentFromTemplate({ actor, payload, missionId: params.missionId });

    case TEMPLATE_RUNTIME_ACTIONS.APPLY_STORE_WEBSITE_TEMPLATE:
      return applyStoreWebsiteTemplate({ actor, payload, confirmed: params.confirmed });

    default:
      return { ok: false, error: 'unknown_action', action };
  }
}

async function createContentFromTemplate({ actor, payload, missionId }) {
  if (!isTemplateFeatureEnabled(TEMPLATE_FEATURE_FLAGS.ENABLE_TEMPLATE_LIBRARY)) {
    return { ok: false, error: 'feature_disabled' };
  }
  if (!payload.templateId) return { ok: false, error: 'template_id_required' };

  return createTemplateInstanceInternal({
    actor,
    templateId: payload.templateId,
    versionId: payload.versionId,
    name: payload.name,
    ownerType: payload.ownerType,
    ownerId: payload.ownerId,
    storeId: payload.storeId,
    selectedVariant: payload.selectedVariant,
    locale: payload.locale,
    sourceMissionId: missionId || payload.sourceMissionId,
    idempotencyKey: payload.idempotencyKey,
    dataOverrides: payload.dataOverrides,
    allowWithoutStore: payload.allowWithoutStore === true,
  });
}

/**
 * Apply a STORE_WEBSITE ContentTemplate as the layout base for the current mission/store.
 * Creates a TemplateInstance (layout + theme + section slots only). Does not publish live.
 */
async function applyStoreWebsiteTemplate({ actor, payload, confirmed }) {
  if (!isTemplateFeatureEnabled(TEMPLATE_FEATURE_FLAGS.ENABLE_TEMPLATE_WEBSITE_LAYOUTS)) {
    return { ok: false, error: 'feature_disabled' };
  }
  if (!confirmed) {
    return {
      ok: false,
      error: 'confirmation_required',
      proposedAction: 'apply_store_website_template',
      message: 'Applying a website template requires confirmation',
    };
  }

  const templateId = payload.templateId;
  if (!templateId) return { ok: false, error: 'template_id_required' };

  const details = await getTemplateDetails({ actor, templateId });
  if (!details.ok) return details;

  const template = details.template;
  if (String(template.contentType || '').toUpperCase() !== 'STORE_WEBSITE') {
    return {
      ok: false,
      error: 'invalid_content_type',
      message: 'Only STORE_WEBSITE templates can be applied here',
    };
  }
  if (String(template.status || '').toUpperCase() !== 'PUBLISHED') {
    return { ok: false, error: 'template_not_published' };
  }

  const version = details.currentVersion;
  const storeId = payload.storeId || null;
  const sourceMissionId = payload.sourceMissionId || payload.missionId || null;
  const draftId = payload.draftId || null;

  const created = await createTemplateInstanceInternal({
    actor,
    templateId,
    versionId: payload.versionId,
    name: payload.name || template.name,
    ownerType: storeId ? 'STORE' : sourceMissionId ? 'MISSION' : 'USER',
    ownerId: storeId || sourceMissionId || actor.userId,
    storeId,
    selectedVariant: payload.selectedVariant,
    locale: payload.locale,
    sourceMissionId,
    idempotencyKey: payload.idempotencyKey,
    dataOverrides: {
      ...(payload.dataOverrides && typeof payload.dataOverrides === 'object' ? payload.dataOverrides : {}),
      ...(draftId ? { draftId } : {}),
      websiteTemplateId: templateId,
    },
    allowWithoutStore: true,
  });

  if (!created.ok) return created;

  return {
    ok: true,
    instance: created.instance,
    deduplicated: created.deduplicated === true,
    applied: {
      templateId: template.id,
      name: template.name,
      slug: template.slug,
      contentType: template.contentType,
      industry: template.industry || null,
      category: template.industry || template.useCase || null,
      thumbnailUrl: template.thumbnailUrl || null,
      tags: template.tags || [],
      themeDefinition: version?.themeDefinition || null,
      layoutDefinition: version?.layoutDefinition || null,
      draftId,
      sourceMissionId,
      storeId,
    },
  };
}
