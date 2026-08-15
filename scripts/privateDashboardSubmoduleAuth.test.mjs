import { describe, expect, it } from 'vitest';
import {
  buildGithubHttpsInsteadOfUrl,
  redactGithubTokenUrl,
  shouldInitDashboardSubmodule,
  validateSubmoduleToken,
} from './privateDashboardSubmoduleAuth.mjs';

describe('privateDashboardSubmoduleAuth', () => {
  it('disables submodule init by default (no clone path)', () => {
    expect(shouldInitDashboardSubmodule({})).toBe(false);
    expect(shouldInitDashboardSubmodule({ CARDBEY_INIT_DASHBOARD_SUBMODULE: 'false' })).toBe(false);
  });

  it('enables submodule init only when explicitly true', () => {
    expect(shouldInitDashboardSubmodule({ CARDBEY_INIT_DASHBOARD_SUBMODULE: 'true' })).toBe(true);
  });

  it('fail-fast when init enabled without token', () => {
    const result = validateSubmoduleToken({ CARDBEY_INIT_DASHBOARD_SUBMODULE: 'true' });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/CARDBEY_SUBMODULE_TOKEN/);
    expect(result.message).toMatch(/GITHUB_SUBMODULE_TOKEN/);
    expect(result.message).toMatch(/Private dashboard source is unavailable/);
  });

  it('accepts CARDBEY_SUBMODULE_TOKEN as the Actions-legal name', () => {
    const result = validateSubmoduleToken({ CARDBEY_SUBMODULE_TOKEN: 'test-token-not-a-secret' });
    expect(result.ok).toBe(true);
    expect(result.token).toBe('test-token-not-a-secret');
  });

  it('applies authenticated URL rewrite without requiring a real secret', () => {
    const fake = 'test-token-not-a-secret';
    const insteadOf = buildGithubHttpsInsteadOfUrl(fake);
    expect(insteadOf).toBe(`https://x-access-token:${fake}@github.com/`);
    expect(redactGithubTokenUrl(insteadOf)).toBe('https://x-access-token:***@github.com/');
    expect(redactGithubTokenUrl(insteadOf)).not.toContain(fake);
  });
});
