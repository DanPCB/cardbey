import { toPublicPlaybackState } from './domain.js';

function buildCloudflarePlaybackUrls(customerCode, uid) {
  const code = String(customerCode || '').trim();
  const liveInputUid = String(uid || '').trim();
  if (!code || !liveInputUid) return { hlsUrl: null, iframeSrc: null };
  return {
    hlsUrl: `https://customer-${code}.cloudflarestream.com/${liveInputUid}/manifest/video.m3u8`,
    iframeSrc: `https://customer-${code}.cloudflarestream.com/${liveInputUid}/iframe`,
  };
}

/**
 * Build a public-safe playback DTO for live player surfaces.
 * Never includes RTMPS / WHIP / WHEP / stream keys.
 *
 * @param {object} session
 * @param {{
 *   playerEnabled?: boolean,
 *   customerCode?: string | null,
 *   providerConfirmedLive?: boolean,
 * }} [opts]
 */
export function buildPublicPlaybackDto(session, opts = {}) {
  const providerConfirmedLive = Boolean(opts.providerConfirmedLive);
  const playbackState = toPublicPlaybackState(session, {
    playerEnabled: opts.playerEnabled !== false,
    providerConfirmedLive,
  });
  const liveInputUid = String(session?.providerExternalRef || '').trim();
  let player = null;

  if (playbackState === 'LIVE' && opts.playerEnabled !== false) {
    const urls = buildCloudflarePlaybackUrls(opts.customerCode, liveInputUid);
    player = {
      provider: 'cloudflare_stream',
      ...(urls.hlsUrl ? { hlsUrl: urls.hlsUrl } : {}),
      ...(urls.iframeSrc ? { iframeSrc: urls.iframeSrc } : {}),
    };
  }

  return {
    playbackState,
    player,
    providerConfirmedLive,
  };
}
