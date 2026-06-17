/**
 * Phase V3 — Seed Suitcase persistence.
 * Storage: businessIngestion/seedSuitcase/{seedId}.json
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SeedSuitcase } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '..', '..', '..');

function storeDir(): string {
  const base =
    process.env.BUSINESS_INGESTION_DIR || path.join(CORE_ROOT, 'data', 'businessIngestion');
  return path.join(base, 'seedSuitcase');
}

function suitcaseFile(seedId: string): string {
  return path.join(storeDir(), `${seedId}.json`);
}

let writeChain: Promise<unknown> = Promise.resolve();

async function readSuitcase(seedId: string): Promise<SeedSuitcase | null> {
  try {
    const buf = await fs.readFile(suitcaseFile(seedId), 'utf8');
    return JSON.parse(buf) as SeedSuitcase;
  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
    if (code === 'ENOENT') return null;
    return null;
  }
}

async function writeSuitcase(suitcase: SeedSuitcase): Promise<void> {
  const dir = storeDir();
  await fs.mkdir(dir, { recursive: true });
  const file = suitcaseFile(suitcase.seedId);
  const tmp = path.join(dir, `.${suitcase.seedId}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(suitcase, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

export async function getSeedSuitcase(seedId: string): Promise<SeedSuitcase | null> {
  return readSuitcase(seedId);
}

export async function saveSeedSuitcase(suitcase: SeedSuitcase): Promise<SeedSuitcase> {
  const op = writeChain.then(async () => {
    await writeSuitcase(suitcase);
    return suitcase;
  });
  writeChain = op.catch(() => undefined);
  return op;
}

export async function listAllSeedSuitcases(): Promise<SeedSuitcase[]> {
  const dir = storeDir();
  try {
    const files = await fs.readdir(dir);
    const suitcases: SeedSuitcase[] = [];
    for (const file of files) {
      if (!file.endsWith('.json') || file.startsWith('.')) continue;
      const seedId = file.replace(/\.json$/, '');
      const suitcase = await readSuitcase(seedId);
      if (suitcase) suitcases.push(suitcase);
    }
    return suitcases;
  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
    if (code === 'ENOENT') return [];
    return [];
  }
}

export async function resetSeedSuitcasesForTests(): Promise<void> {
  const dir = storeDir();
  try {
    const files = await fs.readdir(dir);
    await Promise.all(
      files
        .filter((f) => f.endsWith('.json'))
        .map((f) => fs.unlink(path.join(dir, f)).catch(() => undefined)),
    );
  } catch {
    /* empty */
  }
}
