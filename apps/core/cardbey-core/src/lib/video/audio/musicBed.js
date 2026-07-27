/**
 * Optional royalty-free music bed (env: VIDEO_MUSIC_BED_URL).
 */

import fs from 'fs';
import { createTempPath, safeUnlink } from '../../tempFiles.js';

/**
 * @returns {Promise<{ ok: boolean, path?: string, error?: string }>}
 */
export async function fetchMusicBedIfConfigured() {
  const url = String(process.env.VIDEO_MUSIC_BED_URL ?? '').trim();
  if (!url) return { ok: false, error: 'music_not_configured' };

  const out = createTempPath('cardbey-music-', pathExt(url));
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`music_fetch_${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.promises.writeFile(out, buf);
    return { ok: true, path: out };
  } catch (e) {
    await safeUnlink(out);
    return { ok: false, error: e?.message ?? String(e) };
  }
}

function pathExt(url) {
  const m = String(url).match(/\.(mp3|wav|m4a|aac)(\?|$)/i);
  return m ? `.${m[1].toLowerCase()}` : '.mp3';
}
