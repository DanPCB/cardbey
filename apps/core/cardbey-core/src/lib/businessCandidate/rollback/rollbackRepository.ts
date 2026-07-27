/**
 * RollbackJob + RollbackAuditEvent persistence (JSON).
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RollbackAuditEvent, RollbackJob } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

function storeRoot(): string {
  return (
    process.env.BUSINESS_CANDIDATE_DIR ||
    path.join(CORE_ROOT, 'data', 'businessCandidates')
  );
}

function jobsFile(): string {
  return path.join(storeRoot(), 'rollback-jobs.json');
}

function auditFile(): string {
  return path.join(storeRoot(), 'rollback-audit.json');
}

let writeChain: Promise<unknown> = Promise.resolve();

async function readJobs(): Promise<RollbackJob[]> {
  try {
    return JSON.parse(await fs.readFile(jobsFile(), 'utf8')) as RollbackJob[];
  } catch {
    return [];
  }
}

async function readAudit(): Promise<RollbackAuditEvent[]> {
  try {
    return JSON.parse(await fs.readFile(auditFile(), 'utf8')) as RollbackAuditEvent[];
  } catch {
    return [];
  }
}

async function writeJobs(rows: RollbackJob[]): Promise<void> {
  const file = jobsFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(rows, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

async function writeAudit(rows: RollbackAuditEvent[]): Promise<void> {
  const file = auditFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(rows, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

export function newRollbackJobId(): string {
  return randomUUID();
}

export async function saveRollbackJob(job: RollbackJob): Promise<RollbackJob> {
  const all = await readJobs();
  const idx = all.findIndex((j) => j.id === job.id);
  if (idx >= 0) all[idx] = job;
  else all.push(job);
  const op = writeChain.then(() => writeJobs(all));
  writeChain = op.catch(() => undefined);
  await op;
  return job;
}

export async function getRollbackJobById(id: string): Promise<RollbackJob | null> {
  return (await readJobs()).find((j) => j.id === id) ?? null;
}

export async function listRollbackJobs(limit = 50): Promise<RollbackJob[]> {
  const all = await readJobs();
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

export async function appendRollbackAuditEvent(
  event: Omit<RollbackAuditEvent, 'id' | 'createdAt'>,
): Promise<RollbackAuditEvent> {
  const row: RollbackAuditEvent = {
    ...event,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  const all = await readAudit();
  all.push(row);
  const op = writeChain.then(() => writeAudit(all));
  writeChain = op.catch(() => undefined);
  await op;
  return row;
}

export async function listRollbackAuditForJob(jobId: string): Promise<RollbackAuditEvent[]> {
  return (await readAudit()).filter((e) => e.rollbackJobId === jobId);
}

export async function resetRollbackDataForTests(): Promise<void> {
  const op = writeChain.then(async () => {
    await writeJobs([]);
    await writeAudit([]);
  });
  writeChain = op.catch(() => undefined);
  await op;
}
