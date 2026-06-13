/**
 * Creative Factory V3 — subtitle, music selection, publish handoff stages.
 */

import { randomUUID } from 'crypto';
import { getPrismaClient } from '../prisma.js';
import { registerGeneratedArtifactV1 } from '../artifacts/generatedArtifactAuthority.js';
import { fetchMusicBedIfConfigured } from '../video/audio/musicBed.js';
import {
  buildSubtitleLines,
  estimateVideoDurationSec,
  linesToSrt,
  linesToVtt,
  resolveVoiceoverText,
} from './creativeFactoryV3Subtitle.js';
import {
  emitCreativeFactoryMusicSelected,
  emitCreativeFactoryPublishHandoffReady,
  emitCreativeFactorySubtitleReady,
} from './factoryTelemetry.js';

/**
 * @param {object} stage
 * @param {object} state
 * @param {object} definition
 * @param {object} [ownedCtx]
 */
export async function runCreativeFactoryV3BuiltinStage(stage, state, definition, ownedCtx) {
  switch (stage.stageId) {
    case 'subtitle':
      return runSubtitleStage(state, ownedCtx);
    case 'music_selection':
      return runMusicSelectionStage(state, ownedCtx);
    case 'publish_handoff':
      return runPublishHandoffStage(state, ownedCtx);
    default:
      return { ok: false, error: { code: 'unknown_v3_stage', message: `Unknown V3 stage: ${stage.stageId}` } };
  }
}

/**
 * @param {object} state
 * @param {object} [ownedCtx]
 */
export async function runSubtitleStage(state, ownedCtx) {
  const existing = state.stageOutputs?.subtitle;
  if (existing?.subtitleArtifact?.artifactId) {
    return { ok: true, output: existing, artifactRef: existing.subtitleArtifact.artifactId };
  }

  const scriptDraft = state.stageOutputs?.script?.scriptDraft ?? {};
  const videoPlan = state.stageOutputs?.video_plan?.videoPlan ?? {};
  const executeOut = state.stageOutputs?.execute ?? {};
  const videoUrl = executeOut.videoUrl ?? executeOut.artifact?.url ?? null;

  const voiceoverText = resolveVoiceoverText(scriptDraft, videoPlan);
  const durationSec = estimateVideoDurationSec(scriptDraft, videoPlan);
  const lines = buildSubtitleLines(voiceoverText, durationSec);
  const srtContent = linesToSrt(lines);
  const vttContent = linesToVtt(lines);

  let subtitleRecord = null;
  try {
    subtitleRecord = await registerGeneratedArtifactV1({
      artifactId: `gart-${randomUUID()}`,
      artifactType: 'generated_subtitle',
      missionId: state.missionId,
      ownerUserId: state.userId,
      source: `factory:${state.factoryId}:subtitle`,
      status: 'ready',
      url: null,
      payload: {
        format: 'srt',
        srtContent,
        vttContent,
        lineCount: lines.length,
        estimatedDurationSec: durationSec,
        videoUrl,
        lines,
        timingMode: 'estimated_even_split',
      },
    });
  } catch (err) {
    return {
      ok: true,
      output: {
        subtitleArtifact: null,
        srtContent,
        vttContent,
        lines,
        warning: err?.message ?? 'subtitle_persist_failed',
        fallback: true,
      },
    };
  }

  emitCreativeFactorySubtitleReady({
    factoryId: state.factoryId,
    missionId: state.missionId,
    userId: state.userId,
    artifactId: subtitleRecord.artifactId,
    lineCount: lines.length,
  });

  const output = {
    subtitleArtifact: subtitleRecord,
    srtContent,
    vttContent,
    lines,
    format: 'srt',
    videoUrl,
  };

  return { ok: true, output, artifactRef: subtitleRecord.artifactId };
}

/**
 * @param {object} state
 * @param {object} [ownedCtx]
 */
export async function runMusicSelectionStage(state, ownedCtx) {
  const existing = state.stageOutputs?.music_selection;
  if (existing?.musicSelection?.selectionId) {
    return { ok: true, output: existing };
  }

  const researchBrief = state.stageOutputs?.research?.researchBrief ?? {};
  const videoPlan = state.stageOutputs?.video_plan?.videoPlan ?? {};
  const mood =
    String(researchBrief.recommendedTone ?? videoPlan.style ?? 'neutral').trim().toLowerCase() || 'neutral';

  let musicSelection = await selectMusicFromCatalog(mood);
  if (!musicSelection.trackUrl) {
    const bed = await fetchMusicBedIfConfigured();
    if (bed.ok && bed.path) {
      musicSelection = {
        ...musicSelection,
        trackId: 'env_music_bed',
        trackUrl: process.env.VIDEO_MUSIC_BED_URL ?? null,
        source: 'env_bed',
        usageRights: 'configured_bed',
        moodMatchReason: `Matched mood "${mood}" via VIDEO_MUSIC_BED_URL`,
      };
    }
  }

  if (!musicSelection.trackUrl) {
    musicSelection = {
      selectionId: `music-silence-${randomUUID()}`,
      trackId: null,
      trackUrl: null,
      trackName: 'Silence',
      source: 'silence',
      usageRights: 'none',
      mood,
      moodMatchReason: 'No catalog or env bed — silent fallback',
      fallback: true,
    };
  } else if (!musicSelection.selectionId) {
    musicSelection.selectionId = `music-${randomUUID()}`;
  }

  let musicRecord = null;
  try {
    musicRecord = await registerGeneratedArtifactV1({
      artifactId: `gart-${randomUUID()}`,
      artifactType: 'generated_music_selection',
      missionId: state.missionId,
      ownerUserId: state.userId,
      source: `factory:${state.factoryId}:music_selection`,
      status: 'ready',
      url: musicSelection.trackUrl,
      payload: { ...musicSelection },
    });
  } catch {
    musicRecord = null;
  }

  emitCreativeFactoryMusicSelected({
    factoryId: state.factoryId,
    missionId: state.missionId,
    userId: state.userId,
    trackId: musicSelection.trackId,
    source: musicSelection.source,
  });

  const output = {
    musicSelection: {
      ...musicSelection,
      artifactId: musicRecord?.artifactId ?? null,
    },
    musicArtifact: musicRecord,
  };

  return {
    ok: true,
    output,
    artifactRef: musicRecord?.artifactId ?? null,
  };
}

/**
 * @param {string} mood
 */
async function selectMusicFromCatalog(mood) {
  try {
    const prisma = getPrismaClient();
    if (!prisma.miMusicTrack?.findMany) {
      return { mood, source: 'catalog_unavailable', moodMatchReason: 'MiMusicTrack not available' };
    }
    const tracks = await prisma.miMusicTrack.findMany({
      where: { isActive: true },
      orderBy: { updatedAt: 'desc' },
      take: 24,
    });
    if (!tracks.length) {
      return { mood, source: 'catalog_empty', moodMatchReason: 'No active tracks in catalog' };
    }

    const moodTokens = mood.split(/[\s,_-]+/).filter(Boolean);
    const scored = tracks.map((track) => {
      const hay = `${track.category} ${track.name} ${track.key}`.toLowerCase();
      const score = moodTokens.reduce((sum, token) => (hay.includes(token) ? sum + 1 : sum), 0);
      return { track, score };
    });
    scored.sort((a, b) => b.score - a.score);
    const pick = scored[0]?.track ?? tracks[0];

    return {
      selectionId: `music-${randomUUID()}`,
      trackId: pick.key,
      trackName: pick.name,
      trackUrl: pick.audioUrl,
      category: pick.category,
      durationSec: pick.duration ?? null,
      source: 'mi_music_catalog',
      usageRights: 'catalog',
      mood,
      moodMatchReason:
        scored[0]?.score > 0
          ? `Catalog match for mood "${mood}" (${pick.name})`
          : `Default catalog track (${pick.name})`,
    };
  } catch {
    return { mood, source: 'catalog_error', moodMatchReason: 'Could not query music catalog' };
  }
}

/**
 * @param {object} state
 * @param {object} [ownedCtx]
 */
export async function runPublishHandoffStage(state, ownedCtx) {
  const existing = state.stageOutputs?.publish_handoff?.publishOptions;
  if (Array.isArray(existing) && existing.length > 0) {
    return { ok: true, output: state.stageOutputs.publish_handoff };
  }

  const storeId = state.context?.storeId ?? null;
  const executeOut = state.stageOutputs?.execute ?? {};
  const videoArtifactId =
    executeOut.artifact?.artifactId ??
    state.artifactRefs?.[state.artifactRefs.length - 1] ??
    null;
  const subtitleArtifact = state.stageOutputs?.subtitle?.subtitleArtifact ?? null;
  const musicSelection = state.stageOutputs?.music_selection?.musicSelection ?? null;

  const publishOptions = [
    {
      id: 'content_studio',
      label: 'Open in Content Studio',
      action: 'open_content_studio',
      available: true,
    },
    {
      id: 'store',
      label: 'Publish to store',
      action: 'publish_to_store',
      available: Boolean(storeId),
      storeId,
    },
    {
      id: 'signage',
      label: 'Publish to signage / playlist',
      action: 'publish_to_signage',
      available: Boolean(storeId),
      storeId,
    },
    {
      id: 'share',
      label: 'Share / export',
      action: 'share_export',
      available: true,
    },
    {
      id: 'campaign',
      label: 'Publish to campaign',
      action: 'publish_to_campaign',
      available: Boolean(storeId),
      storeId,
    },
  ];

  const output = {
    publishOptions,
    finalBundle: {
      videoArtifactId,
      videoUrl: executeOut.videoUrl ?? executeOut.artifact?.url ?? null,
      subtitleArtifactId: subtitleArtifact?.artifactId ?? null,
      musicSelectionId: musicSelection?.selectionId ?? null,
      musicArtifactId: musicSelection?.artifactId ?? null,
    },
    handoffNote: 'User chooses publish destination — no automatic posting in V3.',
  };

  emitCreativeFactoryPublishHandoffReady({
    factoryId: state.factoryId,
    missionId: state.missionId,
    userId: state.userId,
    optionCount: publishOptions.length,
  });

  return { ok: true, output };
}
