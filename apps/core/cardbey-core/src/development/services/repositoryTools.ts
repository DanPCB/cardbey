/**
 * Controlled repository inspection tools (workspace-scoped).
 */

import fs from 'node:fs';
import path from 'node:path';
import { readWorkspaceFile, resolveWorkspaceRelativePath } from './pathSecurity.js';
import { showGitDiff } from './workspaceWorktree.js';

export async function listRepositoryDirectory(
  workspaceRoot: string,
  relativeDir: string,
): Promise<{ entries: Array<{ name: string; type: 'file' | 'dir' }> }> {
  const abs = resolveWorkspaceRelativePath(workspaceRoot, relativeDir);
  const entries = await fs.promises.readdir(abs, { withFileTypes: true });
  return {
    entries: entries.map((e) => ({
      name: e.name,
      type: e.isDirectory() ? 'dir' : 'file',
    })),
  };
}

export async function searchRepository(
  workspaceRoot: string,
  query: string,
  relativeRoot = 'apps/dashboard/cardbey-marketing-dashboard/src',
): Promise<{ matches: Array<{ file: string; line: number; text: string }> }> {
  const absRoot = resolveWorkspaceRelativePath(workspaceRoot, relativeRoot);
  const matches: Array<{ file: string; line: number; text: string }> = [];
  const q = query.toLowerCase();

  async function walk(dir: string, rel: string): Promise<void> {
    const items = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const item of items) {
      if (item.name === 'node_modules' || item.name === 'dist') continue;
      const itemAbs = path.join(dir, item.name);
      const itemRel = path.posix.join(rel.replace(/\\/g, '/'), item.name);
      if (item.isDirectory()) {
        await walk(itemAbs, itemRel);
        continue;
      }
      if (!/\.(tsx?|jsx?|js)$/.test(item.name)) continue;
      const content = await fs.promises.readFile(itemAbs, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (line.toLowerCase().includes(q)) {
          matches.push({ file: itemRel, line: idx + 1, text: line.trim().slice(0, 200) });
        }
      });
    }
  }

  await walk(absRoot, relativeRoot.replace(/\\/g, '/'));
  return { matches: matches.slice(0, 100) };
}

export { readWorkspaceFile as readRepositoryFile };

export async function inspectGitStatus(workspaceRoot: string): Promise<string> {
  const diff = await showGitDiff(workspaceRoot);
  return diff || 'clean';
}

export { showGitDiff };
