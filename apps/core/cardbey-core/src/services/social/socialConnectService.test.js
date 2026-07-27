import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

describe('socialConnectService', () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env.FACEBOOK_APP_ID = 'fb-app';
    process.env.FACEBOOK_REDIRECT_URI = 'http://localhost:3001/api/oauth/facebook/callback';
    process.env.ZALO_APP_ID = 'zalo-app';
    process.env.ZALO_APP_SECRET = 'zalo-secret';
    process.env.ZALO_REDIRECT_URI = 'http://localhost:3001/api/oauth/zalo/callback';
  });

  afterEach(() => {
    process.env = { ...env };
    vi.resetModules();
  });

  it('buildMetaOAuthUrl includes client_id and instagram-capable scopes', async () => {
    const { buildMetaOAuthUrl, META_FB_SCOPES } = await import('./socialConnectService.js');
    const url = buildMetaOAuthUrl({ userId: 'u1', platform: 'instagram' });
    expect(url).toContain('client_id=fb-app');
    expect(url).toContain('instagram_content_publish');
    expect(META_FB_SCOPES).toContain('pages_manage_posts');
  });

  it('buildZaloOAuthUrl points at Zalo permission endpoint', async () => {
    const { buildZaloOAuthUrl } = await import('./socialConnectService.js');
    const url = buildZaloOAuthUrl({ userId: 'u1' });
    expect(url).toContain('oauth.zaloapp.com/v4/permission');
    expect(url).toContain('app_id=zalo-app');
  });

  it('facebookConfigured and zaloConfigured reflect env', async () => {
    const { facebookConfigured, zaloConfigured } = await import('./socialConnectService.js');
    expect(facebookConfigured()).toBe(true);
    expect(zaloConfigured()).toBe(true);

    delete process.env.ZALO_APP_SECRET;
    vi.resetModules();
    const mod = await import('./socialConnectService.js');
    expect(mod.zaloConfigured()).toBe(false);
  });
});
