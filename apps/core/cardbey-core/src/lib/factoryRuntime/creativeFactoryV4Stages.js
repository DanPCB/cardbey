/**
 * Creative Factory V4 — scene binding, multi-scene render, subtitle burn, music mux, governed publish.
 */

import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { registerGeneratedArtifactV1 } from '../artifacts/generatedArtifactAuthority.js';
import { recordRuntimeAuthorityPathUsed } from '../runtime/performerRuntime/runtimeAuthorityGuard.js';
import { appendEvent } from '../missionBlackboard.js';
import { buildSceneBindings } from './creativeFactoryV4SceneBinding.js';
import { runMultiSceneRender } from './creativeFactoryV4MultiSceneRender.js';
import {
  buildSubtitleLines,
  estimateVideoDurationSec,
  linesToSrt,
  linesToVtt,
  resolveVoiceoverText,
} from './creativeFactoryV3Subtitle.js';
import { runMusicSelectionStage } from './creativeFactoryV3Stages.js';
import { burnSubtitlesIntoVideo } from '../video/burnSubtitlesIntoVideo.js';
import { fetchMusicBedIfConfigured } from '../video/audio/musicBed.js';
import {
  emitCreativeFactoryPublishHandoffReady,
  emitCreativeFactoryMusicSelected,
  emitCreativeFactorySubtitleReady,
} from './factoryTelemetry.js';

const UPLOADS_DIR =
  process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads', 'media');

/**
 * @param {object} stage
 * @param {object} state
 * @param {object} definition
 * @param {object} [ownedCtx]
 */
export async function runCreativeFactoryV4BuiltinStage(stage, state, definition, ownedCtx) {
  switch (stage.stageId) {
    case 'scene_binding':
      return runSceneBindingStage(state);
    case 'multi_scene_render':
      return runMultiSceneRenderStage(state, ownedCtx);
    case 'subtitle_burn_optional':
      return runSubtitleBurnOptionalStage(state);
    case 'music_selection':
      return runMusicSelectionWithMuxStage(state, ownedCtx);
    case 'publish_handoff':
      return runGovernedPublishHandoffStage(state, ownedCtx);
    default:
      return { ok: false, error: { code: 'unknown_v4_stage', message: `Unknown V4 stage: ${stage.stageId}` } };
  }
}

function runSceneBindingStage(state) {
  const existing = state.stageOutputs?.scene_binding?.sceneBindings;
  if (Array.isArray(existing) && existing.length) {
    return { ok: true, output: state.stageOutputs.scene_binding };
  }

  const scriptDraft = state.stageOutputs?.script?.scriptDraft ?? {};
  const assetCandidates = state.stageOutputs?.asset_search?.assetCandidates ?? [];
  const researchBrief = state.stageOutputs?.research?.researchBrief ?? {};
  const videoPlan = state.stageOutputs?.video_plan?.videoPlan ?? {};

  const sceneBindings = buildSceneBindings({
    scriptDraft,
    assetCandidates,
    researchBrief,
    videoPlan,
  });

  return { ok: true, output: { sceneBindings } };
}

async function runMultiSceneRenderStage(state, ownedCtx) {
  return runMultiSceneRender(state, ownedCtx);
}

async function runSubtitleBurnOptionalStage(state) {
  const existing = state.stageOutputs?.subtitle_burn_optional;
  if (existing?.subtitleArtifact?.artifactId) {
    return { ok: true, output: existing, artifactRef: existing.subtitleArtifact.artifactId };
  }

  const scriptDraft = state.stageOutputs?.script?.scriptDraft ?? {};
  const videoPlan = state.stageOutputs?.video_plan?.videoPlan ?? {};
  const renderOut = state.stageOutputs?.multi_scene_render ?? {};
  const videoUrl = renderOut.videoUrl ?? null;
  const localPath = renderOut.localPath ?? resolveLocalPathFromUrl(videoUrl);

  const voiceoverText = resolveVoiceoverText(scriptDraft, videoPlan);
  const durationSec = estimateVideoDurationSec(scriptDraft, videoPlan);
  const lines = buildSubtitleLines(voiceoverText, durationSec);
  const srtContent = linesToSrt(lines);
  const vttContent = linesToVtt(lines);

  const subtitleRecord = await registerGeneratedArtifactV1({
    artifactId: `gart-${randomUUID()}`,
    artifactType: 'generated_subtitle',
    missionId: state.missionId,
    ownerUserId: state.userId,
    source: `factory:${state.factoryId}:subtitle_burn_optional`,
    status: 'ready',
    url: null,
    payload: { srtContent, vttContent, lines, timingMode: 'estimated_even_split' },
  });

  emitCreativeFactorySubtitleReady({
    factoryId: state.factoryId,
    missionId: state.missionId,
    userId: state.userId,
    artifactId: subtitleRecord.artifactId,
    lineCount: lines.length,
  });

  let burnedVariant = null;
  let burnWarning = null;

  if (localPath && fs.existsSync(localPath)) {
    const burn = await burnSubtitlesIntoVideo({ videoPath: localPath, srtContent });
    if (burn.ok && burn.publicPath) {
      burnedVariant = await registerGeneratedArtifactV1({
        artifactId: `gart-${randomUUID()}`,
        artifactType: 'generated_video_variant',
        missionId: state.missionId,
        ownerUserId: state.userId,
        source: `factory:${state.factoryId}:subtitle_burn`,
        status: 'ready',
        url: burn.publicPath,
        payload: {
          variantType: 'subtitle_burn_in',
          originalVideoUrl: videoUrl,
          subtitleArtifactId: subtitleRecord.artifactId,
        },
      });
    } else {
      burnWarning = burn.error ?? 'burn_failed';
    }
  } else {
    burnWarning = 'no_local_video_for_burn';
  }

  return {
    ok: true,
    output: {
      subtitleArtifact: subtitleRecord,
      burnedVariant,
      srtContent,
      vttContent,
      lines,
      burnWarning,
    },
    artifactRef: subtitleRecord.artifactId,
  };
}

async function runMusicSelectionWithMuxStage(state, ownedCtx) {
  const base = await runMusicSelectionStage(state, ownedCtx);
  if (!base.ok) return base;

  const musicSelection = base.output?.musicSelection ?? {};
  const renderOut = state.stageOutputs?.multi_scene_render ?? {};
  const subtitleOut = state.stageOutputs?.subtitle_burn_optional ?? {};
  const videoPath =
    subtitleOut.burnedVariant?.url
      ? resolveLocalPathFromUrl(subtitleOut.burnedVariant.url)
      : renderOut.localPath ?? resolveLocalPathFromUrl(renderOut.videoUrl);

  let musicVariant = null;
  let muxWarning = null;

  if (videoPath && fs.existsSync(videoPath) && musicSelection.trackUrl) {
    const mux = await mixMusicBedIntoVideo(videoPath, musicSelection.trackUrl);
    if (mux.ok && mux.publicPath) {
      musicVariant = await registerGeneratedArtifactV1({
        artifactId: `gart-${randomUUID()}`,
        artifactType: 'generated_video_variant',
        missionId: state.missionId,
        ownerUserId: state.userId,
        source: `factory:${state.factoryId}:music_mux`,
        status: 'ready',
        url: mux.publicPath,
        payload: {
          variantType: 'music_mixed',
          musicSelectionId: musicSelection.selectionId,
          originalVideoUrl: renderOut.videoUrl,
        },
      });
      emitCreativeFactoryMusicSelected({
        factoryId: state.factoryId,
        missionId: state.missionId,
        userId: state.userId,
        trackId: musicSelection.trackId,
        source: 'music_mux',
      });
    } else {
      muxWarning = mux.error ?? 'mux_failed';
    }
  } else if (!musicSelection.fallback) {
    muxWarning = 'music_mux_pending';
  }

  return {
    ok: true,
    output: {
      ...base.output,
      musicVariant,
      muxWarning,
    },
    artifactRef: musicVariant?.artifactId ?? base.artifactRef ?? null,
  };
}

async function runGovernedPublishHandoffStage(state, ownedCtx) {
  const existing = state.stageOutputs?.publish_handoff?.publishOptions;
  if (Array.isArray(existing) && existing.length) {
    return { ok: true, output: state.stageOutputs.publish_handoff };
  }

  const storeId = state.context?.storeId ?? null;
  const renderOut = state.stageOutputs?.multi_scene_render ?? {};
  const subtitleOut = state.stageOutputs?.subtitle_burn_optional ?? {};
  const musicOut = state.stageOutputs?.music_selection ?? {};

  const publishOptions = [
    {
      id: 'content_studio',
      label: 'Open in Content Studio',
      action: 'open_content_studio',
      proposedAction: 'generate_creative',
      requiresConfirmation: false,
      available: true,
    },
    {
      id: 'store',
      label: 'Publish to store',
      action: 'publish_to_store',
      proposedAction: 'publish',
      requiresConfirmation: true,
      available: Boolean(storeId),
      storeId,
    },
    {
      id: 'signage',
      label: 'Publish to signage',
      action: 'publish_to_signage',
      proposedAction: 'signage_push',
      requiresConfirmation: true,
      available: Boolean(storeId),
      storeId,
    },
    {
      id: 'share',
      label: 'Export / share',
      action: 'share_export',
      proposedAction: 'external_publish',
      requiresConfirmation: true,
      available: true,
    },
  ];

  recordRuntimeAuthorityPathUsed({
    route: 'factory_v4_publish_handoff',
    toolName: state.factoryId,
    userId: state.userId,
    missionId: state.missionId,
    source: 'factory_runtime',
  });

  const finalBundle = {
    videoArtifactId: renderOut.finalArtifactId ?? renderOut.artifact?.artifactId ?? null,
    videoUrl: renderOut.videoUrl ?? null,
    subtitleArtifactId: subtitleOut.subtitleArtifact?.artifactId ?? null,
    burnedVariantId: subtitleOut.burnedVariant?.artifactId ?? null,
    musicVariantId: musicOut.musicVariant?.artifactId ?? null,
    sceneClipRefs: renderOut.sceneClipRefs ?? [],
  };

  emitCreativeFactoryPublishHandoffReady({
    factoryId: state.factoryId,
    missionId: state.missionId,
    userId: state.userId,
    optionCount: publishOptions.length,
  });

  return {
    ok: true,
    output: {
      publishOptions,
      finalBundle,
      governed: true,
      handoffNote: 'Select a publish target — all publish actions require confirmation and Runtime Authority.',
    },
  };
}

/**
 * Governed publish action — invoked only after final approval via API.
 * @param {{ missionId: string, userId: string, target: string, storeId?: string|null, factoryExecution: object }} args
 */
export async function executeGovernedFactoryPublish(args) {
  const mid = String(args.missionId ?? '').trim();
  const uid = String(args.userId ?? '').trim();
  const target = String(args.target ?? '').trim();
  const execution = args.factoryExecution;

  if (!mid || !uid || !target) {
    return { ok: false, error: 'validation', message: 'missionId, userId, and target required' };
  }

  const approval = execution?.approvalDecision;
  const finalApproved =
    approval?.decision === 'approve' &&
    (approval?.stageId === 'final_asset_review' || execution?.stageOutputs?.publish_handoff);

  if (!finalApproved && execution?.status !== 'completed') {
    return {
      ok: false,
      error: 'final_approval_required',
      message: 'Governed publish requires final asset approval',
    };
  }

  const handoff = execution?.stageOutputs?.publish_handoff;
  const option = (handoff?.publishOptions ?? []).find((o) => o.id === target || o.action === target);
  if (!option?.available) {
    return { ok: false, error: 'target_unavailable', message: `Publish target unavailable: ${target}` };
  }

  recordRuntimeAuthorityPathUsed({
    route: 'factory_v4_governed_publish',
    toolName: target,
    userId: uid,
    missionId: mid,
    source: 'factory_governed_publish',
  });

  const eventPayload = {
    event: 'FACTORY_PUBLISH_REQUESTED',
    target,
    proposedAction: option.proposedAction,
    requiresConfirmation: option.requiresConfirmation !== false,
    storeId: args.storeId ?? option.storeId ?? null,
    factoryId: execution?.factoryId,
    executionId: execution?.executionId,
    runtimeAuthority: true,
    status: 'pending_user_confirmation',
  };

  await appendEvent(mid, 'FACTORY_PUBLISH_REQUESTED', eventPayload, { agentId: 'factory_governed_publish' });

  return {
    ok: true,
    status: 'pending_user_confirmation',
    target,
    proposedAction: option.proposedAction,
    requiresConfirmation: option.requiresConfirmation !== false,
    message: 'Publish intent recorded — user confirmation required before execution',
  };
}

function resolveLocalPathFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('/uploads/')) {
    return path.join(UPLOADS_DIR, path.basename(url));
  }
  return null;
}

async function mixMusicBedIntoVideo(videoPath, musicUrl) {
  const bed = musicUrl.startsWith('http') ? await fetchMusicBedIfConfigured() : { ok: false };
  let musicPath = bed.ok ? bed.path : null;

  if (!musicPath && musicUrl.startsWith('/uploads/')) {
    const local = path.join(UPLOADS_DIR, path.basename(musicUrl));
    if (fs.existsSync(local)) musicPath = local;
  }

  if (!musicPath) {
    return { ok: false, error: 'music_path_unavailable' };
  }

  const { default: ffmpegStatic } = await import('ffmpeg-static');
  const outLocal = path.join(UPLOADS_DIR, `${Date.now()}-music-mux.mp4`);
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  const args = [
    '-y',
    '-i',
    videoPath,
    '-i',
    musicPath,
    '-filter_complex',
    '[1:a]volume=0.25[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=2[aout]',
    '-map',
    '0:v:0',
    '-map',
    '[aout]',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-shortest',
    outLocal,
  ];

  try {
    await runFfmpegProc(ffmpegStatic, args);
    return { ok: true, publicPath: `/uploads/media/${path.basename(outLocal)}`, outputPath: outLocal };
  } catch (e) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

function runFfmpegProc(ffmpegPath, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    proc.on('close', (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`ffmpeg_exit_${code}`));
    });
  });
}
