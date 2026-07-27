/**
 * Swappable TTS provider for video voiceover (env: TTS_PROVIDER, TTS_API_KEY).
 */

import fs from 'fs';
import path from 'path';
import { createTempPath, safeUnlink } from '../../tempFiles.js';

/** @typedef {{ id: string, label: string }} VoicePreset */

export const VOICE_PRESETS = {
  warm: { id: 'warm', label: 'Warm' },
  professional: { id: 'professional', label: 'Professional' },
  energetic: { id: 'energetic', label: 'Energetic' },
};

const OPENAI_VOICE_MAP = {
  warm: 'nova',
  professional: 'onyx',
  energetic: 'echo',
  friendly: 'nova',
};

/**
 * @param {string | null | undefined} brandTone
 * @returns {keyof typeof VOICE_PRESETS}
 */
export function mapBrandToneToVoicePreset(brandTone) {
  const t = String(brandTone ?? '').trim().toLowerCase();
  if (t.includes('profession') || t.includes('formal')) return 'professional';
  if (t.includes('energet') || t.includes('fun') || t.includes('bold')) return 'energetic';
  if (t.includes('warm') || t.includes('friend')) return 'warm';
  return 'warm';
}

/**
 * @returns {'mock' | 'openai' | null}
 */
export function resolveTtsProvider(env = process.env) {
  const explicit = String(env.TTS_PROVIDER ?? '').trim().toLowerCase();
  if (explicit === 'mock' || explicit === 'openai') return explicit;
  if (String(env.TTS_API_KEY ?? env.OPENAI_API_KEY ?? '').trim()) return 'openai';
  if (env.NODE_ENV === 'test') return 'mock';
  return null;
}

/**
 * @param {{
 *   text: string,
 *   voicePreset?: string,
 *   scenes?: Array<{ shot?: string; durationSec?: number }>,
 * }} opts
 * @returns {Promise<{ ok: boolean, audioPath?: string, segments?: Array<{ path: string, durationSec?: number }>, error?: string }>}
 */
export async function synthesizeVoiceover(opts) {
  const provider = resolveTtsProvider();
  const preset = String(opts.voicePreset ?? 'warm').trim().toLowerCase();
  const scenes = Array.isArray(opts.scenes) ? opts.scenes : [];
  const lines =
    scenes.length > 0
      ? scenes.map((s) => String(s.shot ?? '').trim()).filter(Boolean)
      : [String(opts.text ?? '').trim()].filter(Boolean);

  if (!lines.length) {
    return { ok: false, error: 'empty_script' };
  }

  if (!provider) {
    return { ok: false, error: 'tts_not_configured' };
  }

  if (provider === 'mock') {
    return synthesizeMockVoiceover(lines);
  }

  return synthesizeOpenAiVoiceover(lines, preset);
}

async function synthesizeMockVoiceover(lines) {
  const outPath = createTempPath('cardbey-vo-', '.wav');
  try {
    const { default: ffmpegStatic } = await import('ffmpeg-static');
    const { spawn } = await import('child_process');
    const duration = Math.max(2, lines.join(' ').length * 0.08);
    await new Promise((resolve, reject) => {
      const args = [
        '-y',
        '-f',
        'lavfi',
        '-i',
        `sine=frequency=440:duration=${duration}`,
        '-ac',
        '1',
        '-ar',
        '44100',
        outPath,
      ];
      const proc = spawn(ffmpegStatic, args, { stdio: 'ignore' });
      proc.on('error', reject);
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`mock tts ffmpeg exit ${code}`))));
    });
    return { ok: true, audioPath: outPath, segments: [{ path: outPath, durationSec: duration }] };
  } catch (e) {
    await safeUnlink(outPath);
    return { ok: false, error: e?.message ?? String(e) };
  }
}

async function synthesizeOpenAiVoiceover(lines, preset) {
  const apiKey = String(process.env.TTS_API_KEY ?? process.env.OPENAI_API_KEY ?? '').trim();
  if (!apiKey) return { ok: false, error: 'missing_tts_api_key' };

  const voice = OPENAI_VOICE_MAP[preset] ?? OPENAI_VOICE_MAP.warm;
  const text = lines.join(' ');
  const outPath = createTempPath('cardbey-vo-', '.mp3');

  try {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.TTS_OPENAI_MODEL ?? 'tts-1',
        voice,
        input: text.slice(0, 4096),
        response_format: 'mp3',
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI TTS ${res.status}: ${errText.slice(0, 200)}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.promises.writeFile(outPath, buf);
    return { ok: true, audioPath: outPath, segments: [{ path: outPath }] };
  } catch (e) {
    await safeUnlink(outPath);
    return { ok: false, error: e?.message ?? String(e) };
  }
}
