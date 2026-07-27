/**
 * BusinessIngestionRunRepository — Postgres-backed run history with JSON fallback (local only).
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../prisma.js';
import {
  resolveIngestionRunBackend,
  resetIngestionRunBackendCacheForTests,
} from './businessIngestionRunBackend.js';
import {
  dbRowToRunRecord,
  metricsToRunRecord,
  runRecordToDbRow,
  runRecordToMetrics,
  summarizeRunRecord,
  type IngestionRunRecord,
  type IngestionRunStatus,
} from './businessIngestionRunMapper.js';
import type { IngestionRunMetrics } from './types.js';

export { resetIngestionRunBackendCacheForTests };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '..', '..', '..');

function storeDir(): string {
  return process.env.BUSINESS_INGESTION_DIR || path.join(CORE_ROOT, 'data', 'businessIngestion');
}

function runsFile(): string {
  return path.join(storeDir(), 'runs.json');
}

let writeChain: Promise<unknown> = Promise.resolve();

async function readRunsFile(): Promise<IngestionRunRecord[]> {
  try {
    const buf = await fs.readFile(runsFile(), 'utf8');
    const parsed = JSON.parse(buf) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => {
      if (item && typeof item === 'object' && 'runId' in item) {
        return metricsToRunRecord(item as IngestionRunMetrics);
      }
      return item as IngestionRunRecord;
    });
  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
    if (code === 'ENOENT') return [];
    console.warn('[businessIngestionRunRepository] read failed:', err);
    return [];
  }
}

async function writeRunsFile(runs: IngestionRunRecord[]): Promise<void> {
  const dir = storeDir();
  await fs.mkdir(dir, { recursive: true });
  const metrics = runs.slice(-200).map(runRecordToMetrics);
  const tmp = path.join(dir, `.runs.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(metrics, null, 2), 'utf8');
  await fs.rename(tmp, runsFile());
}

async function upsertRunRecord(record: IngestionRunRecord): Promise<void> {
  const backend = await resolveIngestionRunBackend();
  if (backend === 'db') {
    await prisma.businessIngestionRun.upsert({
      where: { id: record.id },
      create: runRecordToDbRow(record),
      update: runRecordToDbRow(record),
    });
    return;
  }

  const op = writeChain.then(async () => {
    const runs = await readRunsFile();
    const idx = runs.findIndex((r) => r.id === record.id);
    if (idx >= 0) runs[idx] = record;
    else runs.push(record);
    await writeRunsFile(runs);
  });
  writeChain = op.catch(() => undefined);
  await op;
}

export async function createRun(
  partial: Pick<IngestionRunRecord, 'source' | 'status' | 'startedAt'> &
    Partial<
      Pick<
        IngestionRunRecord,
        | 'id'
        | 'completedAt'
        | 'candidateCount'
        | 'seedCount'
        | 'duplicateCount'
        | 'rejectedCount'
        | 'errorCount'
        | 'errors'
        | 'metadata'
      >
    >,
): Promise<IngestionRunRecord> {
  const record: IngestionRunRecord = {
    id: partial.id ?? randomUUID(),
    source: partial.source,
    status: partial.status,
    startedAt: partial.startedAt,
    completedAt: partial.completedAt ?? null,
    candidateCount: partial.candidateCount ?? 0,
    seedCount: partial.seedCount ?? 0,
    duplicateCount: partial.duplicateCount ?? 0,
    rejectedCount: partial.rejectedCount ?? 0,
    errorCount: partial.errorCount ?? 0,
    errors: partial.errors ?? [],
    metadata: partial.metadata ?? {},
  };
  await upsertRunRecord(record);
  return record;
}

export async function updateRun(
  id: string,
  patch: Partial<
    Pick<
      IngestionRunRecord,
      | 'status'
      | 'completedAt'
      | 'candidateCount'
      | 'seedCount'
      | 'duplicateCount'
      | 'rejectedCount'
      | 'errorCount'
      | 'errors'
      | 'metadata'
    >
  >,
): Promise<IngestionRunRecord | null> {
  const existing = await getRun(id);
  if (!existing) return null;

  const merged: IngestionRunRecord = {
    ...existing,
    ...patch,
    metadata: { ...existing.metadata, ...(patch.metadata ?? {}) },
  };
  await upsertRunRecord(merged);
  return merged;
}

export async function getRun(id: string): Promise<IngestionRunRecord | null> {
  const backend = await resolveIngestionRunBackend();
  if (backend === 'db') {
    const row = await prisma.businessIngestionRun.findUnique({ where: { id } });
    return row ? dbRowToRunRecord(row) : null;
  }

  const runs = await readRunsFile();
  return runs.find((r) => r.id === id) ?? null;
}

export async function listRuns(limit = 50): Promise<IngestionRunRecord[]> {
  const backend = await resolveIngestionRunBackend();
  if (backend === 'db') {
    const rows = await prisma.businessIngestionRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
    return rows.map(dbRowToRunRecord);
  }

  const runs = await readRunsFile();
  return runs.slice(-limit).reverse();
}

export async function appendError(
  id: string,
  message: string,
): Promise<IngestionRunRecord | null> {
  const existing = await getRun(id);
  if (!existing) return null;

  const errors = [...existing.errors, { message, at: new Date().toISOString() }];
  return updateRun(id, {
    errors,
    errorCount: errors.length,
    status: 'failed',
  });
}

export function summarizeRun(record: IngestionRunRecord) {
  return summarizeRunRecord(record);
}

export async function appendIngestionRunMetrics(
  metrics: IngestionRunMetrics,
  options?: { status?: IngestionRunStatus },
): Promise<void> {
  const record = metricsToRunRecord(metrics, options?.status);
  await upsertRunRecord(record);
}

export async function listIngestionRunMetrics(limit = 50): Promise<IngestionRunMetrics[]> {
  const records = await listRuns(limit);
  return records.map(runRecordToMetrics);
}

export async function backfillIngestionRun(
  metrics: IngestionRunMetrics,
): Promise<'inserted' | 'updated' | 'skipped'> {
  const record = metricsToRunRecord(metrics);
  const backend = await resolveIngestionRunBackend();
  if (backend !== 'db') return 'skipped';

  const existing = await prisma.businessIngestionRun.findUnique({ where: { id: record.id } });
  if (existing) {
    await prisma.businessIngestionRun.update({
      where: { id: record.id },
      data: runRecordToDbRow(record),
    });
    return 'updated';
  }
  await prisma.businessIngestionRun.create({ data: runRecordToDbRow(record) });
  return 'inserted';
}

export async function resetIngestionRunsForTests(): Promise<void> {
  resetIngestionRunBackendCacheForTests();
  const backend = await resolveIngestionRunBackend();
  if (backend === 'db') {
    await prisma.businessIngestionRun.deleteMany({});
    return;
  }

  const op = writeChain.then(async () => {
    await writeRunsFile([]);
  });
  writeChain = op.catch(() => undefined);
  await op;
}

export async function recordDiscoveryIngestionRun(params: {
  discoveryJobId: string;
  provider: string;
  startedAt: string;
  completedAt: string;
  candidatesFound: number;
  seedsCreated: number;
  seedsUpdated: number;
  duplicatesRejected: number;
  status?: IngestionRunStatus;
  error?: string | null;
}): Promise<void> {
  const seedCount = params.seedsCreated + params.seedsUpdated;
  await createRun({
    id: params.discoveryJobId,
    source: params.provider,
    status:
      params.status ??
      (params.error ? 'failed' : seedCount > 0 || params.candidatesFound === 0 ? 'completed' : 'empty'),
    startedAt: params.startedAt,
    completedAt: params.completedAt,
    candidateCount: params.candidatesFound,
    seedCount,
    duplicateCount: params.duplicatesRejected,
    rejectedCount: Math.max(0, params.candidatesFound - seedCount - params.duplicatesRejected),
    errorCount: params.error ? 1 : 0,
    errors: params.error ? [{ message: params.error, at: params.completedAt }] : [],
    metadata: {
      discoveryJobId: params.discoveryJobId,
      provider: params.provider,
      origin: 'discovery-engine',
    },
  });
}
