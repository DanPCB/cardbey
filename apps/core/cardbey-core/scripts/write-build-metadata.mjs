#!/usr/bin/env node
/**
 * Write deploy truth artifact consumed at runtime by deployMetadata.js.
 * Called from npm run build and render-build.mjs.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outPath = path.join(root, 'data', 'build-metadata.json');

function resolveCommitSha() {
  const fromEnv =
    process.env.RENDER_GIT_COMMIT?.trim() ||
    process.env.GIT_COMMIT?.trim() ||
    process.env.COMMIT_SHA?.trim();
  if (fromEnv) return fromEnv;

  const monorepoRoot = path.resolve(root, '../../..');
  for (const cwd of [root, monorepoRoot]) {
    try {
      return execSync('git rev-parse HEAD', { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      /* try next root */
    }
  }
  return 'unknown';
}

const metadata = {
  commitSha: resolveCommitSha(),
  buildTime: process.env.BUILD_TIME?.trim() || new Date().toISOString(),
  writtenAt: new Date().toISOString(),
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(metadata, null, 2)}\n`);
console.log(`[write-build-metadata] commit=${metadata.commitSha.slice(0, 12)} buildTime=${metadata.buildTime}`);
