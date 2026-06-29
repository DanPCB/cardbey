import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { resolveSseStreamAuth } from '../sseStreamAuth.js';

describe('resolveSseStreamAuth', () => {
  const prevEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    delete process.env.SSE_STREAM_KEY;
    delete process.env.TV_STREAM_KEY;
  });

  afterEach(() => {
    process.env.NODE_ENV = prevEnv;
  });

  it('allows agent-chat when missionId is present (streamToken verified upstream)', () => {
    const req = {
      query: {
        key: 'agent-chat',
        missionId: 'mission-abc',
        streamToken: 'eyJhbGci.test',
      },
    };
    expect(resolveSseStreamAuth(req)).toEqual({
      ok: true,
      clientKey: 'agent-chat',
      authMode: 'stream-token',
      missionId: 'mission-abc',
    });
  });

  it('rejects agent-chat without missionId', () => {
    const req = { query: { key: 'agent-chat', streamToken: 'tok' } };
    expect(resolveSseStreamAuth(req)).toEqual({ ok: false, error: 'mission_id_required' });
  });

  it('still rejects unknown keys in production', () => {
    const req = { query: { key: 'not-a-real-key' } };
    expect(resolveSseStreamAuth(req)).toEqual({ ok: false, error: 'unauthorized_stream' });
  });
});
