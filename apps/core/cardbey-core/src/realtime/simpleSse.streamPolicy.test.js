import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('simpleSse stream policy', () => {
  const prevNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.SSE_STREAM_KEY;
    delete process.env.TV_STREAM_KEY;
  });

  afterEach(() => {
    process.env.NODE_ENV = prevNodeEnv;
    vi.resetModules();
  });

  it('blocks legacy admin key in production', async () => {
    process.env.NODE_ENV = 'production';
    const { handleSse } = await import('./simpleSse.js');

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      setHeader: vi.fn(),
      write: vi.fn(),
      flushHeaders: vi.fn(),
    };
    const req = {
      query: { key: 'admin' },
      headers: {
        origin: 'https://cardbey.com',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
      },
      socket: null,
    };

    handleSse(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'legacy_admin_key_disabled' }),
    );
  });

  it('accepts legacy admin key in development', async () => {
    process.env.NODE_ENV = 'development';
    const { handleSse } = await import('./simpleSse.js');

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      setHeader: vi.fn(),
      write: vi.fn(),
      flushHeaders: vi.fn(),
      flush: vi.fn(),
    };
    const noop = vi.fn(() => {});
    const req = {
      query: { key: 'admin' },
      headers: {
        origin: 'http://localhost:5174',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
      },
      socket: { setKeepAlive: vi.fn(), setTimeout: vi.fn() },
      once: noop,
      on: noop,
    };
    res.once = noop;
    res.on = noop;

    handleSse(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining(': connected'));
  });
});
