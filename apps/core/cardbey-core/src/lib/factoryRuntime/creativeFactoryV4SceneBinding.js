/**
 * Creative Factory V4 — scene binding from script, assets, and plan.
 */

/**
 * @param {{
 *   scriptDraft?: object;
 *   assetCandidates?: Array<object>;
 *   researchBrief?: object;
 *   videoPlan?: object;
 * }} input
 */
export function buildSceneBindings(input) {
  const scriptDraft = input.scriptDraft ?? {};
  const videoPlan = input.videoPlan ?? {};
  const researchBrief = input.researchBrief ?? {};
  const assetCandidates = Array.isArray(input.assetCandidates) ? input.assetCandidates : [];

  const scenes = Array.isArray(videoPlan.scenes)
    ? videoPlan.scenes
    : Array.isArray(scriptDraft.scenes)
      ? scriptDraft.scenes
      : [];

  if (!scenes.length) {
    return [
      {
        sceneId: 'scene_1',
        purpose: String(researchBrief.offerAngle ?? 'Promotional highlight'),
        voiceover: String(scriptDraft.voiceoverCopy ?? videoPlan.script ?? scriptDraft.hook ?? ''),
        onScreenText: Array.isArray(scriptDraft.onScreenText) ? scriptDraft.onScreenText : [],
        visualPrompt: buildVisualPrompt(researchBrief, scriptDraft, videoPlan, null),
        selectedAssetRefs: pickAssetRefs(assetCandidates, 0, 1),
        durationTarget: 10,
        transitionHint: 'cut',
      },
    ];
  }

  const voiceLines = splitVoiceover(scriptDraft.voiceoverCopy ?? videoPlan.script ?? '');

  return scenes.map((scene, index) => {
    const sceneId = String(scene.id ?? scene.sceneId ?? `scene_${index + 1}`);
    const selectedAssetRefs = pickAssetRefs(assetCandidates, index, 2);
    return {
      sceneId,
      purpose: String(scene.purpose ?? scene.shot ?? `Scene ${index + 1}`),
      voiceover: voiceLines[index] ?? voiceLines[0] ?? String(scene.shot ?? ''),
      onScreenText: scene.onScreenText
        ? [String(scene.onScreenText)]
        : Array.isArray(scriptDraft.onScreenText)
          ? [String(scriptDraft.onScreenText[index] ?? scriptDraft.onScreenText[0] ?? '')].filter(Boolean)
          : [],
      visualPrompt: buildVisualPrompt(researchBrief, scriptDraft, videoPlan, scene),
      selectedAssetRefs,
      durationTarget: Number(scene.durationSec ?? scene.durationTarget ?? 5) || 5,
      transitionHint: String(scene.transitionHint ?? scene.transition ?? 'cut'),
    };
  });
}

/**
 * @param {Array<object>} candidates
 * @param {number} sceneIndex
 * @param {number} max
 */
function pickAssetRefs(candidates, sceneIndex, max) {
  if (!candidates.length) return [];
  const picked = [];
  for (let i = 0; i < max; i += 1) {
    const c = candidates[(sceneIndex + i) % candidates.length];
    if (!c) continue;
    picked.push({
      assetId: c.assetId ?? c.id ?? `asset-${sceneIndex}-${i}`,
      url: c.url ?? null,
      usageRole: c.usageRole ?? 'visual',
    });
  }
  return picked;
}

function buildVisualPrompt(researchBrief, scriptDraft, videoPlan, scene) {
  const tone = researchBrief.recommendedTone ?? 'professional';
  const angle = researchBrief.offerAngle ?? researchBrief.summary ?? '';
  const shot = scene?.shot ?? scene?.purpose ?? scriptDraft.hook ?? 'promotional scene';
  const style = videoPlan.style ?? 'promotional';
  const assetHint =
    scene && Array.isArray(scene.selectedAssetRefs) && scene.selectedAssetRefs.length
      ? `Use reference assets: ${scene.selectedAssetRefs.map((a) => a.assetId).join(', ')}`
      : 'Generate visual from prompt only';
  return `${style} video, ${tone} tone, ${angle}. Scene: ${shot}. ${assetHint}.`;
}

function splitVoiceover(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return [];
  return raw.split(/(?<=[.!?])\s+/).filter(Boolean);
}
