/**
 * Mirror workspace file changes into repo root so checks can run with node_modules.
 * No-op when workspace is already the repo root.
 *
 * Every relative path is validated through the workspace path-security layer
 * before touching canonical repo paths.
 */

import fs from 'node:fs';
import path from 'node:path';
import { cardbeyRepositoryManifest } from '../repositories/cardbeyRepositoryManifest.js';
import { resolveWorkspaceRelativePath } from './pathSecurity.js';

export async function mirrorWorkspaceFilesForChecks(
  workspaceRoot: string,
  relativePaths: string[],
): Promise<string[]> {
  const repoRoot = path.resolve(cardbeyRepositoryManifest.repoRoot);
  const wsRoot = path.resolve(workspaceRoot);
  if (wsRoot === repoRoot) return [];

  const mirrored: string[] = [];
  for (const rel of relativePaths) {
    const normalized = rel.replace(/\\/g, '/');

    // Validate the path before copying out of the worktree. This ensures only
    // allowed, non-traversing, non-forbidden paths reach the canonical repo.
    resolveWorkspaceRelativePath(workspaceRoot, normalized);

    const src = path.join(wsRoot, normalized);
    const dest = path.join(repoRoot, normalized);
    if (!fs.existsSync(src)) continue;
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    await fs.promises.copyFile(src, dest);
    mirrored.push(normalized);
  }
  return mirrored;
}
