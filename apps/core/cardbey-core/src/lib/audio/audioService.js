/**
 * Audio Service — search across sources and download to Cardbey library.
 */

import { uploadBufferToS3 } from '../s3Client.js';
import { AUDIO_SOURCES, isAudioSourceEnabled } from './audioSources.js';
import {
  attachAudioAttestation,
  buildAudioExternalId,
  isAllowedAudioTrack,
  musicTrackToAudioTrack,
} from './audioTypes.js';
import { loadMusicSearchService, loadOpenverseMusicClient } from './audioMusicBridge.js';
import { searchFreesoundAudio } from './freesoundClient.js';
import { searchJamendoAudio, getJamendoTrackById } from './jamendoClient.js';
import { searchCcmixterAudio } from './ccmixterClient.js';
import { searchOpenverseByProvider } from './openverseSourceClient.js';
import {
  getLocalAudioByExternalId,
  searchLocalAudioLibrary,
  upsertAudioLibraryItem,
} from './audioLibraryPersistence.js';
import { audioFetchMaxImportBytes } from '../../utils/audioFetchAllowlist.js';

export class AudioService {
  /**
   * @param {string} query
   * @param {string | null} [source]
   * @param {number} [limit]
   */
  async search(query, source = null, limit = 20) {
    const q = String(query ?? '').trim() || 'background music';
    const perPage = Math.min(20, Math.max(3, Number(limit) || 12));
    /** @type {import('./audioTypes.js').NormalizedAudioTrack[]} */
    const results = [];
    const seen = new Set();

    const addTracks = (tracks) => {
      for (const track of tracks) {
        if (!isAllowedAudioTrack(track)) continue;
        if (seen.has(track.id)) continue;
        seen.add(track.id);
        results.push(track);
      }
    };

    const sourceKey = source && source !== 'all' ? String(source).trim().toLowerCase() : null;

    if (!sourceKey || sourceKey === 'local') {
      const local = await searchLocalAudioLibrary(q, { limit: perPage, source: sourceKey });
      addTracks(local);
      if (sourceKey === 'local') {
        return { results, total: results.length };
      }
    }

    const apiSources = sourceKey
      ? [sourceKey]
      : ['pixabay', 'openverse', 'freesound', 'jamendo', 'ccmixter'];

    for (const key of apiSources) {
      if (key === 'local') continue;
      if (!isAudioSourceEnabled(key)) continue;
      try {
        const fromSource = await this._searchSource(key, q, perPage);
        addTracks(fromSource);
      } catch (error) {
        console.error(`[Audio] Failed to search ${key}:`, error?.message || error);
      }
    }

    return { results: results.slice(0, perPage * 2), total: results.length };
  }

  /**
   * @param {string} sourceKey
   * @param {string} query
   * @param {number} limit
   */
  async _searchSource(sourceKey, query, limit) {
    switch (sourceKey) {
      case 'pixabay': {
        const { searchMusicLibrary } = await loadMusicSearchService();
        const res = await searchMusicLibrary(query, { perPage: limit });
        return res.tracks.map((t) =>
          musicTrackToAudioTrack(t, res.catalog === 'pixabay' ? 'pixabay' : 'openverse'),
        );
      }
      case 'openverse': {
        const { searchOpenverseMusic } = await loadOpenverseMusicClient();
        const res = await searchOpenverseMusic(query, { perPage: limit });
        return res.tracks.map((t) => musicTrackToAudioTrack(t, 'openverse'));
      }
      case 'freesound': {
        const direct = await searchFreesoundAudio(query, { perPage: limit });
        if (direct.tracks.length > 0) return direct.tracks;
        const cfg = AUDIO_SOURCES.freesound;
        const ov = await searchOpenverseByProvider(query, cfg.openverseSource, { perPage: limit });
        return ov.tracks;
      }
      case 'jamendo': {
        const direct = await searchJamendoAudio(query, { perPage: limit });
        if (direct.tracks.length > 0) return direct.tracks;
        const cfg = AUDIO_SOURCES.jamendo;
        const ov = await searchOpenverseByProvider(query, cfg.openverseSource, { perPage: limit });
        return ov.tracks;
      }
      case 'ccmixter': {
        const direct = await searchCcmixterAudio(query, { perPage: limit });
        if (direct.tracks.length > 0) return direct.tracks;
        const cfg = AUDIO_SOURCES.ccmixter;
        const ov = await searchOpenverseByProvider(query, cfg.openverseSource, { perPage: limit });
        return ov.tracks;
      }
      default:
        return [];
    }
  }

  /**
   * @param {string} trackId composite id or provider id
   * @param {string} [source]
   */
  async getTrack(trackId, source) {
    const id = String(trackId ?? '').trim();
    if (!id) return null;

    const local = await getLocalAudioByExternalId(id);
    if (local) return local;

    const sourceKey = source || (id.includes('_') ? id.split('_')[0] : null);

    if (sourceKey === 'jamendo' || id.startsWith('jamendo_')) {
      const providerId = id.replace(/^jamendo_/, '');
      const jamendo = await getJamendoTrackById(providerId);
      if (jamendo) return jamendo;
    }

    const { getMusicTrackById } = await loadMusicSearchService();
    const music = await getMusicTrackById(id.replace(/^(pixabay|openverse|freesound|jamendo|ccmixter)_/, ''));
    if (music) {
      return musicTrackToAudioTrack(music, sourceKey || music.provider);
    }

    return null;
  }

  /**
   * @param {string} url
   * @param {string} fileName
   */
  async downloadAudio(url, fileName) {
    const response = await fetch(url, { method: 'GET', redirect: 'follow' });
    if (!response.ok) {
      throw new Error(`Failed to fetch audio (${response.status})`);
    }

    let buffer = Buffer.from(await response.arrayBuffer());
    const maxBytes = audioFetchMaxImportBytes();
    if (buffer.length > maxBytes) {
      throw new Error('Audio file too large');
    }
    if (buffer.length < 1024) {
      throw new Error('Audio file too small or blocked by source host');
    }

    const contentType = response.headers.get('content-type') || 'audio/mpeg';
    const mime = contentType.split(';')[0].trim() || 'audio/mpeg';
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const { key, url: storageUrl } = await uploadBufferToS3(buffer, safeName, mime, 'artifacts');

    return {
      storageUrl,
      storageKey: key,
      size: buffer.length,
      mime,
    };
  }

  /**
   * @param {import('./audioTypes.js').NormalizedAudioTrack} audioData
   * @param {{ storeId?: string | null; uploadedBy?: string | null; isSeeded?: boolean }} [opts]
   */
  async saveAudioToLibrary(audioData, opts = {}) {
    const track = attachAudioAttestation(audioData);
    if (!isAllowedAudioTrack(track)) {
      throw new Error('Track missing license or audio URL');
    }

    let storageUrl = track.storageUrl ?? null;
    let storageKey = null;

    const remoteUrl = track.downloadUrl || track.previewUrl;
    if (!storageUrl && remoteUrl) {
      const ext = remoteUrl.includes('.ogg') ? 'ogg' : 'mp3';
      const fileName = `${track.source}_${track.providerTrackId}.${ext}`;
      const downloaded = await this.downloadAudio(remoteUrl, fileName);
      storageUrl = downloaded.storageUrl;
      storageKey = downloaded.storageKey;
    }

    return upsertAudioLibraryItem(track, {
      storageUrl,
      storageKey,
      storeId: opts.storeId ?? null,
      uploadedBy: opts.uploadedBy ?? null,
      isSeeded: opts.isSeeded ?? false,
    });
  }

  /**
   * @param {import('./audioTypes.js').NormalizedAudioTrack} track
   * @param {{ storeId?: string | null; uploadedBy?: string | null }} [opts]
   */
  async importTrackToLibrary(track, opts = {}) {
    const externalId = track.id || buildAudioExternalId(track.source, track.providerTrackId);
    const existing = await getLocalAudioByExternalId(externalId);
    if (existing?.storageUrl) return existing;
    return this.saveAudioToLibrary({ ...track, id: externalId }, opts);
  }
}

export const audioService = new AudioService();
export default audioService;
