/**
 * select_music_track — store Pixabay selection with license metadata (no publish).
 */

import { assertPixabayMusicConfigured } from '../../music/musicLicensePolicy.js';
import { getPixabayTrackById } from '../../music/pixabayMusicClient.js';
import { storeSelectedMusicTrack } from '../../music/selectedMusicAssetService.js';
import { executeContentTool } from '../executeContentTool.js';

export async function execute(input = {}, context = {}) {
  const gate = assertPixabayMusicConfigured();
  if (!gate.ok) {
    return {
      status: 'failed',
      error: { code: gate.code, message: gate.message },
      output: { ok: false, enabled: false },
    };
  }

  const trackId = String(input?.providerTrackId ?? input?.trackId ?? '').trim();
  if (!trackId) {
    return {
      status: 'failed',
      error: { code: 'TRACK_ID_REQUIRED', message: 'providerTrackId is required' },
      output: { ok: false },
    };
  }

  const ownerUserId =
    (typeof context?.userId === 'string' && context.userId) ||
    (typeof context?.ownerUserId === 'string' && context.ownerUserId) ||
    null;

  if (!ownerUserId) {
    return {
      status: 'failed',
      error: { code: 'AUTH_REQUIRED', message: 'Authenticated user required to select music.' },
      output: { ok: false },
    };
  }

  return executeContentTool({
    toolName: 'select_music_track',
    input,
    context,
    processor: async (inp) => {
      const track = await getPixabayTrackById(trackId);
      if (!track) {
        throw new Error('Track not found');
      }
      const stored = await storeSelectedMusicTrack(track, {
        ownerUserId,
        storeId: inp?.storeId ?? context?.storeId ?? null,
        campaignId: inp?.campaignId ?? null,
        missionId: inp?.missionId ?? context?.missionId ?? null,
        selectedFor: inp?.selectedFor ?? 'performer_selection',
      });
      if (!stored.ok) {
        throw new Error(stored.message);
      }
      return {
        ok: true,
        selected: true,
        published: false,
        asset: stored.asset,
        suitcaseItemId: stored.suitcaseItemId,
      };
    },
    isEmpty: (result) => !result?.asset,
    countRecords: () => 1,
  });
}

export default execute;
