/**
 * Creative Factory V4 — per-scene clip render + concat.
 */

import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { registerGeneratedArtifactV1 } from '../artifacts/generatedArtifactAuthority.js';
import { generateVideoViaKling } from '../video/generateVideoViaKling.js';
import { concatVideoClips } from '../video/concatVideoClips.js';

const UPLOADS_DIR =
  process.env.UPLOADS_DIR ?? path.join(process.cwd(), 'uploads', 'media');

/**
 * @param {object} state
 * @param {object} [ownedCtx]
 * @param {{ renderSceneClip?: Function }} [deps]
 */
export async function runMultiSceneRender(state, ownedCtx, deps = {}) {
  const existing = state.stageOutputs?.multi_scene_render;
  if (existing?.renderStatus === 'completed' && existing?.videoUrl) {
    return { ok: true, output: existing, artifactRef: existing.finalArtifactId ?? null };
  }

  const bindings = state.stageOutputs?.scene_binding?.sceneBindings ?? [];
  if (!bindings.length) {
    return {
      ok: false,
      error: { code: 'no_scene_bindings', message: 'Scene bindings required before multi-scene render' },
    };
  }

  const renderSceneClip = deps.renderSceneClip ?? defaultRenderSceneClip;
  const sceneClipRefs = [];
  const sceneClips = [];
  const clipLocalPaths = [];
  const failedScenes = [];

  for (const binding of bindings) {
    const sceneId = String(binding.sceneId ?? '');
    const priorClip = existing?.sceneClips?.find((c) => c.sceneId === sceneId);
    if (priorClip?.artifactId && priorClip.status === 'ready') {
      sceneClips.push(priorClip);
      sceneClipRefs.push(priorClip.artifactId);
      if (priorClip.localPath && fs.existsSync(priorClip.localPath)) {
        clipLocalPaths.push(priorClip.localPath);
      }
      continue;
    }

    try {
      const clip = await renderSceneClip(binding, state, ownedCtx);
      const record = await registerGeneratedArtifactV1({
        artifactId: `gart-${randomUUID()}`,
        artifactType: 'generated_scene_clip',
        missionId: state.missionId,
        ownerUserId: state.userId,
        source: `factory:${state.factoryId}:scene:${sceneId}`,
        status: clip.status ?? 'ready',
        url: clip.url ?? null,
        payload: {
          sceneId,
          purpose: binding.purpose,
          visualPrompt: binding.visualPrompt,
          durationTarget: binding.durationTarget,
          providerTaskId: clip.taskId ?? null,
        },
      });

      const enriched = {
        sceneId,
        artifactId: record.artifactId,
        url: record.url ?? clip.url,
        localPath: clip.localPath ?? null,
        status: record.status,
      };
      sceneClips.push(enriched);
      sceneClipRefs.push(record.artifactId);
      if (enriched.localPath && fs.existsSync(enriched.localPath)) {
        clipLocalPaths.push(enriched.localPath);
      }
    } catch (err) {
      failedScenes.push({ sceneId, error: err?.message ?? String(err) });
    }
  }

  if (!sceneClips.length) {
    return {
      ok: false,
      error: {
        code: 'all_scenes_failed',
        message: 'No scene clips rendered',
        failedScenes,
      },
    };
  }

  let finalUrl = sceneClips.length === 1 ? sceneClips[0].url : null;
  let finalLocalPath = sceneClips.length === 1 ? sceneClips[0].localPath : null;
  let concatError = null;
  let renderStatus = 'completed';

  if (sceneClips.length > 1 && clipLocalPaths.length >= 2) {
    const concat = await concatVideoClips(clipLocalPaths);
    if (concat.ok && concat.publicPath) {
      finalUrl = concat.publicPath;
      finalLocalPath = concat.outputPath ?? null;
    } else {
      concatError = concat.error ?? 'concat_failed';
      renderStatus = 'concat_failed_recoverable';
      finalUrl = sceneClips[0].url;
    }
  } else if (sceneClips.length > 1 && clipLocalPaths.length < 2) {
    renderStatus = 'concat_skipped_remote_clips';
    finalUrl = sceneClips[0].url;
    concatError = 'local_paths_unavailable';
  }

  let finalRecord = null;
  if (finalUrl) {
    finalRecord = await registerGeneratedArtifactV1({
      artifactId: `gart-${randomUUID()}`,
      artifactType: 'generated_video',
      missionId: state.missionId,
      ownerUserId: state.userId,
      source: `factory:${state.factoryId}:multi_scene_render`,
      status: renderStatus === 'completed' ? 'ready' : 'processing',
      url: finalUrl,
      payload: {
        sceneClipRefs,
        sceneCount: sceneClips.length,
        renderStatus,
        concatError,
        failedScenes,
      },
    });
  }

  const output = {
    sceneClips,
    sceneClipRefs,
    videoUrl: finalUrl,
    localPath: finalLocalPath,
    artifact: finalRecord,
    finalArtifactId: finalRecord?.artifactId ?? null,
    renderStatus,
    concatError,
    failedScenes,
    recoverable: renderStatus !== 'completed',
  };

  return {
    ok: true,
    output,
    artifactRef: finalRecord?.artifactId ?? sceneClipRefs[0] ?? null,
    warning: concatError ? `Concat failed: ${concatError}; scene clips preserved` : null,
  };
}

/**
 * @param {object} binding
 * @param {object} state
 */
async function defaultRenderSceneClip(binding, state) {
  const prompt = String(binding.visualPrompt ?? binding.purpose ?? 'promotional scene').trim();
  const duration = Math.min(10, Math.max(5, Number(binding.durationTarget) || 5));

  const result = await generateVideoViaKling({
    prompt,
    duration,
    onPoll: () => {},
  });

  let localPath = null;
  if (result.videoUrl?.startsWith('/uploads/')) {
    localPath = path.join(UPLOADS_DIR, path.basename(result.videoUrl));
    if (!fs.existsSync(localPath)) localPath = null;
  }

  return {
    url: result.videoUrl,
    localPath,
    taskId: result.taskId,
    status: 'ready',
  };
}
