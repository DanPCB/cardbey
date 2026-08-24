/**
 * JSON persistence for multi-market discovery jobs.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MultiMarketDiscoveryJob } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '..', '..', '..');

function storeRoot(): string {
  return (
    process.env.MULTI_MARKET_DISCOVERY_DIR ||
    path.join(CORE_ROOT, 'data', 'multiMarketDiscovery')
  );
}

function jobsFile(): string {
  return path.join(storeRoot(), 'jobs.json');
}

let writeChain: Promise<unknown> = Promise.resolve();

async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
  try {
    const buf = await fs.readFile(file, 'utf8');
    return JSON.parse(buf) as T;
  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
    if (code === 'ENOENT') return fallback;
    console.warn('[multiMarketDiscoveryJobRepository] read failed:', err);
    return fallback;
  }
}

async function writeJsonFile(file: string, data: unknown): Promise<void> {
  const dir = storeRoot();
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

async function queuedWrite(file: string, data: unknown): Promise<void> {
  const op = writeChain.then(() => writeJsonFile(file, data));
  writeChain = op.catch(() => undefined);
  await op;
}

export async function listDiscoveryJobs(): Promise<MultiMarketDiscoveryJob[]> {
  return readJsonFile<MultiMarketDiscoveryJob[]>(jobsFile(), []);
}

export async function getDiscoveryJobById(id: string): Promise<MultiMarketDiscoveryJob | null> {
  const all = await listDiscoveryJobs();
  return all.find((j) => j.id === id) ?? null;
}

export async function upsertDiscoveryJob(job: MultiMarketDiscoveryJob): Promise<MultiMarketDiscoveryJob> {
  const all = await listDiscoveryJobs();
  const idx = all.findIndex((j) => j.id === job.id);
  if (idx >= 0) all[idx] = job;
  else all.push(job);
  await queuedWrite(jobsFile(), all);
  return job;
}

export async function listDiscoveryJobsByCountry(
  countryCode: string,
): Promise<MultiMarketDiscoveryJob[]> {
  const all = await listDiscoveryJobs();
  return all.filter((j) => j.countryCode === countryCode);
}
