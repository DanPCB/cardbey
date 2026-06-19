#!/usr/bin/env node
/** @deprecated Use resolve-legacy-baseline.mjs — init migration is one of many db-push collisions. */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = ['--apply', ...process.argv.slice(2).filter((a) => a !== '--apply')];
if (!args.includes('--deploy')) args.push('--deploy');

const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'resolve-legacy-baseline.mjs'), ...args], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
});
process.exit(r.status ?? 1);
