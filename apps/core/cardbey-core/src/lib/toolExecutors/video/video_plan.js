/**
 * video_plan — Claude-only planning step (brief + script). No Kling / external video API.
 */

import { execute as analyzeVideoBrief } from './analyze_video_brief.js';
import { execute as generateVideoScript } from './generate_video_script.js';
import { resolveVideoProvider } from '../../video/videoProvider.js';
import { VIDEO_PLAN_SCHEMA } from '../../skills/planApprovalConstants.js';
import { mapBrandToneToVoicePreset } from '../../video/audio/ttsProvider.js';

const STYLE_OPTIONS = ['brand_story', 'promotional', 'fashion_runway', 'product_showcase'];

/**
 * @param {object} input
 */
export async function execute(input = {}) {
  const briefResult = await analyzeVideoBrief({
    storeId: input?.storeId,
    userMessage: input?.userMessage ?? '',
  });
  if (briefResult?.status !== 'ok') {
    return briefResult;
  }

  const brief = briefResult.output ?? {};
  const scriptResult = await generateVideoScript({
    style: brief.style,
    duration: brief.duration,
    mood: brief.mood,
    storeName: brief.storeName,
    brandTone: input?.brandTone ?? 'friendly',
  });
  if (scriptResult?.status !== 'ok') {
    return scriptResult;
  }

  const scriptOut = scriptResult.output ?? {};
  const provider = resolveVideoProvider();
  const model =
    provider === 'kling'
      ? String(process.env.KLING_MODEL ?? 'kling-v3').trim() || 'kling-v3'
      : provider ?? 'none';

  const durationSec = Number(brief.duration) || Number(scriptOut.duration) || 30;
  const estRenderMinutes = provider === 'kling' ? Math.max(2, Math.ceil(durationSec / 10)) : null;
  const brandTone = input?.brandTone ?? brief.mood ?? 'friendly';

  const plan = {
    schema: VIDEO_PLAN_SCHEMA,
    script: String(scriptOut.script ?? '').trim(),
    scenes: Array.isArray(scriptOut.scenes) ? scriptOut.scenes : [],
    voiceover: String(scriptOut.voiceover ?? scriptOut.script ?? '').trim(),
    style: String(brief.style ?? 'brand_story'),
    mood: String(brief.mood ?? 'warm'),
    duration: durationSec,
    storeName: String(brief.storeName ?? ''),
    storeId: typeof input?.storeId === 'string' ? input.storeId.trim() : '',
    autoPrompt: String(brief.autoPrompt ?? ''),
    styleOptions: STYLE_OPTIONS,
    model,
    provider: provider ?? null,
    estRenderMinutes,
    estRenderLabel:
      estRenderMinutes != null ? `~${estRenderMinutes} min render` : 'Provider not configured',
    brandTone,
    audio: {
      voiceoverEnabled: true,
      musicEnabled: true,
      voicePreset: mapBrandToneToVoicePreset(brandTone),
    },
  };

  return {
    status: 'ok',
    output: {
      plan,
      planSchema: VIDEO_PLAN_SCHEMA,
      phase: 'plan',
    },
  };
}

export default execute;
