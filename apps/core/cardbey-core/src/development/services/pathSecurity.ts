/**
 * Safe path resolution inside a development workspace.
 */

import path from 'node:path';
import fs from 'node:fs';
import { cardbeyRepositoryManifest } from '../repositories/cardbeyRepositoryManifest.js';
import { DevelopmentError } from '../errors.js';

const MAX_FILE_BYTES = 512 * 1024;

export function resolveWorkspaceRelativePath(workspaceRoot: string, relativePath: string): string {
  const normalized = String(relativePath ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('..')) {
    throw new DevelopmentError(400, 'FORBIDDEN_PATH', 'Path traversal rejected');
  }

  const abs = path.resolve(workspaceRoot, normalized);
  const rootResolved = path.resolve(workspaceRoot);
  if (!abs.startsWith(rootResolved + path.sep) && abs !== rootResolved) {
    throw new DevelopmentError(400, 'FORBIDDEN_PATH', 'Path escapes workspace root');
  }

  for (const forbidden of cardbeyRepositoryManifest.forbiddenPaths) {
    const segment = normalized.split('/').some((part) => part === forbidden || part.startsWith('.env.'));
    if (
      segment ||
      normalized === forbidden ||
      normalized.startsWith(`${forbidden}/`) ||
      normalized.includes(`/${forbidden}/`)
    ) {
      throw new DevelopmentError(400, 'FORBIDDEN_PATH', `Forbidden path: ${forbidden}`);
    }
  }

  const allowed = cardbeyRepositoryManifest.allowedRoots.some(
    (root) => normalized === root || normalized.startsWith(`${root}/`),
  );
  if (!allowed) {
    throw new DevelopmentError(400, 'FORBIDDEN_PATH', `Path not in allowed roots: ${normalized}`);
  }

  return abs;
}

export async function readWorkspaceFile(workspaceRoot: string, relativePath: string): Promise<string> {
  const abs = resolveWorkspaceRelativePath(workspaceRoot, relativePath);
  const stat = await fs.promises.stat(abs);
  if (!stat.isFile()) {
    throw new DevelopmentError(404, 'FILE_NOT_FOUND', `Not a file: ${relativePath}`);
  }
  if (stat.size > MAX_FILE_BYTES) {
    throw new DevelopmentError(413, 'FILE_TOO_LARGE', `File exceeds ${MAX_FILE_BYTES} bytes`);
  }
  return fs.promises.readFile(abs, 'utf-8');
}

export async function writeWorkspaceFile(
  workspaceRoot: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const abs = resolveWorkspaceRelativePath(workspaceRoot, relativePath);
  await fs.promises.mkdir(path.dirname(abs), { recursive: true });
  await fs.promises.writeFile(abs, content, 'utf-8');
}

export function isElevatedPath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/');
  return cardbeyRepositoryManifest.elevatedReviewPaths.some(
    (p) => normalized === p || normalized.startsWith(`${p}/`),
  );
}
