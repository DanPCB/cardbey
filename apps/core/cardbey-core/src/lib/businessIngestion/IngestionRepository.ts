/**
 * Persistence for ingested seed records.
 * Postgres on Render/live; JSON file fallback for local dev / isolated tests.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IngestedSeedRecord, IngestionRunMetrics } from './types.js';
import { resolveBusinessSeedBackend, resetBusinessSeedBackendCacheForTests } from './businessSeedBackend.js';
import {
  appendIngestionRunMetrics,
  listIngestionRunMetrics,
  resetIngestionRunsForTests,
} from './BusinessIngestionRunRepository.js';
import { resetIngestionRunBackendCacheForTests } from './businessIngestionRunBackend.js';
import {
  dbGetSeedRecordById,
  dbListSeedRecords,
  dbResetSeedRecordsForTests,
  dbSaveSeedRecords,
  dbUpsertSeedRecords,
} from './businessSeedDbRepository.js';

export { resetBusinessSeedBackendCacheForTests };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '..', '..', '..');

function storeDir(): string {
  return (
    process.env.BUSINESS_INGESTION_DIR ||
    path.join(CORE_ROOT, 'data', 'businessIngestion')
  );
}

function seedsFile(): string {
  return path.join(storeDir(), 'seeds.json');
}

function runsFile(): string {
  return path.join(storeDir(), 'runs.json');
}

let writeChain: Promise<unknown> = Promise.resolve();

async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
  try {
    const buf = await fs.readFile(file, 'utf8');
    return JSON.parse(buf) as T;
  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
    if (code === 'ENOENT') return fallback;
    console.warn('[businessIngestionRepository] read failed:', err);
    return fallback;
  }
}

async function writeJsonFile(file: string, data: unknown): Promise<void> {
  const dir = storeDir();
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

async function fileListSeedRecords(): Promise<IngestedSeedRecord[]> {
  return readJsonFile<IngestedSeedRecord[]>(seedsFile(), []);
}

export async function listSeedRecords(): Promise<IngestedSeedRecord[]> {
  const backend = await resolveBusinessSeedBackend();
  if (backend === 'db') return dbListSeedRecords();
  return fileListSeedRecords();
}

export async function getSeedRecordById(id: string): Promise<IngestedSeedRecord | null> {
  const backend = await resolveBusinessSeedBackend();
  if (backend === 'db') return dbGetSeedRecordById(id);
  const all = await fileListSeedRecords();
  return all.find((s) => s.id === id) ?? null;
}

export async function saveSeedRecords(records: IngestedSeedRecord[]): Promise<void> {
  const backend = await resolveBusinessSeedBackend();
  if (backend === 'db') {
    await dbSaveSeedRecords(records);
    return;
  }

  const op = writeChain.then(() => writeJsonFile(seedsFile(), records));
  writeChain = op.catch(() => undefined);
  await op;
}

export async function upsertSeedRecords(incoming: IngestedSeedRecord[]): Promise<IngestedSeedRecord[]> {
  const backend = await resolveBusinessSeedBackend();
  if (backend === 'db') {
    return dbUpsertSeedRecords(incoming);
  }

  const op = writeChain.then(async () => {
    const existing = await readJsonFile<IngestedSeedRecord[]>(seedsFile(), []);
    const byId = new Map(existing.map((r) => [r.id, r]));
    for (const rec of incoming) {
      byId.set(rec.id, rec);
    }
    const merged = [...byId.values()];
    await writeJsonFile(seedsFile(), merged);
    return incoming;
  });
  writeChain = op.catch(() => undefined);
  return op;
}

export async function appendIngestionRun(metrics: IngestionRunMetrics): Promise<void> {
  await appendIngestionRunMetrics(metrics);
}

export async function listIngestionRuns(limit = 50): Promise<IngestionRunMetrics[]> {
  return listIngestionRunMetrics(limit);
}

/** Test helper */
export async function resetIngestionStoreForTests(): Promise<void> {
  resetBusinessSeedBackendCacheForTests();
  resetIngestionRunBackendCacheForTests();
  const backend = await resolveBusinessSeedBackend();

  if (backend === 'db') {
    await dbResetSeedRecordsForTests();
    await resetIngestionRunsForTests();
    return;
  }

  const op = writeChain.then(async () => {
    await writeJsonFile(seedsFile(), []);
    await writeJsonFile(runsFile(), []);
  });
  writeChain = op.catch(() => undefined);
  await op;
  await resetIngestionRunsForTests();
}

export async function resetIngestionDataForTests(): Promise<void> {
  const { resetQaAuditForTests } = await import('./QaAuditLog.js');
  const { resetClaimRequestsForTests } = await import('./ClaimRequestStore.js');
  const { resetClaimAuditForTests } = await import('./ClaimAuditLog.js');
  await resetIngestionStoreForTests();
  await resetQaAuditForTests();
  await resetClaimRequestsForTests();
  await resetClaimAuditForTests();
  const { resetSeedSuitcasesForTests } = await import('./seedSuitcaseStore.js');
  await resetSeedSuitcasesForTests();
  const { resetSeedLifecycleTransitionsForTests } = await import(
    './BusinessSeedStatusTransitionRepository.js'
  );
  await resetSeedLifecycleTransitionsForTests();
}

export async function buildIngestionDashboardMetrics(): Promise<{
  totalSeeds: number;
  byVerificationStatus: Record<string, number>;
  bySourceType: Record<string, number>;
  byQualityTier: Record<string, number>;
  claimRate: number;
  verificationRate: number;
  recentRuns: IngestionRunMetrics[];
}> {
  const [seeds, runs] = await Promise.all([listSeedRecords(), listIngestionRuns(20)]);

  const byVerificationStatus: Record<string, number> = {};
  const bySourceType: Record<string, number> = {};
  const byQualityTier: Record<string, number> = {};

  for (const s of seeds) {
    byVerificationStatus[s.verificationStatus] = (byVerificationStatus[s.verificationStatus] ?? 0) + 1;
    bySourceType[s.normalized.sourceType] = (bySourceType[s.normalized.sourceType] ?? 0) + 1;
    byQualityTier[s.qualityTier] = (byQualityTier[s.qualityTier] ?? 0) + 1;
  }

  const claimable = seeds.filter((s) => s.verificationStatus === 'seeded_claimable').length;
  const claimed = seeds.filter(
    (s) => s.verificationStatus === 'verified_owner' || s.verificationStatus === 'active',
  ).length;
  const verified = seeds.filter((s) => s.verificationStatus === 'verified_owner').length;
  const active = seeds.filter((s) => s.verificationStatus === 'active').length;

  const claimRate = seeds.length ? claimed / seeds.length : 0;
  const verificationRate = seeds.length ? (verified + active) / seeds.length : 0;

  const latestRun = runs[0];
  return {
    totalSeeds: seeds.length,
    byVerificationStatus,
    bySourceType,
    byQualityTier,
    claimRate: latestRun?.claimRate ?? claimRate,
    verificationRate: latestRun?.verificationRate ?? verificationRate,
    recentRuns: runs,
  };
}
