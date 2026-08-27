/**
 * Captions derived from the approved narration script (not a second rewrite).
 * Timing is aligned to TTS duration / scene durations.
 */

import { linesToSrt, linesToVtt } from '../../factoryRuntime/creativeFactoryV3Subtitle.js';

/**
 * @param {{
 *   narrationText: string,
 *   totalDurationSec?: number,
 *   scenes?: Array<{ shot?: string, durationSec?: number }>,
 *   ttsSegments?: Array<{ durationSec?: number, text?: string }>,
 * }} opts
 * @returns {Array<{ index: number, text: string, startSec: number, endSec: number }>}
 */
export function buildCaptionCuesFromNarration(opts = {}) {
  const narrationText = String(opts.narrationText ?? '').trim();
  const scenes = Array.isArray(opts.scenes) ? opts.scenes : [];
  const ttsSegments = Array.isArray(opts.ttsSegments) ? opts.ttsSegments : [];
  const totalDurationSec = Math.max(0.5, Number(opts.totalDurationSec) || 0);

  if (ttsSegments.length > 0 && ttsSegments.every((s) => Number(s.durationSec) > 0)) {
    let cursor = 0;
    return ttsSegments.map((seg, i) => {
      const dur = Number(seg.durationSec) || 0;
      const startSec = cursor;
      const endSec = cursor + dur;
      cursor = endSec;
      return {
        index: i + 1,
        text: String(seg.text ?? '').trim() || cueTextFallback(narrationText, i, ttsSegments.length),
        startSec: Number(startSec.toFixed(3)),
        endSec: Number(endSec.toFixed(3)),
      };
    });
  }

  const sceneLines = scenes
    .map((s) => String(s?.shot ?? s?.voiceover ?? s?.text ?? '').trim())
    .filter(Boolean);
  const sentences = splitNarrationCues(narrationText);
  const lines = sceneLines.length > 1 ? sceneLines : sentences.length ? sentences : narrationText ? [narrationText] : [];
  if (!lines.length) return [];

  const sceneDurations = scenes.map((s) => Number(s?.durationSec) || 0);
  const sceneSum = sceneDurations.reduce((a, b) => a + b, 0);
  const duration = totalDurationSec || (sceneSum > 0 ? sceneSum : Math.max(2, lines.join(' ').length * 0.06));

  if (sceneLines.length === lines.length && sceneSum > 0) {
    let cursor = 0;
    const scale = duration / sceneSum;
    return lines.map((text, i) => {
      const dur = Math.max(0.4, (sceneDurations[i] || duration / lines.length) * scale);
      const startSec = cursor;
      const endSec = cursor + dur;
      cursor = endSec;
      return {
        index: i + 1,
        text,
        startSec: Number(startSec.toFixed(3)),
        endSec: Number(endSec.toFixed(3)),
      };
    });
  }

  const weights = lines.map((line) => Math.max(1, line.length));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  let cursor = 0;
  return lines.map((text, i) => {
    const dur = Math.max(0.4, (weights[i] / weightSum) * duration);
    const startSec = cursor;
    const endSec = i === lines.length - 1 ? duration : cursor + dur;
    cursor = endSec;
    return {
      index: i + 1,
      text,
      startSec: Number(startSec.toFixed(3)),
      endSec: Number(endSec.toFixed(3)),
    };
  });
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function splitNarrationCues(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return [];
  const parts = raw
    .split(/(?<=[.!?…])\s+|(?<=[。！？])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length <= 1 && raw.length > 90) {
    return wrapLongCue(raw, 72);
  }
  return parts.length ? parts : [raw];
}

/**
 * @param {Array<{ index: number, text: string, startSec: number, endSec: number }>} cues
 * @param {{ language?: string }} [opts]
 */
export function cuesToWebVtt(cues, opts = {}) {
  const language = opts.language === 'vi' ? 'vi' : 'en';
  const body = linesToVtt(cues);
  if (body.startsWith('WEBVTT')) {
    return body.replace(/^WEBVTT\n/, `WEBVTT\nLanguage: ${language}\n`);
  }
  return `WEBVTT\nLanguage: ${language}\n\n${body}`;
}

/**
 * @param {Array<{ index: number, text: string, startSec: number, endSec: number }>} cues
 */
export function cuesToSrt(cues) {
  return linesToSrt(cues);
}

function cueTextFallback(narrationText, index, total) {
  const parts = splitNarrationCues(narrationText);
  if (parts[index]) return parts[index];
  if (parts.length === 1) return parts[0];
  return parts[Math.min(index, Math.max(0, parts.length - 1))] || narrationText;
}

function wrapLongCue(text, maxLen) {
  const words = text.split(/\s+/);
  const lines = [];
  let buf = '';
  for (const w of words) {
    const next = buf ? `${buf} ${w}` : w;
    if (next.length > maxLen && buf) {
      lines.push(buf);
      buf = w;
    } else {
      buf = next;
    }
  }
  if (buf) lines.push(buf);
  return lines;
}
