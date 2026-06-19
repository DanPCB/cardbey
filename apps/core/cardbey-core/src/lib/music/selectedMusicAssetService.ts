/**
 * Persist selected Pixabay music tracks as governed media metadata (SuitcaseItem).
 * No publish side-effects — metadata only.
 */

import { createSuitcaseItem } from '../../services/suitcase/suitcaseItemService.js';
import type { NormalizedMusicTrack } from './musicLicensePolicy.js';
import { isAllowedMusicTrack } from './musicLicensePolicy.js';

export type SelectedMusicContext = {
  ownerUserId: string;
  storeId?: string | null;
  campaignId?: string | null;
  missionId?: string | null;
  selectedFor?: string | null;
};

export type SelectedMusicAssetRecord = {
  id: string;
  type: 'audio';
  provider: 'pixabay';
  providerTrackId: string;
  title: string;
  previewUrl: string;
  downloadUrl: string;
  sourceUrl: string;
  license: string;
  duration: number | null;
  tags: string[];
  selectedFor: string | null;
  storeId: string | null;
  campaignId: string | null;
  missionId: string | null;
  createdByRuntime: boolean;
  attribution: string;
  metadata: Record<string, unknown>;
};

export function buildSelectedMusicAssetPayload(
  track: NormalizedMusicTrack,
  ctx: SelectedMusicContext,
): SelectedMusicAssetRecord {
  return {
    id: `pixabay:${track.providerTrackId}`,
    type: 'audio',
    provider: track.provider,
    providerTrackId: track.providerTrackId,
    title: track.title,
    previewUrl: track.previewUrl,
    downloadUrl: track.downloadUrl,
    sourceUrl: track.sourceUrl,
    license: track.license,
    duration: track.duration,
    tags: track.tags,
    selectedFor: ctx.selectedFor ?? null,
    storeId: ctx.storeId ?? null,
    campaignId: ctx.campaignId ?? null,
    missionId: ctx.missionId ?? null,
    createdByRuntime: true,
    attribution: track.attribution,
    metadata: track.metadata,
  };
}

export async function storeSelectedMusicTrack(
  track: NormalizedMusicTrack,
  ctx: SelectedMusicContext,
): Promise<{ ok: true; asset: SelectedMusicAssetRecord; suitcaseItemId: string | null } | { ok: false; message: string }> {
  if (!isAllowedMusicTrack(track)) {
    return { ok: false, message: 'Track missing required license or audio URL metadata.' };
  }

  const payload = buildSelectedMusicAssetPayload(track, ctx);
  let suitcaseItemId: string | null = null;

  try {
    const item = await createSuitcaseItem({
      ownerId: ctx.ownerUserId,
      storeId: ctx.storeId ?? null,
      missionId: ctx.missionId ?? null,
      sourceType: 'campaign_asset',
      contentType: 'json',
      title: payload.title,
      description: payload.attribution,
      tags: payload.tags,
      metadata: {
        mediaType: 'audio',
        provider: payload.provider,
        license: payload.license,
        selectedFor: payload.selectedFor,
        campaignId: payload.campaignId,
        createdByRuntime: true,
      },
      payload,
      visibility: 'private',
      idempotencyKey: `pixabay-music:${ctx.ownerUserId}:${track.providerTrackId}:${ctx.selectedFor ?? 'general'}`,
    });
    suitcaseItemId = item?.id ?? null;
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Failed to store selected music track.' };
  }

  return { ok: true, asset: payload, suitcaseItemId };
}
