/**
 * Bounded monorepo tree listing for code-fix LLM context (no file contents).
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * @returns {string}
 */
export function getMonorepoRoot() {
  if (process.env.CARDBEY_MONOREPO_ROOT) {
    return path.resolve(process.env.CARDBEY_MONOREPO_ROOT);
  }
  // Default: apps/core/cardbey-core → repo root
  return path.resolve(process.cwd(), '../../..');
}

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__']);

/**
 * @param {{ maxLines?: number, maxDepth?: number }} [opts]
 * @returns {string}
 */
export function buildRepoLayoutSnippet(opts = {}) {
  const maxLines = typeof opts.maxLines === 'number' ? opts.maxLines : 160;
  const maxDepth = typeof opts.maxDepth === 'number' ? opts.maxDepth : 3;
  const root = getMonorepoRoot();
  const lines = [];

  /**
   * @param {string} dir
   * @param {number} depth
   */
  function walk(dir, depth) {
    if (lines.length >= maxLines || depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (lines.length >= maxLines) break;
      if (SKIP.has(e.name)) continue;
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      const rel = path.relative(root, full).replace(/\\/g, '/');
      if (e.isDirectory()) {
        lines.push(`${rel}/`);
        walk(full, depth + 1);
      } else if (depth <= 2 && /\.(ts|tsx|js|jsx|mjs|cjs|json|prisma)$/.test(e.name)) {
        lines.push(rel);
      }
    }
  }

  try {
    walk(root, 0);
  } catch {
    return '(layout unavailable)';
  }
  return lines.length ? lines.join('\n') : '(empty layout)';
}
