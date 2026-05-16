/**
 * Apply string replace patches only under monorepo paths that include a `src` segment.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getMonorepoRoot } from './repoLayoutSnippet.js';

/**
 * @param {string} relPath
 * @returns {string | null} absolute path or null if disallowed
 */
export function resolveAllowedSrcRepoPath(relPath) {
  const root = getMonorepoRoot();
  const raw = String(relPath || '').trim().replace(/\\/g, '/');
  if (!raw || raw.includes('\0')) return null;

  const normalizedInput = path.normalize(raw);
  const joined = path.resolve(root, normalizedInput);
  if (!joined.startsWith(root)) return null;

  const relToRoot = path.relative(root, joined);
  const parts = relToRoot.split(path.sep);
  if (!parts.includes('src')) return null;

  return joined;
}

/**
 * @param {{ filePath: string, oldStr: string, newStr: string }} input
 */
export function prepareSrcPatch(input) {
  const filePath = String(input.filePath || '').trim();
  const oldStr = typeof input.oldStr === 'string' ? input.oldStr : '';
  const newStr = typeof input.newStr === 'string' ? input.newStr : '';

  const abs = resolveAllowedSrcRepoPath(filePath);
  if (!abs) {
    const err = new Error('INVALID_OR_DISALLOWED_PATH');
    err.code = 'INVALID_PATH';
    throw err;
  }
  if (!oldStr) {
    const err = new Error('oldStr is required');
    err.code = 'INVALID_OLD_STR';
    throw err;
  }

  let content;
  try {
    content = fs.readFileSync(abs, 'utf8');
  } catch (e) {
    const err = new Error(`READ_FAILED: ${e?.message || e}`);
    err.code = 'READ_FAILED';
    throw err;
  }

  let count = 0;
  let idx = 0;
  while (true) {
    const j = content.indexOf(oldStr, idx);
    if (j < 0) break;
    count += 1;
    idx = j + oldStr.length;
  }
  if (count !== 1) {
    const err = new Error(`oldStr must appear exactly once in file (found ${count})`);
    err.code = 'OLD_STR_NOT_UNIQUE';
    throw err;
  }

  const next = content.replace(oldStr, newStr);
  const linesChanged = Math.max(oldStr.split('\n').length, newStr.split('\n').length);

  return {
    abs,
    displayPath: path.relative(getMonorepoRoot(), abs).replace(/\\/g, '/'),
    prev: content,
    next,
    linesChanged,
  };
}

/**
 * @param {{ filePath: string, oldStr: string, newStr: string }} input
 */
export function previewSrcPatch(input) {
  return prepareSrcPatch(input);
}

/**
 * @param {{ filePath: string, oldStr: string, newStr: string }} input
 * @returns {{ ok: boolean, applied: boolean, filePath: string, linesChanged: number }}
 */
export function applySrcPatchWrite(input) {
  if (process.env.NODE_ENV === 'production') {
    const err = new Error('Not available in production');
    err.code = 'PRODUCTION';
    throw err;
  }
  const prep = prepareSrcPatch(input);
  fs.writeFileSync(prep.abs, prep.next, 'utf8');
  return {
    ok: true,
    applied: true,
    filePath: prep.displayPath,
    linesChanged: prep.linesChanged,
  };
}
