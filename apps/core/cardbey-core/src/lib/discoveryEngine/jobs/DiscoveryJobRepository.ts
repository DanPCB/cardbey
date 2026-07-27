/**
 * Discovery job persistence — Postgres on Render/live; JSON file fallback for local dev only.
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../../prisma.js';
import {
  resolveDiscoveryJobBackend,
  resetDiscoveryJobBackendCacheForTests,
} from './discoveryJobBackend.js';
import type { DiscoveryJob, DiscoveryJobStatus } from '../types/index.js';

export { resetDiscoveryJobBackendCacheForTests };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

function storeDir(): string {
  return process.env.DISCOVERY_ENGINE_DIR || path.join(CORE_ROOT, 'data', 'discoveryEngine');
}

function jobsFile(): string {
  return path.join(storeDir(), 'jobs.json');
}

let writeChain: Promise<unknown> = Promise.resolve();

function jobFromDb(row: {
  id: string;
  provider: string;
  region: string | null;
  category: string | null;
  status: string;
  recordsFound: number;
  recordsAccepted: number;
  recordsRejected: number;
  startedAt: Date;
  completedAt: Date | null;
  error: string | null;
  paramsJson: string;
}): DiscoveryJob {
  let params: Record<string, unknown> = {};
  try {
    params = JSON.parse(row.paramsJson || '{}') as Record<string, unknown>;
  } catch {
    params = {};
  }
  return {
    id: row.id,
    provider: row.provider as DiscoveryJob['provider'],
    region: row.region,
    category: row.category,
    status: row.status as DiscoveryJobStatus,
    recordsFound: row.recordsFound,
    recordsAccepted: row.recordsAccepted,
    recordsRejected: row.recordsRejected,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    error: row.error,
    params,
  };
}

async function readJobsFile(): Promise<DiscoveryJob[]> {
  try {
    const buf = await fs.readFile(jobsFile(), 'utf8');
    return JSON.parse(buf) as DiscoveryJob[];
  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
    if (code === 'ENOENT') return [];
    console.warn('[discoveryJobRepository] read failed:', err);
    return [];
  }
}

async function writeJobsFile(jobs: DiscoveryJob[]): Promise<void> {
  const dir = storeDir();
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.jobs.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(jobs, null, 2), 'utf8');
  await fs.rename(tmp, jobsFile());
}

export function createDiscoveryJob(
  partial: Pick<DiscoveryJob, 'provider' | 'region' | 'category' | 'params'>,
): DiscoveryJob {
  return {
    id: randomUUID(),
    provider: partial.provider,
    region: partial.region,
    category: partial.category,
    status: 'pending',
    recordsFound: 0,
    recordsAccepted: 0,
    recordsRejected: 0,
    startedAt: new Date().toISOString(),
    completedAt: null,
    error: null,
    params: partial.params,
  };
}

export async function appendDiscoveryJob(job: DiscoveryJob): Promise<void> {
  const backend = await resolveDiscoveryJobBackend();

  if (backend === 'db') {
    await prisma.discoveryEngineJob.create({
      data: {
        id: job.id,
        provider: job.provider,
        region: job.region,
        category: job.category,
        status: job.status,
        recordsFound: job.recordsFound,
        recordsAccepted: job.recordsAccepted,
        recordsRejected: job.recordsRejected,
        startedAt: new Date(job.startedAt),
        completedAt: job.completedAt ? new Date(job.completedAt) : null,
        error: job.error,
        paramsJson: JSON.stringify(job.params ?? {}),
      },
    });
    return;
  }

  writeChain = writeChain.then(async () => {
    const jobs = await readJobsFile();
    jobs.unshift(job);
    await writeJobsFile(jobs.slice(0, 500));
  });
  await writeChain;
}

export async function updateDiscoveryJob(
  id: string,
  patch: Partial<
    Pick<
      DiscoveryJob,
      | 'status'
      | 'recordsFound'
      | 'recordsAccepted'
      | 'recordsRejected'
      | 'completedAt'
      | 'error'
    >
  >,
): Promise<DiscoveryJob | null> {
  const backend = await resolveDiscoveryJobBackend();

  if (backend === 'db') {
    try {
      const row = await prisma.discoveryEngineJob.update({
        where: { id },
        data: {
          status: patch.status,
          recordsFound: patch.recordsFound,
          recordsAccepted: patch.recordsAccepted,
          recordsRejected: patch.recordsRejected,
          completedAt: patch.completedAt ? new Date(patch.completedAt) : undefined,
          error: patch.error,
        },
      });
      return jobFromDb(row);
    } catch {
      return null;
    }
  }

  let updated: DiscoveryJob | null = null;
  writeChain = writeChain.then(async () => {
    const jobs = await readJobsFile();
    const idx = jobs.findIndex((j) => j.id === id);
    if (idx < 0) return;
    updated = { ...jobs[idx], ...patch };
    jobs[idx] = updated;
    await writeJobsFile(jobs);
  });
  await writeChain;
  return updated;
}

export async function listDiscoveryJobs(limit = 50): Promise<DiscoveryJob[]> {
  const backend = await resolveDiscoveryJobBackend();

  if (backend === 'db') {
    const rows = await prisma.discoveryEngineJob.findMany({
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
    return rows.map(jobFromDb);
  }

  const jobs = await readJobsFile();
  return jobs.slice(0, limit);
}

export async function setJobStatus(id: string, status: DiscoveryJobStatus): Promise<void> {
  await updateDiscoveryJob(id, { status });
}
