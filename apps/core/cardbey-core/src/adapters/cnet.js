import fs from 'node:fs/promises';
import path from 'node:path';
import fetch from 'node-fetch';

/**
 * @typedef {import('../dto/playlist.js').PlaylistPayload} PlaylistPayload
 */

/**
 * @typedef {{ publishPlaylist(payload: PlaylistPayload): Promise<{ ok: boolean, id: string }>; }} CNetClient
 */

const DEFAULT_OUT_DIR = '/tmp/cnet-out';

function getOutDir() {
  return process.env.CNET_OUT_DIR || DEFAULT_OUT_DIR;
}

/**
 * @returns {CNetClient}
 */
function createMockClient() {
  return {
    async publishPlaylist(payload) {
      const dir = getOutDir();
      await fs.mkdir(dir, { recursive: true });
      const filePath = path.join(dir, `${payload.playlistId}.json`);
      await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
      console.log('[CNet:mock] wrote playlist to', filePath);
      return { ok: true, id: payload.playlistId };
    },
  };
}

/**
 * @param {string} baseUrl
 * @param {string | undefined} apiKey
 * @returns {CNetClient}
 */
function createHttpClient(baseUrl, apiKey) {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return {
    async publishPlaylist(payload) {
      const url = `${trimmed}/api/playlists/${encodeURIComponent(payload.playlistId)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`[CNet] publish failed ${res.status} ${text}`);
      }
      return { ok: true, id: payload.playlistId };
    },
  };
}

/**
 * Factory that returns either an HTTP client or a mock filesystem client.
 * @returns {CNetClient}
 */
export function makeCNetClient() {
  if (process.env.CNET_BASE_URL) {
    return createHttpClient(process.env.CNET_BASE_URL, process.env.CNET_API_KEY);
  }
  return createMockClient();
}

