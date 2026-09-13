import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { prepareKimiMissionProfile } from '../services/coding/kimiMissionProfile.js';
import { DevelopmentError } from '../errors.js';

describe('kimiMissionProfile', () => {
  let workspaceRoot: string;
  let parentHome: string;
  let originalKimiHome: string | undefined;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cardbey-kimi-profile-'));
    parentHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cardbey-kimi-parent-'));
    originalKimiHome = process.env.KIMI_CODE_HOME;
    process.env.KIMI_CODE_HOME = parentHome;

    fs.writeFileSync(
      path.join(parentHome, 'config.toml'),
      'default_model = "moonshot-ai/kimi-k2.7-code"\n\n[providers.moonshot-ai]\ntype = "kimi"\nbase_url = "https://api.moonshot.ai/v1"\napi_key = "test-api-key"\n',
      'utf-8',
    );
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(parentHome, { recursive: true, force: true });
    if (originalKimiHome === undefined) {
      delete process.env.KIMI_CODE_HOME;
    } else {
      process.env.KIMI_CODE_HOME = originalKimiHome;
    }
  });

  it('creates mission-local Kimi home outside the worktree', async () => {
    const profile = await prepareKimiMissionProfile(workspaceRoot, 'dev-mission-001');
    expect(profile.parentHome).toBe(parentHome);
    expect(profile.missionStateRoot).toBe(
      path.join(parentHome, 'cardbey-mission-homes', 'dev-mission-001'),
    );
    expect(profile.kimiHome).toBe(
      path.join(parentHome, 'cardbey-mission-homes', 'dev-mission-001', '.kimi-code-home'),
    );
    expect(profile.kimiHome.startsWith(workspaceRoot)).toBe(false);
  });

  it('references parent config via symlink instead of copying api_key', async () => {
    const profile = await prepareKimiMissionProfile(workspaceRoot, 'dev-mission-002');
    const missionConfigPath = path.join(profile.kimiHome, 'config.toml');

    expect(fs.lstatSync(missionConfigPath).isSymbolicLink()).toBe(true);
    expect(fs.realpathSync(missionConfigPath)).toBe(path.join(parentHome, 'config.toml'));

    // The mission-local file should be readable through the symlink, but the
    // api_key bytes remain in the parent file.
    const missionConfig = fs.readFileSync(missionConfigPath, 'utf-8');
    expect(missionConfig).toContain('api_key = "test-api-key"');
  });

  it('does not copy credentials directory into mission-local home', async () => {
    // Create a credentials directory in the parent to confirm it is not copied.
    fs.mkdirSync(path.join(parentHome, 'credentials'), { recursive: true });
    fs.writeFileSync(
      path.join(parentHome, 'credentials', 'kimi-code.json'),
      '{"access_token":"secret"}',
      'utf-8',
    );

    const profile = await prepareKimiMissionProfile(workspaceRoot, 'dev-mission-003');
    expect(fs.existsSync(path.join(profile.kimiHome, 'credentials'))).toBe(false);
  });

  it('produces isolated state roots per mission', async () => {
    const profileA = await prepareKimiMissionProfile(workspaceRoot, 'dev-mission-a');
    const profileB = await prepareKimiMissionProfile(workspaceRoot, 'dev-mission-b');
    expect(profileA.missionStateRoot).not.toBe(profileB.missionStateRoot);
  });

  it('excludes .kimi-code-home from worktree git via .git/info/exclude', async () => {
    await prepareKimiMissionProfile(workspaceRoot, 'dev-mission-004');
    const excludePath = path.join(workspaceRoot, '.git', 'info', 'exclude');
    const exclude = fs.readFileSync(excludePath, 'utf-8');
    expect(exclude).toContain('.kimi-code-home/');
  });

  it('throws when parent config is missing', async () => {
    fs.rmSync(path.join(parentHome, 'config.toml'));

    let err: unknown;
    try {
      await prepareKimiMissionProfile(workspaceRoot, 'dev-mission-005');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(DevelopmentError);
    expect((err as DevelopmentError).code).toBe('KIMI_PARENT_CONFIG_MISSING');
  });
});
