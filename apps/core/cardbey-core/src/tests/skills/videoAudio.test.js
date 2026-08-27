import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execute as videoAudioExecute } from '../../lib/toolExecutors/video/video_audio.js';

const probeSpy = vi.fn();
const ttsSpy = vi.fn();
const muxSpy = vi.fn();
const musicSpy = vi.fn();
const persistSpy = vi.fn();

vi.mock('../../lib/video/audio/videoAudioProbe.js', () => ({
  probeVideoUrlForAudio: (...args) => probeSpy(...args),
  fileHasAudioStream: vi.fn(async () => true),
  resolveLocalVideoPath: vi.fn(() => null),
  getMediaDurationSec: vi.fn(async () => 4),
  probeMediaStreams: vi.fn(async () => ({
    hasAudio: true,
    audioStreamCount: 1,
    videoStreamCount: 1,
    durationSec: 4,
  })),
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

vi.mock('../../lib/video/postProduction/persistSidecar.js', () => ({
  persistCaptionSidecar: (...args) => persistSpy(...args),
}));

vi.mock('../../lib/missionBlackboard.js', () => ({
  appendEvent: vi.fn(async () => ({})),
}));

const basePlan = {
  schema: 'video_plan_v1',
  script: 'Welcome to our store. Visit us today.',
  voiceover: 'Welcome to our store. Visit us today.',
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

describe('video_audio post-processing (canonical service)', () => {
  beforeEach(() => {
    probeSpy.mockReset();
    ttsSpy.mockReset();
    muxSpy.mockReset();
    musicSpy.mockReset();
    persistSpy.mockReset();
    persistSpy.mockResolvedValue({ ok: true, publicPath: '/uploads/media/captions.vtt' });
  });

  it('does not skip TTS when native audio exists and narration is required', async () => {
    probeSpy.mockResolvedValue({ hasAudio: true, localPath: '/tmp/v.mp4', downloaded: false });
    ttsSpy.mockResolvedValue({ ok: true, audioPath: '/tmp/vo.wav' });
    musicSpy.mockResolvedValue({ ok: false, error: 'music_not_configured' });
    muxSpy.mockResolvedValue({ ok: true, outputPath: '/tmp/out.mp4', publicPath: '/uploads/media/final.mp4' });

    const result = await videoAudioExecute({
      plan: basePlan,
      videoOutput: { videoUrl: '/uploads/media/silent.mp4', silentVideoUrl: '/uploads/media/silent.mp4' },
    });

    expect(result.status).toBe('ok');
    expect(result.output.hasAudio).toBe(true);
    expect(result.output.audioSource).toBe('tts_mux');
    expect(ttsSpy).toHaveBeenCalled();
    expect(muxSpy).toHaveBeenCalled();
  });

  it('muxes TTS, writes WebVTT, and delivers audio', async () => {
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
    expect(result.output.captionUrl).toBe('/uploads/media/captions.vtt');
    expect(result.output.captionMode).toBe('sidecar');
    expect(persistSpy).toHaveBeenCalled();
    expect(ttsSpy).toHaveBeenCalledWith(expect.objectContaining({ voicePreset: 'energetic' }));
  });

  it('TTS failure fails closed when narration is required', async () => {
    probeSpy.mockResolvedValue({ hasAudio: false, localPath: '/tmp/v.mp4', downloaded: true });
    ttsSpy.mockResolvedValue({ ok: false, error: 'tts_not_configured' });

    const result = await videoAudioExecute({
      plan: basePlan,
      videoOutput: { videoUrl: 'https://cdn.example.com/v.mp4' },
    });

    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('VIDEO_REQUIRED_AUDIO_MISSING');
    expect(result.output.hasAudio).toBe(false);
    expect(muxSpy).not.toHaveBeenCalled();
  });

  it('explicit silent request succeeds without TTS', async () => {
    const result = await videoAudioExecute({
      plan: { ...basePlan, audio: { voiceoverEnabled: false, musicEnabled: false, silentRequested: true } },
      videoOutput: { videoUrl: '/uploads/media/silent.mp4' },
    });

    expect(result.status).toBe('ok');
    expect(result.output.reason).toBe('silent_requested');
    expect(result.output.hasAudio).toBe(false);
    expect(ttsSpy).not.toHaveBeenCalled();
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

    expect(ttsSpy).toHaveBeenCalledWith(expect.objectContaining({ voicePreset: 'professional' }));
    expect(musicSpy).not.toHaveBeenCalled();
  });
});
