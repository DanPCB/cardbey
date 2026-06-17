/**
 * Persist enrichment candidates (V2.2) — suggestions only.
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  EnrichmentCandidate,
  EnrichmentCandidateField,
  EnrichmentCandidateStatus,
  EnrichmentPermissionType,
} from './types.js';
import { validateEnrichmentCandidateInput } from './enrichmentSafety.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '..', '..', '..');

function storeDir(): string {
  return process.env.BUSINESS_INGESTION_DIR || path.join(CORE_ROOT, 'data', 'businessIngestion');
}

function candidatesFile(): string {
  return path.join(storeDir(), 'enrichment-candidates.json');
}

let writeChain: Promise<unknown> = Promise.resolve();

async function readAll(): Promise<EnrichmentCandidate[]> {
  try {
    const buf = await fs.readFile(candidatesFile(), 'utf8');
    const parsed = JSON.parse(buf);
    return Array.isArray(parsed) ? (parsed as EnrichmentCandidate[]) : [];
  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
    if (code === 'ENOENT') return [];
    return [];
  }
}

async function writeAll(records: EnrichmentCandidate[]): Promise<void> {
  const dir = storeDir();
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.enrichment-candidates.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(records, null, 2), 'utf8');
  await fs.rename(tmp, candidatesFile());
}

export async function listEnrichmentCandidates(seedId?: string): Promise<EnrichmentCandidate[]> {
  const all = await readAll();
  if (!seedId) return all;
  return all.filter((c) => c.seedId === seedId);
}

export async function getEnrichmentCandidateById(id: string): Promise<EnrichmentCandidate | null> {
  const all = await readAll();
  return all.find((c) => c.id === id) ?? null;
}

export async function upsertEnrichmentCandidate(
  input: Omit<EnrichmentCandidate, 'id' | 'createdAt' | 'updatedAt' | 'status'> & {
    id?: string;
    status?: EnrichmentCandidateStatus;
  },
): Promise<EnrichmentCandidate | null> {
  const gate = validateEnrichmentCandidateInput({
    field: input.field,
    value: input.value,
    sourceUrl: input.sourceUrl,
    confidence: input.confidence,
    permissionType: input.permissionType,
  });
  if (!gate.ok) return null;

  const now = new Date().toISOString();
  const op = writeChain.then(async () => {
    const all = await readAll();
    const existingIdx = input.id ? all.findIndex((c) => c.id === input.id) : -1;
    const existing =
      existingIdx >= 0
        ? all[existingIdx]
        : all.find(
            (c) =>
              c.seedId === input.seedId &&
              c.field === input.field &&
              c.status === 'suggested' &&
              c.value === input.value,
          );

    const record: EnrichmentCandidate = {
      id: input.id ?? existing?.id ?? randomUUID(),
      seedId: input.seedId,
      field: input.field as EnrichmentCandidateField,
      value: input.value,
      sourceUrl: input.sourceUrl,
      confidence: input.confidence,
      permissionType: input.permissionType as EnrichmentPermissionType,
      status: input.status ?? existing?.status ?? 'suggested',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      rejectedReason: input.rejectedReason ?? existing?.rejectedReason ?? null,
    };

    if (existingIdx >= 0) {
      all[existingIdx] = record;
    } else if (existing && !input.id) {
      const idx = all.findIndex((c) => c.id === existing.id);
      if (idx >= 0) all[idx] = record;
      else all.push(record);
    } else {
      all.push(record);
    }
    await writeAll(all);
    return record;
  });
  writeChain = op.catch(() => undefined);
  return op;
}

export async function updateEnrichmentCandidateStatus(
  id: string,
  status: EnrichmentCandidateStatus,
  rejectedReason?: string | null,
): Promise<EnrichmentCandidate | null> {
  const op = writeChain.then(async () => {
    const all = await readAll();
    const idx = all.findIndex((c) => c.id === id);
    if (idx < 0) return null;
    const updated: EnrichmentCandidate = {
      ...all[idx],
      status,
      rejectedReason: rejectedReason ?? null,
      updatedAt: new Date().toISOString(),
    };
    all[idx] = updated;
    await writeAll(all);
    return updated;
  });
  writeChain = op.catch(() => undefined);
  return op;
}

export async function resetEnrichmentCandidatesForTests(): Promise<void> {
  const op = writeChain.then(() => writeAll([]));
  writeChain = op.catch(() => undefined);
  await op;
}
