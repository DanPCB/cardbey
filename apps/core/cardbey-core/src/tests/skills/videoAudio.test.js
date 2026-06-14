// DANH: video-audio-post-process
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execute as videoAudioExecute } from '../../lib/toolExecutors/video/video_audio.js';

const probeSpy = vi.fn();
const ttsSpy = vi.fn();
const muxSpy = vi.fn();
const musicSpy = vi.fn();

vi.mock('../../lib/video/audio/videoAudioProbe.js', () => ({
  probeVideoUrlForAudio: (...args) => probeSpy(...args),
  fileHasAudioStream: vi.fn(async () => true),
  resolveLocalVideoPath: vi.fn(() => null),
}));

vi.mock('../../lib/video/audio/ttsProvider.js', () => ({
  mapBrandToneToVoicePreset: (t) => (String(t).includes('energet') ? 'energetic' : 'warm'),
  synthesizeVoiceover: (...args) => ttsSpy(...args),
}));

vi.mock('../../lib/video/audio/musicBed.js', () => ({
  fetchMusicBedIfConfigured: (...args) => musicSpy(...args),
}));

vi.mock('../../lib/video/audio/videoAudioMux.js', () => ({
  muxAudioIntoVideo: (...args) => muxSpy(...args),
}));

vi.mock('../../lib/missionBlackboard.js', () => ({
  appendEvent: vi.fn(async () => ({})),
}));

const basePlan = {
  schema: 'video_plan_v1',
  script: 'Welcome to our store. Visit us today.',
  scenes: [{ id: 1, shot: 'Opening shot', durationSec: 3 }],
  style: 'promotional',
  mood: 'warm',
  duration: 30,
  audio: {
    voiceoverEnabled: true,
    musicEnabled: true,
    voicePreset: 'energetic',
  },
};

describe('video_audio post-processing', () => {
  beforeEach(() => {
    probeSpy.mockReset();
    ttsSpy.mockReset();
    muxSpy.mockReset();
    musicSpy.mockReset();
  });

  it('skips post-process when ffprobe finds native audio', async () => {
    probeSpy.mockResolvedValue({ hasAudio: true, localPath: '/tmp/v.mp4', downloaded: false });
    const result = await videoAudioExecute({
      plan: basePlan,
      videoOutput: { videoUrl: '/uploads/media/silent.mp4', silentVideoUrl: '/uploads/media/silent.mp4' },
    });
    expect(result.status).toBe('ok');
    expect(result.output.audioSource).toBe('native');
    expect(result.output.skippedPostProcess).toBe(true);
    expect(ttsSpy).not.toHaveBeenCalled();
    expect(muxSpy).not.toHaveBeenCalled();
  });

  it('muxes TTS and delivers audio (ffprobe has stream)', async () => {
    probeSpy.mockResolvedValue({ hasAudio: false, localPath: '/tmp/v.mp4', downloaded: true });
    ttsSpy.mockResolvedValue({ ok: true, audioPath: '/tmp/vo.wav' });
    musicSpy.mockResolvedValue({ ok: false, error: 'music_not_configured' });
    muxSpy.mockResolvedValue({ ok: true, outputPath: '/tmp/out.mp4', publicPath: '/uploads/media/final.mp4' });

    const result = await videoAudioExecute({
      plan: basePlan,
      videoOutput: { videoUrl: '/uploads/media/silent.mp4' },
    });

    expect(result.status).toBe('ok');
    expect(result.output.hasAudio).toBe(true);
    expect(result.output.videoUrl).toBe('/uploads/media/final.mp4');
    expect(result.output.silentVideoUrl).toBe('/uploads/media/silent.mp4');
    expect(ttsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ voicePreset: 'energetic' }),
    );
    expect(muxSpy).toHaveBeenCalled();
  });

  it('TTS failure returns silent video with warning — mission ok', async () => {
    probeSpy.mockResolvedValue({ hasAudio: false, localPath: '/tmp/v.mp4', downloaded: true });
    ttsSpy.mockResolvedValue({ ok: false, error: 'tts_not_configured' });

    const result = await videoAudioExecute({
      plan: basePlan,
      videoOutput: { videoUrl: 'https://cdn.example.com/v.mp4' },
    });

    expect(result.status).toBe('ok');
    expect(result.output.fallbackSilent).toBe(true);
    expect(result.output.audioWarning).toBe('Audio unavailable');
    expect(result.output.videoUrl).toBe('https://cdn.example.com/v.mp4');
    expect(muxSpy).not.toHaveBeenCalled();
  });

  it('passes edited plan audio prefs to TTS', async () => {
    probeSpy.mockResolvedValue({ hasAudio: false, localPath: '/tmp/v.mp4', downloaded: true });
    ttsSpy.mockResolvedValue({ ok: true, audioPath: '/tmp/vo.wav' });
    musicSpy.mockResolvedValue({ ok: false });
    muxSpy.mockResolvedValue({ ok: true, publicPath: '/uploads/media/final.mp4', outputPath: '/tmp/out.mp4' });

    const editedPlan = {
      ...basePlan,
      audio: { voiceoverEnabled: true, musicEnabled: false, voicePreset: 'professional' },
    };

    await videoAudioExecute({
      approvedPlan: editedPlan,
      videoOutput: { videoUrl: '/uploads/media/silent.mp4' },
    });

    expect(ttsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ voicePreset: 'professional' }),
    );
    expect(musicSpy).not.toHaveBeenCalled();
  });
});
