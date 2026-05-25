#!/usr/bin/env node
/**
 * Cross-platform entry for Cardbey dev cleanup.
 * Windows: delegates to dev-cleanup.ps1
 * Unix: stops matching Cardbey dev node processes
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findCoreDevProcesses, findDashboardDevProcesses } from './dev-process-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ps1 = path.join(__dirname, 'dev-cleanup.ps1');

if (process.platform === 'win32') {
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1];
  if (process.argv.includes('--force') || process.argv.includes('-Force')) {
    args.push('-Force');
  }
  if (process.argv.includes('--what-if') || process.argv.includes('-WhatIf')) {
    args.push('-WhatIf');
  }
  const r = spawnSync('powershell', args, { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

const force = process.argv.includes('--force');
const whatIf = process.argv.includes('--what-if');

const targets = [
  ...findCoreDevProcesses(),
  ...findDashboardDevProcesses(),
].filter((p) => p.pid !== process.pid);

if (targets.length === 0) {
  console.log('No Cardbey dev node processes found.');
  process.exit(0);
}

console.log(`Found ${targets.length} Cardbey dev process(es):`);
for (const t of targets) {
  console.log(`  PID ${t.pid} [${t.kind}]`);
}

if (whatIf) {
  console.log('WhatIf: no processes stopped.');
  process.exit(0);
}

if (!force) {
  console.error('Pass --force to stop these processes (non-interactive on Unix).');
  process.exit(1);
}

for (const t of targets) {
  try {
    process.kill(t.pid, 'SIGTERM');
    console.log(`Stopped PID ${t.pid}`);
  } catch (e) {
    console.warn(`Could not stop PID ${t.pid}:`, e instanceof Error ? e.message : e);
  }
}
