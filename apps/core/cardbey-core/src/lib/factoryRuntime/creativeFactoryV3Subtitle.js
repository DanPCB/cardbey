/**
 * Creative Factory V3 — subtitle line timing + SRT/VTT generation (estimated timing).
 */

/**
 * @param {string} voiceoverText
 * @param {number} [totalDurationSec]
 */
export function buildSubtitleLines(voiceoverText, totalDurationSec = 30) {
  const text = String(voiceoverText ?? '').trim();
  if (!text) {
    return [{ index: 1, text: ' ', startSec: 0, endSec: totalDurationSec }];
  }

  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const lines = sentences.length ? sentences : [text];
  const perLine = totalDurationSec / lines.length;

  return lines.map((line, i) => ({
    index: i + 1,
    text: line,
    startSec: Number((i * perLine).toFixed(3)),
    endSec: Number(((i + 1) * perLine).toFixed(3)),
  }));
}

/**
 * @param {number} sec
 */
export function formatSrtTimestamp(sec) {
  const totalMs = Math.max(0, Math.round(sec * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/**
 * @param {Array<{ index?: number, text: string, startSec: number, endSec: number }>} lines
 */
export function linesToSrt(lines) {
  return lines
    .map((line, i) => {
      const idx = line.index ?? i + 1;
      return `${idx}\n${formatSrtTimestamp(line.startSec)} --> ${formatSrtTimestamp(line.endSec)}\n${line.text}\n`;
    })
    .join('\n');
}

/**
 * @param {Array<{ index?: number, text: string, startSec: number, endSec: number }>} lines
 */
export function linesToVtt(lines) {
  const body = lines
    .map((line) => `${formatVttTimestamp(line.startSec)} --> ${formatVttTimestamp(line.endSec)}\n${line.text}`)
    .join('\n\n');
  return `WEBVTT\n\n${body}\n`;
}

/**
 * @param {number} sec
 */
function formatVttTimestamp(sec) {
  const totalMs = Math.max(0, Math.round(sec * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/**
 * @param {object} scriptDraft
 * @param {object} videoPlan
 */
export function estimateVideoDurationSec(scriptDraft, videoPlan) {
  const scenes = Array.isArray(videoPlan?.scenes)
    ? videoPlan.scenes
    : Array.isArray(scriptDraft?.scenes)
      ? scriptDraft.scenes
      : [];
  const fromScenes = scenes.reduce((sum, s) => sum + (Number(s?.durationSec) || 0), 0);
  if (fromScenes > 0) return fromScenes;
  return 30;
}

/**
 * @param {object} scriptDraft
 * @param {object} videoPlan
 */
export function resolveVoiceoverText(scriptDraft, videoPlan) {
  const fromScript = typeof scriptDraft?.voiceoverCopy === 'string' ? scriptDraft.voiceoverCopy.trim() : '';
  if (fromScript) return fromScript;
  const fromPlan = typeof videoPlan?.script === 'string' ? videoPlan.script.trim() : '';
  if (fromPlan) return fromPlan;
  const hook = typeof scriptDraft?.hook === 'string' ? scriptDraft.hook.trim() : '';
  return hook || 'Creative video';
}
