/**
 * search_music_for_business — Pixabay music search for Performer / Creative Factory.
 */

import { assertPixabayMusicConfigured } from '../../music/musicLicensePolicy.js';
import {
  buildMusicSearchQuery,
  searchPixabayMusic,
} from '../../music/pixabayMusicClient.js';
import { executeContentTool } from '../executeContentTool.js';

export async function execute(input = {}, context = {}) {
  const gate = assertPixabayMusicConfigured();
  if (!gate.ok) {
    return {
      status: 'skipped',
      output: {
        ok: false,
        enabled: false,
        code: gate.code,
        message: gate.message,
        tracks: [],
        suggestions: [],
      },
    };
  }

  return executeContentTool({
    toolName: 'search_music_for_business',
    input,
    context,
    processor: async (inp) => {
      const query = buildMusicSearchQuery({
        businessVertical: inp?.businessVertical ?? inp?.businessType ?? null,
        mood: inp?.mood ?? null,
        objective: inp?.objective ?? null,
        query: inp?.query ?? null,
      });
      const perPage = Math.min(12, Math.max(1, Number(inp?.limit) || 6));
      const { tracks, total } = await searchPixabayMusic(query, { perPage });
      const suggestions = tracks.slice(0, 3);

      return {
        ok: true,
        enabled: true,
        query,
        total,
        tracks,
        suggestions,
        autoSelect: false,
        storeId: inp?.storeId ?? context?.storeId ?? null,
        campaignId: inp?.campaignId ?? null,
      };
    },
    isEmpty: (result) => !Array.isArray(result?.tracks) || result.tracks.length === 0,
    countRecords: (result) => (Array.isArray(result?.tracks) ? result.tracks.length : 0),
  });
}

export default execute;
