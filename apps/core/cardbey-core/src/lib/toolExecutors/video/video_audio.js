/**
 * video_audio — post-process promo video with voiceover + optional music bed.
 * Never fails the mission: falls back to silent video with warning on error.
 */

import { appendEvent } from '../../missionBlackboard.js';
import { mapBrandToneToVoicePreset, synthesizeVoiceover } from '../../video/audio/ttsProvider.js';
import { fetchMusicBedIfConfigured } from '../../video/audio/musicBed.js';
import { muxAudioIntoVideo } from '../../video/audio/videoAudioMux.js';
import {
  fileHasAudioStream,
  probeVideoUrlForAudio,
  resolveLocalVideoPath,
} from '../../video/audio/videoAudioProbe.js';
import { safeUnlink } from '../../tempFiles.js';

/**
 * @param {object} input
 */
export async function execute(input = {}) {
  const plan = input?.approvedPlan ?? input?.plan ?? {};
  const videoOutput = input?.videoOutput ?? input?.videoExecuteOutput ?? {};
  const audioPrefs = normalizeAudioPrefs(plan.audio, plan);

  const silentVideoUrl =
    typeof videoOutput.silentVideoUrl === 'string'
      ? videoOutput.silentVideoUrl
      : typeof videoOutput.videoUrl === 'string'
        ? videoOutput.videoUrl
        : null;

  if (!silentVideoUrl) {
    return okFallback({
      reason: 'no_video_url',
      audioWarning: 'Video not available for audio processing',
      videoOutput,
    });
  }

  if (!audioPrefs.voiceoverEnabled && !audioPrefs.musicEnabled) {
    return okResult({
      skipped: true,
      reason: 'audio_disabled_in_plan',
      videoUrl: silentVideoUrl,
      silentVideoUrl,
      videoOutput,
      audioPrefs,
    });
  }

  let localPath = null;
  let downloaded = false;
  const temps = [];

  try {
    const probe = await probeVideoUrlForAudio(silentVideoUrl);
    localPath = probe.localPath;
    downloaded = probe.downloaded;
    if (downloaded) temps.push(localPath);

    if (probe.hasAudio) {
      return okResult({
        audioSource: 'native',
        skippedPostProcess: true,
        videoUrl: silentVideoUrl,
        heroVideoUrl: videoOutput.heroVideoUrl ?? silentVideoUrl,
        silentVideoUrl,
        hasAudio: true,
        audioPrefs,
        videoOutput,
      });
    }

    if (!audioPrefs.voiceoverEnabled) {
      return okFallback({
        reason: 'voiceover_off_no_native_audio',
        audioWarning: 'Audio unavailable — native track missing and voiceover disabled',
        videoUrl: silentVideoUrl,
        silentVideoUrl,
        videoOutput,
        audioPrefs,
      });
    }

    const voicePreset =
      audioPrefs.voicePreset ?? mapBrandToneToVoicePreset(plan.mood ?? plan.brandTone);
    const tts = await synthesizeVoiceover({
      text: plan.script ?? plan.voiceover ?? '',
      voicePreset,
      scenes: plan.scenes,
    });

    if (!tts.ok || !tts.audioPath) {
      return okFallback({
        reason: 'tts_failed',
        audioWarning: 'Audio unavailable',
        ttsError: tts.error ?? null,
        videoUrl: silentVideoUrl,
        silentVideoUrl,
        videoOutput,
        audioPrefs,
      });
    }
    temps.push(tts.audioPath);

    let musicPath = null;
    if (audioPrefs.musicEnabled) {
      const music = await fetchMusicBedIfConfigured();
      if (music.ok && music.path) {
        musicPath = music.path;
        temps.push(musicPath);
      }
    }

    const mux = await muxAudioIntoVideo({
      videoPath: localPath,
      voiceoverPath: tts.audioPath,
      musicPath,
      musicDuckDb: -14,
    });

    if (!mux.ok || !mux.publicPath) {
      return okFallback({
        reason: 'mux_failed',
        audioWarning: 'Audio unavailable',
        muxError: mux.error ?? null,
        videoUrl: silentVideoUrl,
        silentVideoUrl,
        videoOutput,
        audioPrefs,
      });
    }

    const muxLocal = mux.outputPath;
    if (muxLocal) {
      const hasAudio = await fileHasAudioStream(muxLocal);
      if (!hasAudio) {
        return okFallback({
          reason: 'mux_no_audio_stream',
          audioWarning: 'Audio unavailable',
          videoUrl: silentVideoUrl,
          silentVideoUrl,
          videoOutput,
          audioPrefs,
        });
      }
    }

    const missionId = String(input?.missionId ?? '').trim();
    if (missionId) {
      void appendEvent(missionId, 'skill:video_silent_archive', {
        silentVideoUrl,
        finalVideoUrl: mux.publicPath,
      }).catch(() => {});
    }

    return okResult({
      audioSource: 'post_processed',
      videoUrl: mux.publicPath,
      heroVideoUrl: mux.publicPath,
      heroVideoUrlIosSafe: mux.publicPath,
      silentVideoUrl,
      hasAudio: true,
      audioPrefs,
      voicePreset,
      musicUsed: Boolean(musicPath),
      videoOutput,
    });
  } catch (e) {
    return okFallback({
      reason: 'audio_exception',
      audioWarning: 'Audio unavailable',
      error: e?.message ?? String(e),
      videoUrl: silentVideoUrl,
      silentVideoUrl,
      videoOutput,
      audioPrefs,
    });
  } finally {
    for (const t of temps) {
      if (t && t !== resolveLocalVideoPath(silentVideoUrl)) {
        await safeUnlink(t);
      }
    }
  }
}

/**
 * @param {object | null | undefined} audio
 * @param {object} plan
 */
function normalizeAudioPrefs(audio, plan) {
  const a = audio && typeof audio === 'object' ? audio : {};
  return {
    voiceoverEnabled: a.voiceoverEnabled !== false,
    musicEnabled: a.musicEnabled !== false,
    voicePreset:
      typeof a.voicePreset === 'string' ? a.voicePreset : mapBrandToneToVoicePreset(plan.mood ?? plan.brandTone),
  };
}

function okResult(output) {
  // @pure-transform: shapes tool executor response envelope; side effects occur in execute().
  return { status: 'ok', output };
}

function okFallback(partial) {
  // @pure-transform: silent-video fallback envelope; execute() already attempted IO above.
  return {
    status: 'ok',
    output: {
      ...partial,
      hasAudio: false,
      fallbackSilent: true,
    },
  };
}

export default execute;
