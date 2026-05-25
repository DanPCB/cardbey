/**
 * Cross-platform helpers for local dev doctor / runway guards.
 * Windows: PowerShell Get-NetTCPConnection + CIM CommandLine.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CORE_DIR, DASHBOARD_DIR } from './dev-constants.mjs';

/**
 * @param {number} port
 * @returns {{ pid: number, state: string }[]}
 */
export function getPortListeners(port) {
  if (process.platform === 'win32') {
    try {
      const script = [
        `$c = Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue`,
        `| Where-Object { $_.State -eq 'Listen' }`,
        `| Select-Object -Property OwningProcess, State`,
        `| Sort-Object OwningProcess -Unique`,
        `if ($c) { $c | ConvertTo-Json -Compress }`,
      ].join(' ');
      const out = execSync(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      if (!out) return [];
      const parsed = JSON.parse(out);
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      return rows
        .filter((r) => r && r.OwningProcess != null && Number(r.OwningProcess) > 0)
        .map((r) => ({ pid: Number(r.OwningProcess), state: String(r.State || '') }));
    } catch {
      return [];
    }
  }

  try {
    const out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN 2>/dev/null || true`, {
      encoding: 'utf8',
    });
    const pids = new Set();
    for (const line of out.split('\n').slice(1)) {
      const parts = line.trim().split(/\s+/);
      if (parts[1]) pids.add(Number(parts[1]));
    }
    return [...pids].map((pid) => ({ pid, state: 'Listen' }));
  } catch {
    return [];
  }
}

/**
 * @param {number} pid
 * @returns {string}
 */
export function getProcessCommandLine(pid) {
  if (!pid || pid <= 0) return '';
  if (process.platform === 'win32') {
    try {
      const script = `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" -ErrorAction SilentlyContinue).CommandLine`;
      return execSync(`powershell -NoProfile -Command "${script}"`, { encoding: 'utf8' }).trim();
    } catch {
      return '';
    }
  }
  try {
    return execSync(`ps -p ${pid} -o args= 2>/dev/null || true`, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

/**
 * @returns {{ pid: number, cmd: string }[]}
 */
export function listNodeProcesses() {
  if (process.platform === 'win32') {
    try {
      const script = [
        `Get-CimInstance Win32_Process -Filter "name='node.exe'" -ErrorAction SilentlyContinue`,
        `| Select-Object ProcessId, CommandLine`,
        `| ConvertTo-Json -Compress`,
      ].join(' ');
      const out = execSync(`powershell -NoProfile -Command "${script}"`, { encoding: 'utf8' }).trim();
      if (!out) return [];
      const parsed = JSON.parse(out);
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      return rows
        .filter((r) => r?.ProcessId)
        .map((r) => ({ pid: Number(r.ProcessId), cmd: String(r.CommandLine || '') }));
    } catch {
      return [];
    }
  }

  try {
    const out = execSync('ps -ax -o pid=,command= 2>/dev/null | grep -i node || true', {
      encoding: 'utf8',
    });
    return out
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const m = line.match(/^(\d+)\s+(.*)$/);
        return m ? { pid: Number(m[1]), cmd: m[2] } : null;
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

const norm = (s) => s.replace(/\\/g, '/').toLowerCase();

/**
 * Cardbey Core API dev processes (nodemon, dev-api-entry, direct server in core dir).
 * @returns {{ pid: number, cmd: string, kind: string }[]}
 */
export function findCoreDevProcesses() {
  const coreNorm = norm(CORE_DIR);
  const hits = [];

  for (const { pid, cmd } of listNodeProcesses()) {
    const c = norm(cmd);
    if (!c.includes('cardbey') && !c.includes(norm(path.join('apps', 'core', 'cardbey-core')))) {
      continue;
    }
    if (!c.includes(coreNorm) && !c.includes('cardbey-core')) continue;

    let kind = 'cardbey-core-node';
    if (c.includes('dev-api-entry.mjs')) kind = 'dev-api-entry';
    else if (c.includes('with-role.mjs') && c.includes('dev-api')) kind = 'with-role-dev-api';
    else if (c.includes('nodemon') && c.includes('cardbey-core')) kind = 'nodemon';
    else if (c.includes('src/server.js') || c.includes('server.js')) kind = 'server';
    else if (c.includes('test-auth-local')) kind = 'test-auth-local';
    else if (c.includes('prisma') && c.includes('generate')) kind = 'prisma-generate';

    hits.push({ pid, cmd: cmd.slice(0, 200), kind });
  }

  return hits;
}

/**
 * Vite / dashboard dev processes.
 * @returns {{ pid: number, cmd: string, kind: string }[]}
 */
export function findDashboardDevProcesses() {
  const dashNorm = norm(DASHBOARD_DIR);
  const hits = [];

  for (const { pid, cmd } of listNodeProcesses()) {
    const c = norm(cmd);
    if (!c.includes('vite') && !c.includes('cardbey-marketing-dashboard')) continue;
    if (!c.includes(dashNorm) && !c.includes('cardbey-marketing-dashboard')) continue;

    let kind = 'vite';
    if (c.includes('vite')) kind = 'vite';
    hits.push({ pid, cmd: cmd.slice(0, 200), kind });
  }

  return hits;
}

/**
 * @param {string} envPath
 * @returns {Record<string, string>}
 */
export function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/**
 * @param {string | undefined} url
 */
export function maskDatabaseUrl(url) {
  if (!url) return '(not set)';
  const u = String(url).trim();
  if (u.startsWith('file:')) {
    const filePart = u.slice(5).split('?')[0];
    const base = path.basename(filePart);
    return `file:***/${base}`;
  }
  try {
    const parsed = new URL(u.replace(/^prisma\+postgres:\/\//, 'postgres://'));
    const host = parsed.hostname || 'host';
    const port = parsed.port ? `:${parsed.port}` : '';
    return `${parsed.protocol}//${host}${port}/***`;
  } catch {
    return '(set, redacted)';
  }
}

/**
 * Heuristic: Prisma query engine likely locked (Windows EPERM).
 * @param {string} clientGenDir
 */
export function assessPrismaLockRisk(clientGenDir) {
  if (!fs.existsSync(clientGenDir)) {
    return { locked: false, detail: 'client-gen dir missing (generate will create it)' };
  }

  const engines = fs.readdirSync(clientGenDir).filter((f) => f.includes('query-engine') || f.includes('query_engine'));
  if (engines.length === 0) {
    return { locked: false, detail: 'no query engine binary yet' };
  }

  const tmpLeftovers = fs.readdirSync(clientGenDir).filter((f) => f.includes('.tmp'));
  let lockSuspected = tmpLeftovers.length > 0;

  for (const name of engines) {
    const full = path.join(clientGenDir, name);
    try {
      const fd = fs.openSync(full, 'r+');
      fs.closeSync(fd);
    } catch (err) {
      if (err && (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES')) {
        lockSuspected = true;
      }
    }
  }

  return {
    locked: lockSuspected,
    detail: lockSuspected
      ? `engine lock suspected (${tmpLeftovers.length} .tmp file(s); close extra node processes)`
      : 'engine files appear writable',
  };
}
