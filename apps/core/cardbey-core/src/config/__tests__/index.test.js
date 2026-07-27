import { describe, expect, it, vi, afterEach } from 'vitest';

describe('config.performer.defaultMode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('defaults to automation', async () => {
    const { config } = await import('../index.js');
    expect(config.performer.defaultMode).toBe('automation');
  });

  it('reads PERFORMER_DEFAULT_MODE from env', async () => {
    vi.stubEnv('PERFORMER_DEFAULT_MODE', 'manual');
    vi.resetModules();
    const { config } = await import('../index.js');
    expect(config.performer.defaultMode).toBe('manual');
  });

  it('falls back to automation for invalid env values', async () => {
    vi.stubEnv('PERFORMER_DEFAULT_MODE', 'invalid');
    vi.resetModules();
    const { config } = await import('../index.js');
    expect(config.performer.defaultMode).toBe('automation');
  });
});
