/**
 * Allowlisted capability adapters — draft-only mutations, no arbitrary code.
 */

import { ALLOWED_ADAPTERS, isAllowedAdapter } from './capabilityTypes.js';

/**
 * @param {string} adapterKey
 * @param {object} ctx
 */
export async function runAdapter(adapterKey, ctx) {
  if (!isAllowedAdapter(adapterKey)) {
    return { ok: false, error: 'unknown_adapter', adapterKey };
  }
  const fn = ADAPTERS[adapterKey];
  return fn(ctx);
}

const ADAPTERS = {
  async [ALLOWED_ADAPTERS.REQUEST_USER_CONFIRMATION]() {
    return { ok: true, noop: true, note: 'confirmation_gate' };
  },

  async [ALLOWED_ADAPTERS.ATTACH_LIBRARY_ASSETS](ctx) {
    const { prisma, target, step, inputs } = ctx;
    if (!target) return { ok: false, error: 'target_required' };
    const assetIds = step.inputMapping?.assetIds || step.config?.assetIds || [];
    const prevInput = target.input && typeof target.input === 'object' ? target.input : {};
    const nextInput = {
      ...prevInput,
      capabilityAttachments: [
        ...(Array.isArray(prevInput.capabilityAttachments) ? prevInput.capabilityAttachments : []),
        {
          capabilityInstallationId: ctx.installationId,
          assetIds,
          attachedAt: new Date().toISOString(),
          businessName: inputs.businessName || null,
        },
      ],
    };
    const updated = await prisma.draftStore.update({
      where: { id: target.id },
      data: { input: nextInput },
    });
    return {
      ok: true,
      created: [],
      changed: [{ type: 'DraftStore', id: updated.id, field: 'input.capabilityAttachments' }],
      artifact: { assetIds },
    };
  },

  async [ALLOWED_ADAPTERS.APPLY_STOREFRONT_TEMPLATE_DRAFT](ctx) {
    const { prisma, target, step, inputs } = ctx;
    if (!target) return { ok: false, error: 'target_required' };
    const templateKey = step.config?.templateKey || 'restaurant-cafe';
    const prevInput = target.input && typeof target.input === 'object' ? target.input : {};
    const prevPreview = target.preview && typeof target.preview === 'object' ? target.preview : {};
    const nextInput = {
      ...prevInput,
      templateId: templateKey,
      businessType: inputs.serviceCategory || prevInput.businessType || 'cafe',
      capabilityTemplateApplied: {
        installationId: ctx.installationId,
        templateKey,
        at: new Date().toISOString(),
      },
    };
    const nextPreview = {
      ...prevPreview,
      storeName: inputs.businessName || prevPreview.storeName || 'Café',
      slogan: prevPreview.slogan || 'Fresh daily',
      capabilityDraft: true,
      publishBlocked: true,
    };
    const updated = await prisma.draftStore.update({
      where: { id: target.id },
      data: { input: nextInput, preview: nextPreview, status: 'draft' },
    });
    return {
      ok: true,
      created: [],
      changed: [
        { type: 'DraftStore', id: updated.id, field: 'input.templateId' },
        { type: 'DraftStore', id: updated.id, field: 'preview' },
      ],
      irreversible: false,
      note: 'Draft only — store not published',
    };
  },

  async [ALLOWED_ADAPTERS.CREATE_MENU_STRUCTURE_DRAFT](ctx) {
    const { prisma, target, inputs } = ctx;
    if (!target) return { ok: false, error: 'target_required' };
    const prevPreview = target.preview && typeof target.preview === 'object' ? target.preview : {};
    const categories = [
      { id: 'cat-drinks', name: 'Drinks', items: [{ name: 'Espresso', placeholder: true }] },
      { id: 'cat-pastries', name: 'Pastries', items: [{ name: 'Croissant', placeholder: true }] },
      { id: 'cat-mains', name: 'Light bites', items: [{ name: 'Seasonal special', placeholder: true }] },
    ];
    const nextPreview = {
      ...prevPreview,
      storeName: inputs.businessName || prevPreview.storeName,
      categories,
      items: categories.flatMap((c) =>
        c.items.map((it) => ({ ...it, categoryId: c.id, price: null, placeholder: true })),
      ),
      capabilityMenuDraft: { installationId: ctx.installationId, at: new Date().toISOString() },
      publishBlocked: true,
    };
    const updated = await prisma.draftStore.update({
      where: { id: target.id },
      data: { preview: nextPreview, status: 'draft' },
    });
    return {
      ok: true,
      created: [],
      changed: [{ type: 'DraftStore', id: updated.id, field: 'preview.categories' }],
      note: 'Placeholder menu only — no prices or fake products claimed as real',
    };
  },

  async [ALLOWED_ADAPTERS.CREATE_PROMOTION_DRAFT](ctx) {
    const { prisma, target, inputs, installationId } = ctx;
    if (!target) return { ok: false, error: 'target_required' };
    const prevInput = target.input && typeof target.input === 'object' ? target.input : {};
    const draft = {
      id: `promo-draft-${installationId.slice(-8)}`,
      title: `${inputs.businessName || 'Café'} launch offer`,
      status: 'DRAFT',
      published: false,
      channels: [],
      installationId,
      createdAt: new Date().toISOString(),
      note: 'Promotion draft artifact — not launched',
    };
    const nextInput = {
      ...prevInput,
      capabilityPromotionDrafts: [
        ...(Array.isArray(prevInput.capabilityPromotionDrafts)
          ? prevInput.capabilityPromotionDrafts
          : []),
        draft,
      ],
    };
    await prisma.draftStore.update({
      where: { id: target.id },
      data: { input: nextInput },
    });
    return {
      ok: true,
      created: [{ type: 'PromotionDraftArtifact', id: draft.id }],
      changed: [{ type: 'DraftStore', id: target.id, field: 'input.capabilityPromotionDrafts' }],
      artifact: draft,
    };
  },

  async [ALLOWED_ADAPTERS.CREATE_DISPLAY_PLAYLIST_DRAFT](ctx) {
    const { prisma, target, inputs, installationId } = ctx;
    if (!target) return { ok: false, error: 'target_required' };
    const playlist = await prisma.playlist.create({
      data: {
        type: 'PROMO',
        name: `${inputs.businessName || 'Café'} launch playlist (draft)`,
        description: `Capability draft playlist. installationId=${installationId}. Not published to devices.`,
        storeId: target.committedStoreId || null,
        tenantId: target.ownerUserId || null,
        active: false,
      },
    });
    return {
      ok: true,
      created: [{ type: 'Playlist', id: playlist.id }],
      changed: [],
      artifact: { playlistId: playlist.id, active: false },
      note: 'Inactive playlist — not pushed to screens',
    };
  },
};

export function describeAdapterPlan(adapterKey, step, inputs) {
  const base = {
    adapterKey,
    stepId: step.id,
    name: step.name,
    description: step.description,
    failurePolicy: step.failurePolicy || 'STOP',
    rollbackPolicy: step.rollbackPolicy || 'ROLLBACK_STEP',
  };
  switch (adapterKey) {
    case ALLOWED_ADAPTERS.ATTACH_LIBRARY_ASSETS:
      return {
        ...base,
        willCreate: [],
        willChange: ['DraftStore.input.capabilityAttachments'],
        irreversible: false,
        rollbackAvailable: true,
      };
    case ALLOWED_ADAPTERS.APPLY_STOREFRONT_TEMPLATE_DRAFT:
      return {
        ...base,
        willCreate: [],
        willChange: ['DraftStore.input.templateId', 'DraftStore.preview (draft)'],
        irreversible: false,
        rollbackAvailable: true,
        note: 'Does not publish store',
      };
    case ALLOWED_ADAPTERS.CREATE_MENU_STRUCTURE_DRAFT:
      return {
        ...base,
        willCreate: [],
        willChange: ['DraftStore.preview.categories (placeholders)'],
        irreversible: false,
        rollbackAvailable: true,
      };
    case ALLOWED_ADAPTERS.CREATE_PROMOTION_DRAFT:
      return {
        ...base,
        willCreate: ['Promotion draft artifact (not launched)'],
        willChange: ['DraftStore.input.capabilityPromotionDrafts'],
        irreversible: false,
        rollbackAvailable: true,
      };
    case ALLOWED_ADAPTERS.CREATE_DISPLAY_PLAYLIST_DRAFT:
      return {
        ...base,
        willCreate: ['Inactive Playlist'],
        willChange: [],
        irreversible: false,
        rollbackAvailable: true,
        note: 'Playlist active=false; no device push',
      };
    case ALLOWED_ADAPTERS.REQUEST_USER_CONFIRMATION:
      return {
        ...base,
        willCreate: [],
        willChange: [],
        irreversible: false,
        rollbackAvailable: true,
        note: 'Confirmation gate only',
      };
    default:
      return { ...base, willCreate: [], willChange: [], irreversible: true, rollbackAvailable: false };
  }
}
