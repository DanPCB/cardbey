#!/usr/bin/env node
// Delegates to monorepo canonical truth enforcer at scripts/truth-enforcer/index.mjs

import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../../..');
const rootScript = path.join(repoRoot, 'scripts', 'truth-enforcer', 'index.mjs');

const result = spawnSync(process.execPath, [rootScript, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: repoRoot,
});

process.exit(result.status ?? 1);
