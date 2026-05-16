/**
 * Dev API entry: run Prisma bootstrap only on the first nodemon child start.
 * Nodemon keeps the same process as parent; restarts spawn a new child with the same ppid,
 * so we detect restarts via a small cache keyed by process.ppid (the nodemon PID).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const statePath = path.join(rootDir, 'node_modules', '.cache', 'nodemon-dev-bootstrap.json');
const ppid = process.ppid;

let isRestart = false;
try {
  if (fs.existsSync(statePath)) {
    const prev = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (prev && typeof prev.ppid === 'number' && prev.ppid === ppid) {
      isRestart = true;
    }
  }
} catch {
  /* treat as first start */
}

if (!isRestart) {
  const bootstrap = path.join(rootDir, 'scripts', 'prisma-bootstrap.js');
  const r = spawnSync(process.execPath, ['--import', 'tsx', bootstrap], {
    cwd: rootDir,
    stdio: 'inherit',
    env: { ...process.env },
  });
  if (r.status !== 0 && r.status != null) {
    process.exit(r.status);
  }
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify({ ppid, t: Date.now() }));
  } catch {
    /* non-fatal */
  }
} else {
  console.log('[prisma] nodemon restart — skipping prisma bootstrap');
}

await import('../src/server.js');
