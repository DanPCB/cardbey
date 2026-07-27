/**
 * Persist Cardbey Audio Library rows.
 */

import { prisma } from '../prisma.js';
import { caseInsensitiveFilter } from '../dbCapabilities.js';
import { buildAudioExternalId } from './audioTypes.js';

/**
 * @param {import('./audioTypes.js').NormalizedAudioTrack} track
 * @param {{ storageUrl?: string | null; storageKey?: string | null; storeId?: string | null; uploadedBy?: string | null; isSeeded?: boolean }} [opts]
 */
export function audioTrackToDbPayload(track, opts = {}) {
  const externalId = track.id || buildAudioExternalId(track.source, track.providerTrackId);
  return {
    externalId,
    source: track.source,
    title: track.title,
    description:
      typeof track.metadata?.description === 'string' ? track.metadata.description : null,
    duration: track.duration ?? null,
    remoteUrl: track.downloadUrl || track.previewUrl,
    storageUrl: opts.storageUrl ?? track.storageUrl ?? null,
    storageKey: opts.storageKey ?? null,
    license: track.license,
    attribution: track.attribution ?? null,
    tags: track.tags ?? [],
    metadata: track.metadata ?? {},
    storeId: opts.storeId ?? null,
    uploadedBy: opts.uploadedBy ?? null,
    isSeeded: opts.isSeeded ?? false,
  };
}

/**
 * @param {{ id: string; externalId: string; source: string; title: string; duration: number | null; remoteUrl: string | null; storageUrl: string | null; license: string; attribution: string | null; tags: unknown; metadata: unknown }} row
 */
export function dbRowToAudioTrack(row) {
  const tags = Array.isArray(row.tags)
    ? row.tags.map((t) => String(t))
  : typeof row.tags === 'string'
      ? (() => {
          try {
            const parsed = JSON.parse(row.tags);
            return Array.isArray(parsed) ? parsed.map((t) => String(t)) : [];
          } catch {
            return [];
          }
        })()
      : [];

  return {
    id: row.externalId,
    source: /** @type {import('./audioTypes.js').AudioSourceId} */ (row.source),
    providerTrackId: row.externalId.includes('_')
      ? row.externalId.split('_').slice(1).join('_')
      : row.id,
    title: row.title,
    duration: row.duration,
    genre: null,
    mood: null,
    tags,
    previewUrl: row.storageUrl || row.remoteUrl || '',
    downloadUrl: row.storageUrl || row.remoteUrl || '',
    attribution: row.attribution || row.title,
    license: row.license,
    sourceUrl: row.remoteUrl || row.storageUrl || '',
    thumbnailUrl: null,
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    libraryItemId: row.id,
    storageUrl: row.storageUrl,
  };
}

/**
 * @param {import('./audioTypes.js').NormalizedAudioTrack} track
 * @param {{ storageUrl?: string | null; storageKey?: string | null; storeId?: string | null; uploadedBy?: string | null; isSeeded?: boolean }} [opts]
 */
export async function upsertAudioLibraryItem(track, opts = {}) {
  const payload = audioTrackToDbPayload(track, opts);
  const row = await prisma.audioLibrary.upsert({
    where: { externalId: payload.externalId },
    update: {
      ...payload,
      updatedAt: new Date(),
    },
    create: payload,
  });
  return dbRowToAudioTrack(row);
}

/**
 * @param {string} query
 * @param {{ limit?: number; source?: string | null }} [options]
 */
export async function searchLocalAudioLibrary(query, options = {}) {
  const q = String(query ?? '').trim();
  const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));
  const source = options.source && options.source !== 'all' ? options.source : null;

  const rows = await prisma.audioLibrary.findMany({
    where: {
      ...(source ? { source } : {}),
      ...(q
        ? {
            OR: [
              { title: caseInsensitiveFilter(q, 'contains') },
              { description: caseInsensitiveFilter(q, 'contains') },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });

  return rows.map(dbRowToAudioTrack);
}

/**
 * @param {{ limit?: number; source?: string | null }} [options]
 */
export async function listLocalAudioLibrary(options = {}) {
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 40));
  const source = options.source && options.source !== 'all' ? options.source : null;
  const rows = await prisma.audioLibrary.findMany({
    where: source ? { source } : undefined,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map(dbRowToAudioTrack);
}

/**
 * @param {string} externalId
 */
export async function getLocalAudioByExternalId(externalId) {
  const row = await prisma.audioLibrary.findUnique({ where: { externalId } });
  return row ? dbRowToAudioTrack(row) : null;
}
