/**
 * Resolve whether a creative video requires TTS narration, allows optional
 * music, or is an explicit silent deliverable.
 */

import { mapBrandToneToVoicePreset } from '../audio/ttsProvider.js';

export const VIDEO_REQUIRED_AUDIO_MISSING = 'VIDEO_REQUIRED_AUDIO_MISSING';

const SILENT_INTENT_RE =
  /\b(silent\s+video|no\s+(sound|audio|voiceover|narration)|without\s+(sound|audio|voiceover|narration)|mute[d]?\s+video)\b/i;

/**
 * @param {object} plan
 * @param {string} [userMessage]
 */
export function resolveNarrationPolicy(plan = {}, userMessage = '') {
  const audio = plan?.audio && typeof plan.audio === 'object' ? plan.audio : {};
  const captions = plan?.captions && typeof plan.captions === 'object' ? plan.captions : {};
  const intent = `${userMessage ?? ''} ${plan?.autoPrompt ?? ''}`;

  const silentRequested =
    audio.silentRequested === true ||
    audio.mode === 'silent' ||
    (audio.voiceoverEnabled === false && audio.musicEnabled === false) ||
    SILENT_INTENT_RE.test(intent);

  const voiceoverEnabled = !silentRequested && audio.voiceoverEnabled !== false;
  const musicEnabled = !silentRequested && audio.musicEnabled !== false;
  const narrationRequired = voiceoverEnabled;
  const burnCaptions = captions.burnIn === true || audio.burnCaptions === true;

  return {
    silentRequested,
    voiceoverEnabled,
    musicEnabled,
    narrationRequired,
    musicOptional: musicEnabled,
    burnCaptions,
    sidecarCaptions: !silentRequested && captions.sidecar !== false,
    voicePreset:
      typeof audio.voicePreset === 'string' && audio.voicePreset.trim()
        ? audio.voicePreset.trim()
        : mapBrandToneToVoicePreset(plan.mood ?? plan.brandTone),
  };
}

/**
 * Authoritative narration text: approved script / voiceover copy only.
 * Do not invent caption wording after TTS.
 *
 * @param {object} plan
 * @returns {string}
 */
export function resolveApprovedNarrationScript(plan = {}) {
  const voiceover = typeof plan.voiceover === 'string' ? plan.voiceover.trim() : '';
  if (voiceover) return voiceover;
  const script = typeof plan.script === 'string' ? plan.script.trim() : '';
  if (script) return script;
  const scenes = Array.isArray(plan.scenes) ? plan.scenes : [];
  const fromScenes = scenes
    .map((s) => String(s?.shot ?? s?.voiceover ?? s?.text ?? '').trim())
    .filter(Boolean)
    .join(' ');
  return fromScenes;
}

/**
 * @param {string} text
 * @returns {'en' | 'vi'}
 */
export function detectNarrationLanguage(text) {
  const sample = String(text ?? '');
  const latinVi =
    /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
  const viChars = sample.match(/[\u00C0-\u1EF9]/g);
  if (latinVi.test(sample) || (viChars && viChars.length >= 3)) return 'vi';
  return 'en';
}
