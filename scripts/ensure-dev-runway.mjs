#!/usr/bin/env node
/**
 * Pre-dev guard: fail loudly before starting Core or Dashboard when runway is not clear.
 * Usage: node scripts/ensure-dev-runway.mjs --service=core|dashboard
 */
import net from 'node:net';
import {
  CORE_PORT,
  DASHBOARD_PORT,
  CORE_DIR,
  DASHBOARD_DIR,
  SQLITE_SCHEMA,
} from './dev-constants.mjs';
import {
  getPortListeners,
  getProcessCommandLine,
  findCoreDevProcesses,
  findDashboardDevProcesses,
} from './dev-process-utils.mjs';

const service = (() => {
  const arg = process.argv.find((a) => a.startsWith('--service='));
  if (arg) return arg.split('=')[1];
  const idx = process.argv.indexOf('--service');
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return null;
})();

if (!service || !['core', 'dashboard'].includes(service)) {
  console.error('Usage: node scripts/ensure-dev-runway.mjs --service=core|dashboard');
  process.exit(2);
}

/** @param {number} port */
function assertPortFree(port, label) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        const listeners = getPortListeners(port);
        const details = listeners
          .map((l) => {
            const cmd = getProcessCommandLine(l.pid);
            const short = cmd ? cmd.slice(0, 120) : '(unknown command)';
            return `  PID ${l.pid}: ${short}`;
          })
          .join('\n');
        reject(
          new Error(
            `${label} port ${port} is already in use.\n` +
              `Stop the existing process or run: pnpm dev:cleanup\n` +
              (details ? `Listeners:\n${details}` : ''),
          ),
        );
      } else {
        reject(err);
      }
    });
    server.once('listening', () => {
      server.close(() => resolve());
    });
    server.listen(port, '127.0.0.1');
  });
}

function assertSingleCoreDev() {
  const processes = findCoreDevProcesses().filter(
    (p) => p.kind !== 'prisma-generate' && p.kind !== 'test-auth-local',
  );
  const apiLike = processes.filter((p) =>
    ['dev-api-entry', 'with-role-dev-api', 'nodemon', 'server'].includes(p.kind),
  );

  if (apiLike.length === 0) return;

  const lines = apiLike.map((p) => `  PID ${p.pid} [${p.kind}]: ${p.cmd}`).join('\n');
  throw new Error(
    `Duplicate Cardbey Core dev process(es) detected (${apiLike.length}).\n` +
      `Only one Core API (nodemon + dev-api-entry) should run.\n` +
      `Run: pnpm dev:cleanup\n` +
      `Processes:\n${lines}`,
  );
}

function assertSingleDashboardDev() {
  const processes = findDashboardDevProcesses();
  if (processes.length === 0) return;

  const lines = processes.map((p) => `  PID ${p.pid} [${p.kind}]: ${p.cmd}`).join('\n');
  throw new Error(
    `Duplicate Cardbey Dashboard dev process(es) detected (${processes.length}).\n` +
      `Only one Vite dev server should run on port ${DASHBOARD_PORT}.\n` +
      `Run: pnpm dev:cleanup\n` +
      `Processes:\n${lines}`,
  );
}

try {
  if (service === 'core') {
    assertSingleCoreDev();
    await assertPortFree(CORE_PORT, 'Core API');
    if (!process.env.SKIP_DEV_SCHEMA_CHECK) {
      const fs = await import('node:fs');
      if (!fs.existsSync(SQLITE_SCHEMA)) {
        throw new Error(`SQLite schema not found: ${SQLITE_SCHEMA}`);
      }
    }
    console.log(`[dev-runway] Core OK — port ${CORE_PORT} free, no duplicate dev-api (${CORE_DIR})`);
  } else {
    assertSingleDashboardDev();
    await assertPortFree(DASHBOARD_PORT, 'Dashboard');
    console.log(
      `[dev-runway] Dashboard OK — port ${DASHBOARD_PORT} free, no duplicate Vite (${DASHBOARD_DIR})`,
    );
  }
} catch (err) {
  console.error(`\n❌ [dev-runway] Cannot start ${service}:\n`);
  console.error(err instanceof Error ? err.message : String(err));
  console.error('\nDiagnostics: pnpm dev:doctor\n');
  process.exit(1);
}
