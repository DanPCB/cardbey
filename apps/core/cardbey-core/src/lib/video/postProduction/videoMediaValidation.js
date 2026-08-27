/**
 * Validate final video streams with ffprobe before Factory completion.
 */

import {
  probeMediaStreams,
  probeVideoUrlForAudio,
} from '../audio/videoAudioProbe.js';
import { VIDEO_REQUIRED_AUDIO_MISSING } from './narrationPolicy.js';

/**
 * @param {{
 *   videoUrl?: string,
 *   silentVideoUrl?: string,
 *   captionUrl?: string | null,
 *   captionMode?: string,
 *   narrationRequired?: boolean,
 *   silentRequested?: boolean,
 *   hasAudioClaim?: boolean,
 *   postProduction?: object,
 * }} input
 */
export async function validateVideoMedia(input = {}) {
  const videoUrl = typeof input.videoUrl === 'string' ? input.videoUrl.trim() : '';
  const silentRequested = input.silentRequested === true;
  const narrationRequired = input.narrationRequired === true && !silentRequested;

  if (!videoUrl) {
    return {
      ok: false,
      status: 'failed',
      code: 'VIDEO_MEDIA_MISSING',
      error: { code: 'VIDEO_MEDIA_MISSING', message: 'No video URL to validate' },
      output: {
        validationStatus: 'failed',
        hasAudio: false,
        audioStreamCount: 0,
        videoStreamCount: 0,
      },
    };
  }

  let localPath = null;
  try {
    const probe = await probeVideoUrlForAudio(videoUrl);
    localPath = probe.localPath;
    const streams = await probeMediaStreams(localPath);
    const hasAudio = streams.hasAudio;
    const captionMode = input.captionMode ?? input.postProduction?.captionMode ?? 'none';
    const captionUrl = input.captionUrl ?? input.postProduction?.captionUrl ?? null;

    if (narrationRequired && !hasAudio) {
      return {
        ok: false,
        status: 'failed',
        code: VIDEO_REQUIRED_AUDIO_MISSING,
        error: {
          code: VIDEO_REQUIRED_AUDIO_MISSING,
          message: 'Final MP4 has no audio stream after required narration post-production.',
        },
        output: {
          validationStatus: 'failed',
          videoUrl,
          silentVideoUrl: input.silentVideoUrl ?? null,
          hasAudio: false,
          audioStreamCount: streams.audioStreamCount,
          videoStreamCount: streams.videoStreamCount,
          captionMode,
          captionUrl,
          durationSec: streams.durationSec,
        },
      };
    }

    return {
      ok: true,
      status: 'ok',
      output: {
        validationStatus: 'passed',
        videoUrl,
        silentVideoUrl: input.silentVideoUrl ?? null,
        hasAudio,
        audioStreamCount: streams.audioStreamCount,
        videoStreamCount: streams.videoStreamCount,
        captionMode,
        captionUrl,
        durationSec: streams.durationSec,
      },
    };
  } catch (e) {
    if (narrationRequired) {
      return {
        ok: false,
        status: 'failed',
        code: VIDEO_REQUIRED_AUDIO_MISSING,
        error: {
          code: VIDEO_REQUIRED_AUDIO_MISSING,
          message: e?.message ?? 'Could not validate required audio stream',
        },
        output: {
          validationStatus: 'failed',
          videoUrl,
          hasAudio: false,
        },
      };
    }
    return {
      ok: true,
      status: 'ok',
      outcome: 'partial',
      output: {
        validationStatus: 'partial',
        videoUrl,
        hasAudio: false,
        audioWarning: e?.message ?? 'ffprobe failed',
      },
    };
  }
}
