/**
 * Canonical video post-production: approved narration → TTS → mux → captions.
 * Shared by Creative Factory and VideoGenerationSkill. Does not use Kling native
 * audio as the authoritative narration path.
 */

import { synthesizeVoiceover } from '../audio/ttsProvider.js';
import { fetchMusicBedIfConfigured } from '../audio/musicBed.js';
import { muxAudioIntoVideo } from '../audio/videoAudioMux.js';
import {
  getMediaDurationSec,
  probeVideoUrlForAudio,
  resolveLocalVideoPath,
} from '../audio/videoAudioProbe.js';
import { burnSubtitlesIntoVideo } from '../burnSubtitlesIntoVideo.js';
import { safeUnlink } from '../../tempFiles.js';
import { appendEvent } from '../../missionBlackboard.js';
import {
  VIDEO_REQUIRED_AUDIO_MISSING,
  detectNarrationLanguage,
  resolveApprovedNarrationScript,
  resolveNarrationPolicy,
} from './narrationPolicy.js';
import {
  buildCaptionCuesFromNarration,
  cuesToSrt,
  cuesToWebVtt,
} from './captionFromNarration.js';
import { persistCaptionSidecar } from './persistSidecar.js';

/**
 * @param {{
 *   plan?: object,
 *   approvedPlan?: object,
 *   videoOutput?: object,
 *   userMessage?: string,
 *   missionId?: string,
 * }} input
 */
export async function runVideoPostProduction(input = {}) {
  const plan = input.approvedPlan ?? input.plan ?? {};
  const videoOutput = input.videoOutput ?? input.videoExecuteOutput ?? {};
  const userMessage = typeof input.userMessage === 'string' ? input.userMessage : '';
  const policy = resolveNarrationPolicy(plan, userMessage);
  const narrationText = resolveApprovedNarrationScript(plan);
  const language = detectNarrationLanguage(narrationText);

  const silentVideoUrl =
    typeof videoOutput.silentVideoUrl === 'string'
      ? videoOutput.silentVideoUrl
      : typeof videoOutput.videoUrl === 'string'
        ? videoOutput.videoUrl
        : typeof videoOutput.artifact?.url === 'string'
          ? videoOutput.artifact.url
          : null;

  if (!silentVideoUrl) {
    return failOrPartial({
      policy,
      reason: 'no_video_url',
      warning: 'Video not available for audio processing',
      videoOutput,
      language,
    });
  }

  if (policy.silentRequested) {
    return {
      ok: true,
      status: 'ok',
      outcome: 'complete',
      code: null,
      output: {
        skipped: true,
        reason: 'silent_requested',
        videoUrl: silentVideoUrl,
        silentVideoUrl,
        hasAudio: false,
        captionMode: 'none',
        captionUrl: null,
        audioSource: 'none',
        language,
        policy,
        videoOutput,
        outcomeReport: buildOutcomeReport({
          audio: 'Silent video requested — no narration muxed.',
          captions: 'Captions skipped for silent video.',
          warnings: [],
        }),
      },
    };
  }

  const temps = [];
  let localPath = null;
  let downloaded = false;

  try {
    const probe = await probeVideoUrlForAudio(silentVideoUrl);
    localPath = probe.localPath;
    downloaded = probe.downloaded;
    if (downloaded) temps.push(localPath);

    if (!policy.voiceoverEnabled && !policy.musicEnabled) {
      return {
        ok: true,
        status: 'ok',
        outcome: 'complete',
        output: {
          skipped: true,
          reason: 'audio_disabled_in_plan',
          videoUrl: silentVideoUrl,
          silentVideoUrl,
          hasAudio: Boolean(probe.hasAudio),
          captionMode: 'none',
          audioSource: probe.hasAudio ? 'native_kept' : 'none',
          language,
          policy,
          videoOutput,
          outcomeReport: buildOutcomeReport({
            audio: probe.hasAudio ? 'Plan disabled narration; existing audio kept.' : 'Audio disabled in plan.',
            captions: 'Captions skipped.',
            warnings: [],
          }),
        },
      };
    }

    if (!policy.narrationRequired) {
      return {
        ok: true,
        status: 'ok',
        outcome: probe.hasAudio ? 'complete' : 'partial',
        output: {
          skipped: true,
          reason: 'voiceover_off',
          videoUrl: silentVideoUrl,
          silentVideoUrl,
          hasAudio: Boolean(probe.hasAudio),
          fallbackSilent: !probe.hasAudio,
          audioWarning: probe.hasAudio ? undefined : 'Audio unavailable — voiceover disabled',
          captionMode: 'none',
          language,
          policy,
          videoOutput,
          outcomeReport: buildOutcomeReport({
            audio: probe.hasAudio ? 'Voiceover off; native/existing audio kept.' : 'Voiceover disabled and no audio track.',
            captions: 'Captions skipped.',
            warnings: probe.hasAudio ? [] : ['Audio unavailable'],
          }),
        },
      };
    }

    if (!narrationText) {
      return failOrPartial({
        policy,
        reason: 'empty_script',
        warning: 'Approved narration script is empty',
        videoUrl: silentVideoUrl,
        silentVideoUrl,
        videoOutput,
        language,
      });
    }

    const tts = await synthesizeVoiceover({
      text: narrationText,
      voicePreset: policy.voicePreset,
      scenes: Array.isArray(plan.scenes) ? plan.scenes : [],
    });

    if (!tts.ok || !tts.audioPath) {
      return failOrPartial({
        policy,
        reason: tts.error ?? 'tts_failed',
        warning: 'Audio unavailable',
        ttsError: tts.error ?? null,
        videoUrl: silentVideoUrl,
        silentVideoUrl,
        videoOutput,
        language,
      });
    }
    temps.push(tts.audioPath);

    const warnings = [];
    let musicPath = null;
    if (policy.musicEnabled) {
      const music = await fetchMusicBedIfConfigured();
      if (music.ok && music.path) {
        musicPath = music.path;
        temps.push(musicPath);
      } else if (music.error && music.error !== 'music_not_configured') {
        warnings.push(`Music bed unavailable (${music.error})`);
      }
    }

    const mux = await muxAudioIntoVideo({
      videoPath: localPath,
      voiceoverPath: tts.audioPath,
      musicPath,
      musicDuckDb: -14,
    });

    if (!mux.ok || !mux.publicPath) {
      return failOrPartial({
        policy,
        reason: mux.error ?? 'mux_failed',
        warning: 'Audio unavailable',
        muxError: mux.error ?? null,
        videoUrl: silentVideoUrl,
        silentVideoUrl,
        videoOutput,
        language,
      });
    }

    const voiceDuration =
      (await getMediaDurationSec(tts.audioPath)) ??
      tts.segments?.reduce((sum, s) => sum + (Number(s.durationSec) || 0), 0) ??
      null;

    const cues = buildCaptionCuesFromNarration({
      narrationText,
      totalDurationSec: voiceDuration || Number(plan.duration) || 8,
      scenes: plan.scenes,
      ttsSegments: (tts.segments ?? []).map((seg, i) => ({
        durationSec: Number(seg.durationSec) || undefined,
        text: splitBySceneOrIndex(narrationText, plan.scenes, i),
      })),
    });

    const vttContent = cues.length ? cuesToWebVtt(cues, { language }) : '';
    const srtContent = cues.length ? cuesToSrt(cues) : '';
    let captionUrl = null;
    let captionMode = 'none';

    if (vttContent && policy.sidecarCaptions) {
      const sidecar = await persistCaptionSidecar(vttContent, 'vtt');
      if (sidecar.ok) {
        captionUrl = sidecar.publicPath;
        captionMode = 'sidecar';
      } else {
        warnings.push(`Caption sidecar failed (${sidecar.error})`);
      }
    }

    let finalVideoUrl = mux.publicPath;
    let finalLocalPath = mux.outputPath ?? null;

    if (policy.burnCaptions && srtContent && finalLocalPath) {
      const burn = await burnSubtitlesIntoVideo({
        videoPath: finalLocalPath,
        srtContent,
      });
      if (burn.ok && burn.publicPath) {
        finalVideoUrl = burn.publicPath;
        captionMode = captionUrl ? 'sidecar_and_burned' : 'burned';
      } else {
        warnings.push(`Burn-in captions failed (${burn.error ?? 'burn_failed'})`);
      }
    }

    const missionId = String(input.missionId ?? '').trim();
    if (missionId) {
      void appendEvent(missionId, 'skill:video_silent_archive', {
        silentVideoUrl,
        finalVideoUrl,
      }).catch(() => {});
    }

    const outcome = warnings.length ? 'partial' : 'complete';
    return {
      ok: true,
      status: 'ok',
      outcome,
      output: {
        audioSource: 'tts_mux',
        videoUrl: finalVideoUrl,
        heroVideoUrl: finalVideoUrl,
        heroVideoUrlIosSafe: finalVideoUrl,
        silentVideoUrl,
        hasAudio: true,
        captionUrl,
        captionMode,
        vttContent: captionUrl ? undefined : vttContent || undefined,
        language,
        cues,
        policy,
        voicePreset: policy.voicePreset,
        musicUsed: Boolean(musicPath),
        videoOutput,
        warnings,
        outcomeReport: buildOutcomeReport({
          audio: `TTS narration muxed (${language === 'vi' ? 'Vietnamese' : 'English'}${musicPath ? ', music bed' : ''}).`,
          captions: captionUrl
            ? `WebVTT sidecar (${cues.length} cue${cues.length === 1 ? '' : 's'}) aligned to narration.`
            : cues.length
              ? 'Caption cues built but sidecar was not stored.'
              : 'No caption cues.',
          warnings,
        }),
      },
    };
  } catch (e) {
    return failOrPartial({
      policy,
      reason: 'audio_exception',
      warning: 'Audio unavailable',
      error: e?.message ?? String(e),
      videoUrl: silentVideoUrl,
      silentVideoUrl,
      videoOutput,
      language,
    });
  } finally {
    for (const t of temps) {
      if (t && t !== resolveLocalVideoPath(silentVideoUrl)) {
        await safeUnlink(t);
      }
    }
  }
}

function failOrPartial({
  policy,
  reason,
  warning,
  videoUrl,
  silentVideoUrl,
  videoOutput,
  language,
  ...rest
}) {
  const warnings = [warning].filter(Boolean);
  if (policy?.narrationRequired) {
    return {
      ok: false,
      status: 'failed',
      outcome: 'failed',
      code: VIDEO_REQUIRED_AUDIO_MISSING,
      error: {
        code: VIDEO_REQUIRED_AUDIO_MISSING,
        message: warning || 'Required narration could not be added to the video.',
        reason,
      },
      output: {
        hasAudio: false,
        fallbackSilent: true,
        audioWarning: warning,
        reason,
        videoUrl: silentVideoUrl ?? videoUrl ?? null,
        silentVideoUrl: silentVideoUrl ?? null,
        captionMode: 'none',
        language,
        policy,
        videoOutput,
        ...rest,
        outcomeReport: buildOutcomeReport({
          audio: `Required narration failed (${reason}).`,
          captions: 'Captions not generated because narration failed.',
          warnings,
        }),
      },
    };
  }

  return {
    ok: true,
    status: 'ok',
    outcome: 'partial',
    output: {
      hasAudio: false,
      fallbackSilent: true,
      audioWarning: warning,
      reason,
      videoUrl: silentVideoUrl ?? videoUrl ?? null,
      silentVideoUrl: silentVideoUrl ?? null,
      captionMode: 'none',
      language,
      policy,
      videoOutput,
      ...rest,
      outcomeReport: buildOutcomeReport({
        audio: warning || 'Audio unavailable',
        captions: 'Captions skipped.',
        warnings,
      }),
    },
  };
}

function buildOutcomeReport({ audio, captions, warnings }) {
  return {
    audio: audio ?? null,
    captions: captions ?? null,
    warnings: Array.isArray(warnings) ? warnings : [],
  };
}

function splitBySceneOrIndex(narrationText, scenes, index) {
  if (Array.isArray(scenes) && scenes[index]) {
    const shot = String(scenes[index].shot ?? scenes[index].voiceover ?? '').trim();
    if (shot) return shot;
  }
  return narrationText;
}
