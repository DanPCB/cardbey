/**
 * Prepare a mission-local Kimi Code CLI profile without copying credentials.
 *
 * Each Development Runtime mission receives its own KIMI_CODE_HOME, but it is
 * intentionally placed OUTSIDE the mission worktree. The mission-local home
 * contains only disposable runtime state (sessions, logs, telemetry). Provider
 * credentials remain in the long-lived parent/global Kimi profile and are
 * referenced through a symlink to the parent config.toml.
 *
 * This ensures:
 *   - API keys and OAuth tokens never enter .development-workspaces/dev-*
 *   - credentials/ directory is never copied
 *   - device authentication secrets stay in the parent profile
 *   - mission-local sessions/logs are isolated per mission
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DevelopmentError } from '../../errors.js';

export interface KimiMissionProfile {
  /** Mission-local KIMI_CODE_HOME passed to the Kimi subprocess. */
  kimiHome: string;
  /** Long-lived parent Kimi profile that owns credentials. */
  parentHome: string;
  /** Root directory for this mission's disposable Kimi state. */
  missionStateRoot: string;
  defaultModel: string;
  providerName: string;
}

/**
 * Create a mission-local Kimi home that symlinks the parent's config.toml.
 *
 * The provider api_key stays in the parent config file; it is not read,
 * printed, or written into the mission-local directory.
 */
export async function prepareKimiMissionProfile(
  workspaceRoot: string,
  missionId: string,
): Promise<KimiMissionProfile> {
  const parentHome = process.env.KIMI_CODE_HOME || path.join(os.homedir(), '.kimi-code');
  const parentConfigPath = path.join(parentHome, 'config.toml');

  let parentConfig: string;
  try {
    parentConfig = await fs.promises.readFile(parentConfigPath, 'utf-8');
  } catch {
    throw new DevelopmentError(
      500,
      'KIMI_PARENT_CONFIG_MISSING',
      `Cannot read parent Kimi config at ${parentConfigPath}. Run \`kimi login\` first.`,
    );
  }

  const defaultModel = readTomlString(parentConfig, 'default_model');
  if (!defaultModel) {
    throw new DevelopmentError(
      500,
      'KIMI_PARENT_CONFIG_INVALID',
      'Parent Kimi config is missing default_model.',
    );
  }

  const providerMatch = parentConfig.match(/\[providers\.([^\]]+)\]/);
  const providerName = providerMatch?.[1];
  if (!providerName) {
    throw new DevelopmentError(
      500,
      'KIMI_PARENT_CONFIG_INVALID',
      'Parent Kimi config has no [providers.*] section.',
    );
  }

  // Mission-local state lives under the parent Kimi home so it inherits the
  // parent's gitignore and stays outside the mission worktree.
  const missionStateRoot = path.join(parentHome, 'cardbey-mission-homes', missionId);
  const kimiHome = path.join(missionStateRoot, '.kimi-code-home');
  await fs.promises.mkdir(kimiHome, { recursive: true });

  // Reference the parent config via symlink. The api_key remains in the parent
  // file and is never copied into the mission-local home.
  const missionConfigPath = path.join(kimiHome, 'config.toml');
  try {
    await fs.promises.symlink(parentConfigPath, missionConfigPath, 'file');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'EEXIST') {
      throw new DevelopmentError(
        500,
        'KIMI_SYMLINK_FAILED',
        `Failed to symlink parent Kimi config into mission home: ${(err as Error).message}`,
      );
    }
  }

  // Defense-in-depth: ensure no credential directory was copied from parent.
  const credentialDir = path.join(kimiHome, 'credentials');
  if (fs.existsSync(credentialDir)) {
    throw new DevelopmentError(
      500,
      'KIMI_CREDENTIAL_LEAK',
      'Mission-local Kimi home unexpectedly contains a credentials directory.',
    );
  }

  // Exclude from the mission worktree's git as well, in case any future path
  // accidentally points inside the worktree.
  await excludeKimiHomeFromGit(workspaceRoot);

  return { kimiHome, parentHome, missionStateRoot, defaultModel, providerName };
}

function readTomlString(section: string, key: string): string | undefined {
  const pattern = new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, 'm');
  const match = section.match(pattern);
  return match?.[1];
}

async function excludeKimiHomeFromGit(workspaceRoot: string): Promise<void> {
  const gitInfoDir = path.join(workspaceRoot, '.git', 'info');
  const excludePath = path.join(gitInfoDir, 'exclude');

  try {
    await fs.promises.mkdir(gitInfoDir, { recursive: true });
    let existing = '';
    try {
      existing = await fs.promises.readFile(excludePath, 'utf-8');
    } catch {
      /* exclude file may not exist yet */
    }
    const entry = '.kimi-code-home/';
    if (!existing.split('\n').includes(entry)) {
      const updated = existing ? `${existing}\n${entry}\n` : `${entry}\n`;
      await fs.promises.writeFile(excludePath, updated, 'utf-8');
    }
  } catch {
    /* Best-effort exclusion. The mission-local home is outside the worktree
       anyway, so this is defense-in-depth. */
  }
}
