/**
 * Run dev/start commands with ROLE set — avoids broken pnpm .bin shims on Windows
 * (e.g. cross-env not on PATH when tools live under node_modules/.ignored).
 *
 * Usage:
 *   node scripts/with-role.mjs dev-api
 *   node scripts/with-role.mjs dev-worker
 *   node scripts/with-role.mjs start-api
 *   node scripts/with-role.mjs start-worker
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function resolveTool(packageName, ...segments) {
  const bases = [
    path.join(root, 'node_modules', packageName),
    path.join(root, 'node_modules', '.ignored', packageName),
  ];
  for (const base of bases) {
    const p = path.join(base, ...segments);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function quoteWin(p) {
  if (process.platform !== 'win32') return p;
  if (!/[\s"]/.test(p)) return p;
  return `"${String(p).replace(/"/g, '\\"')}"`;
}

function run(role, command, args, opts = {}) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ROLE: role },
    ...opts,
  });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
}

const cmd = process.argv[2];

if (cmd === 'dev-api') {
  const nodemon = resolveTool('nodemon', 'bin', 'nodemon.js');
  const tsxCli = resolveTool('tsx', 'dist', 'cli.mjs');
  if (!nodemon || !tsxCli) {
    console.error(
      '[with-role] nodemon or tsx not found under node_modules. Run: pnpm install (from monorepo root recommended).',
    );
    process.exit(1);
  }
  const devEntry = path.join(root, 'scripts', 'dev-api-entry.mjs');
  const execStr = [
    quoteWin(process.execPath),
    '--import',
    'tsx',
    quoteWin(devEntry),
  ].join(' ');
  run('api', process.execPath, [
    nodemon,
    '--watch',
    'src',
    '--ext',
    'js,mjs,cjs,json,ts',
    '--exec',
    execStr,
  ]);
} else if (cmd === 'dev-worker') {
  const nodemon = resolveTool('nodemon', 'bin', 'nodemon.js');
  if (!nodemon) {
    console.error('[with-role] nodemon not found. Run: pnpm install');
    process.exit(1);
  }
  run('worker', process.execPath, [nodemon, '--watch', 'src', '--ext', 'js,mjs,cjs,json', 'src/worker.js']);
} else if (cmd === 'start-api') {
  run('api', process.execPath, ['--import', 'tsx', 'src/server.js']);
} else if (cmd === 'start-worker') {
  run('worker', process.execPath, ['src/worker.js']);
} else {
  console.error(
    '[with-role] Unknown command. Use: dev-api | dev-worker | start-api | start-worker',
  );
  process.exit(1);
}
