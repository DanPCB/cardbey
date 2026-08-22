/**
 * Phase 3 — allowlisted draft destination adapters.
 * Never publishes to live stores/campaigns/devices.
 */

import {
  DESTINATION_ADAPTER,
  DESTINATION_ADAPTERS_PHASE3,
} from './types.js';

export function listDestinationAdapters() {
  return DESTINATION_ADAPTERS_PHASE3.map((key) => ({
    key,
    draftOnly: true,
    publishes: false,
    description: describe(key),
  }));
}

function describe(key) {
  switch (key) {
    case DESTINATION_ADAPTER.DISPLAY_PLAYLIST_DRAFT:
      return 'Inactive display playlist draft';
    case DESTINATION_ADAPTER.PROMOTION_DRAFT:
      return 'Promotion draft artifact (not launched)';
    case DESTINATION_ADAPTER.STOREFRONT_HERO_DRAFT:
      return 'Storefront hero draft patch (not published)';
    case DESTINATION_ADAPTER.SOCIAL_CONTENT_DRAFT:
      return 'Social content draft payload (not scheduled)';
    case DESTINATION_ADAPTER.SUITCASE_REFERENCE_COLLECTION:
      return 'Suitcase reference collection item (private)';
    default:
      return key;
  }
}

export function isDestinationAllowed(key) {
  return DESTINATION_ADAPTERS_PHASE3.includes(key);
}

/**
 * Materialize one allowlisted draft destination for a resource.
 */
export async function materializeDestination(prisma, destination, ctx) {
  if (!isDestinationAllowed(destination)) {
    return { ok: false, error: 'destination_not_allowlisted', destination };
  }

  switch (destination) {
    case DESTINATION_ADAPTER.DISPLAY_PLAYLIST_DRAFT:
      return materializePlaylistDraft(prisma, ctx);
    case DESTINATION_ADAPTER.PROMOTION_DRAFT:
      return materializePromotionDraft(prisma, ctx);
    case DESTINATION_ADAPTER.STOREFRONT_HERO_DRAFT:
      return materializeHeroDraft(prisma, ctx);
    case DESTINATION_ADAPTER.SOCIAL_CONTENT_DRAFT:
      return materializeSocialDraft(prisma, ctx);
    case DESTINATION_ADAPTER.SUITCASE_REFERENCE_COLLECTION:
      return materializeSuitcaseReference(prisma, ctx);
    default:
      return { ok: false, error: 'destination_unimplemented', destination };
  }
}

async function materializePlaylistDraft(prisma, ctx) {
  const name =
    ctx.playlistName ||
    `URI workspace playlist — ${ctx.resource.title || 'resource'}`.slice(0, 120);
  const playlist = await prisma.playlist.create({
    data: {
      type: 'PROMO',
      name,
      description: JSON.stringify({
        uriPhase: 3,
        resourceId: ctx.resource.id,
        custodyMode: ctx.custodyMode,
        published: false,
      }),
      tenantId: ctx.tenantId || 'uri-pilot',
      storeId: ctx.storeId || 'uri-pilot-draft',
      active: false,
    },
  });

  let signageAssetId = null;
  const url = ctx.resource.previewUrl || ctx.resource.canonicalUrl;
  if (url && prisma.signageAsset) {
    try {
      const asset = await prisma.signageAsset.create({
        data: {
          tenantId: ctx.tenantId || 'uri-pilot',
          storeId: ctx.storeId || 'uri-pilot-draft',
          type: String(ctx.resource.mediaType || '').includes('image') ? 'image' : 'video',
          url,
          durationS: 15,
          tags: `URI: ${ctx.resource.title || ctx.resource.id}`,
        },
      });
      signageAssetId = asset.id;
      await prisma.playlistItem.create({
        data: {
          playlistId: playlist.id,
          orderIndex: 0,
          durationS: 15,
          assetId: asset.id,
          loop: true,
          muted: true,
        },
      });
    } catch (e) {
      console.warn('[URI] playlist asset skipped:', e?.message || e);
    }
  }

  return {
    ok: true,
    destination: DESTINATION_ADAPTER.DISPLAY_PLAYLIST_DRAFT,
    draftOnly: true,
    published: false,
    playlistId: playlist.id,
    signageAssetId,
    targetId: playlist.id,
    targetType: DESTINATION_ADAPTER.DISPLAY_PLAYLIST_DRAFT,
  };
}

async function materializePromotionDraft(prisma, ctx) {
  const draftId = `uri-promo-${Date.now().toString(36)}`;
  const artifact = {
    id: draftId,
    title: `URI promo draft — ${ctx.resource.title || 'resource'}`,
    status: 'DRAFT',
    published: false,
    channels: [],
    resourceId: ctx.resource.id,
    previewUrl: ctx.resource.previewUrl || null,
    custodyMode: ctx.custodyMode,
    createdAt: new Date().toISOString(),
    note: 'URI Phase 3 promotion draft — not launched',
  };

  let draftStoreId = ctx.draftStoreId || null;
  if (draftStoreId && prisma.draftStore) {
    try {
      const target = await prisma.draftStore.findUnique({ where: { id: draftStoreId } });
      if (target) {
        const prevInput = target.input && typeof target.input === 'object' ? target.input : {};
        await prisma.draftStore.update({
          where: { id: draftStoreId },
          data: {
            status: 'draft',
            input: {
              ...prevInput,
              uriPromotionDrafts: [
                ...(Array.isArray(prevInput.uriPromotionDrafts)
                  ? prevInput.uriPromotionDrafts
                  : []),
                artifact,
              ],
            },
          },
        });
      }
    } catch (e) {
      console.warn('[URI] promotion draft store update skipped:', e?.message || e);
      draftStoreId = null;
    }
  }

  // Always persist a suitcase-backed artifact pointer when no draft store
  return {
    ok: true,
    destination: DESTINATION_ADAPTER.PROMOTION_DRAFT,
    draftOnly: true,
    published: false,
    promotionDraftId: artifact.id,
    draftStoreId,
    artifact,
    targetId: artifact.id,
    targetType: DESTINATION_ADAPTER.PROMOTION_DRAFT,
  };
}

async function materializeHeroDraft(prisma, ctx) {
  const patch = {
    id: `uri-hero-${Date.now().toString(36)}`,
    status: 'DRAFT',
    published: false,
    hero: {
      mediaType: ctx.resource.mediaType || 'video',
      url: ctx.resource.previewUrl || ctx.resource.canonicalUrl || null,
      resourceId: ctx.resource.id,
      custodyMode: ctx.custodyMode,
      attributionRequired: true,
    },
    note: 'URI storefront hero draft — not published to live storefront',
  };

  let draftStoreId = ctx.draftStoreId || null;
  if (draftStoreId && prisma.draftStore) {
    try {
      const target = await prisma.draftStore.findUnique({ where: { id: draftStoreId } });
      if (target) {
        const prevPreview =
          target.preview && typeof target.preview === 'object' ? target.preview : {};
        await prisma.draftStore.update({
          where: { id: draftStoreId },
          data: {
            status: 'draft',
            preview: {
              ...prevPreview,
              uriHeroDraft: patch,
              publishBlocked: true,
            },
          },
        });
      }
    } catch (e) {
      console.warn('[URI] hero draft skipped:', e?.message || e);
      draftStoreId = null;
    }
  }

  return {
    ok: true,
    destination: DESTINATION_ADAPTER.STOREFRONT_HERO_DRAFT,
    draftOnly: true,
    published: false,
    heroDraftId: patch.id,
    draftStoreId,
    artifact: patch,
    targetId: patch.id,
    targetType: DESTINATION_ADAPTER.STOREFRONT_HERO_DRAFT,
  };
}

async function materializeSocialDraft(prisma, ctx) {
  const artifact = {
    id: `uri-social-${Date.now().toString(36)}`,
    status: 'DRAFT',
    published: false,
    scheduled: false,
    channels: ['instagram', 'facebook'],
    captionHint: `Inspired by ${ctx.resource.title || 'selected resource'}`,
    media: {
      resourceId: ctx.resource.id,
      url: ctx.resource.previewUrl || ctx.resource.canonicalUrl || null,
      mediaType: ctx.resource.mediaType,
    },
    custodyMode: ctx.custodyMode,
    note: 'URI social content draft — not scheduled or published',
  };

  return {
    ok: true,
    destination: DESTINATION_ADAPTER.SOCIAL_CONTENT_DRAFT,
    draftOnly: true,
    published: false,
    socialDraftId: artifact.id,
    artifact,
    targetId: artifact.id,
    targetType: DESTINATION_ADAPTER.SOCIAL_CONTENT_DRAFT,
  };
}

async function materializeSuitcaseReference(prisma, ctx) {
  if (!ctx.userId || !prisma.suitcaseItem) {
    // Persist logical collection without Suitcase owner
    return {
      ok: true,
      destination: DESTINATION_ADAPTER.SUITCASE_REFERENCE_COLLECTION,
      draftOnly: true,
      published: false,
      suitcaseItemId: null,
      collection: {
        name: ctx.collectionName || 'URI reference collection',
        resourceId: ctx.resource.id,
        autoAddedAllCandidates: false,
      },
      targetId: ctx.resource.id,
      targetType: DESTINATION_ADAPTER.SUITCASE_REFERENCE_COLLECTION,
      note: 'Logical reference — Suitcase write skipped without userId',
    };
  }

  try {
    const item = await prisma.suitcaseItem.create({
      data: {
        ownerId: ctx.userId,
        storeId: ctx.storeId || null,
        sourceType: 'artifact',
        contentType: 'json',
        title: ctx.collectionName || `URI collection: ${ctx.resource.title || ctx.resource.id}`,
        description: 'URI workspace reference — not auto-imported full shortlist',
        summary: ctx.intendedPurpose || 'resource_workspace',
        tagsJson: JSON.stringify(['uri', 'workspace', 'reference-collection', ctx.custodyMode]),
        metadataJson: JSON.stringify({
          resourceId: ctx.resource.id,
          custodyMode: ctx.custodyMode,
          binaryStored: false,
          workspaceId: ctx.workspaceId || null,
        }),
        fileUrl: ctx.resource.previewUrl || ctx.resource.canonicalUrl || null,
        thumbnailUrl: ctx.resource.previewUrl || null,
        payloadJson: JSON.stringify({
          resource: {
            id: ctx.resource.id,
            title: ctx.resource.title,
            sourceId: ctx.resource.sourceId,
            url: ctx.resource.previewUrl || ctx.resource.canonicalUrl,
          },
          published: false,
          autoSuitcaseAllCandidates: false,
        }),
        visibility: 'private',
        embeddingStatus: 'pending',
        idempotencyKey: `uri-ws-ref-${ctx.workspaceId || 'x'}-${ctx.resource.id}`.slice(0, 120),
      },
    });
    return {
      ok: true,
      destination: DESTINATION_ADAPTER.SUITCASE_REFERENCE_COLLECTION,
      draftOnly: true,
      published: false,
      suitcaseItemId: item.id,
      targetId: item.id,
      targetType: DESTINATION_ADAPTER.SUITCASE_REFERENCE_COLLECTION,
    };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || 'suitcase_create_failed',
      destination: DESTINATION_ADAPTER.SUITCASE_REFERENCE_COLLECTION,
    };
  }
}
