/**
 * Candidate enrichment provenance — JSON sidecar only.
 *
 * Runtime classification: **Development/pilot runtime state** (NOT a source-controlled
 * source of truth; NOT a test fixture; temporary bridge until Prisma promotion).
 * Prefer gitignoring local mutations; committed empty `[]` is a placeholder only.
 *
 * Safety:
 * - All read-modify-write ops serialize on `writeChain` (process-local)
 * - Atomic write via temp file + rename
 * - Malformed file → quarantine + empty recover (bounded)
 * - Duplicate (enrichmentRunId, candidateId, field) skipped (idempotent retry)
 * - Dry-run writes go to a separate sidecar when enabled
 * - Bounded growth (MAX_PROVENANCE_ROWS)
 *
 * Does NOT touch Prisma EnrichedFieldProvenance.
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CandidateFieldProvenanceRecord } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

/** Soft bound to prevent unbounded sidecar growth in pilot mode. */
export const MAX_PROVENANCE_ROWS = 50_000;

export const PROVENANCE_RUNTIME_CLASSIFICATION =
  'development_pilot_runtime_state_temporary_bridge' as const;

function storeRoot(): string {
  return (
    process.env.BUSINESS_CANDIDATE_DIR ||
    path.join(CORE_ROOT, 'data', 'businessCandidates')
  );
}

function provenanceFile(dryRun = false): string {
  const name = dryRun ? 'enriched-field-provenance.dry-run.json' : 'enriched-field-provenance.json';
  return path.join(storeRoot(), name);
}

let writeChain: Promise<unknown> = Promise.resolve();

function rowKey(r: Pick<CandidateFieldProvenanceRecord, 'enrichmentRunId' | 'candidateId' | 'field'>): string {
  return `${r.enrichmentRunId}::${r.candidateId}::${r.field}`;
}

async function readAllFrom(file: string): Promise<CandidateFieldProvenanceRecord[]> {
  try {
    const buf = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(buf) as unknown;
    if (!Array.isArray(parsed)) {
      await quarantineCorrupt(file, buf, 'not_array');
      return [];
    }
    return parsed as CandidateFieldProvenanceRecord[];
  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
    if (code === 'ENOENT') return [];
    if (err instanceof SyntaxError) {
      try {
        const buf = await fs.readFile(file, 'utf8');
        await quarantineCorrupt(file, buf, 'json_parse');
      } catch {
        /* ignore */
      }
      return [];
    }
    console.warn('[candidateProvenance] read failed:', err);
    throw err;
  }
}

async function quarantineCorrupt(file: string, buf: string, reason: string): Promise<void> {
  const q = `${file}.corrupt.${Date.now()}.${reason}`;
  try {
    await fs.writeFile(q, buf, 'utf8');
    console.warn(`[candidateProvenance] quarantined corrupt file → ${q}`);
  } catch (err) {
    console.warn('[candidateProvenance] quarantine failed:', err);
  }
}

async function atomicWrite(file: string, rows: CandidateFieldProvenanceRecord[]): Promise<void> {
  if (rows.length > MAX_PROVENANCE_ROWS) {
    throw new Error(
      `Provenance sidecar would exceed MAX_PROVENANCE_ROWS=${MAX_PROVENANCE_ROWS} (got ${rows.length})`,
    );
  }
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  const payload = `${JSON.stringify(rows, null, 2)}\n`;
  await fs.writeFile(tmp, payload, 'utf8');
  await fs.rename(tmp, file);
}

/**
 * Serialize mutations so concurrent admin+script callers in the same process
 * cannot lose rows via interleaved read-modify-write.
 * Cross-process locking is not provided — see docs; multi-process writers are unsupported.
 */
async function withProvenanceLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function appendCandidateFieldProvenance(
  rows: Omit<CandidateFieldProvenanceRecord, 'id' | 'generatedAt'>[],
  opts?: { dryRun?: boolean },
): Promise<CandidateFieldProvenanceRecord[]> {
  if (!rows.length) return [];
  const dryRun = opts?.dryRun === true;
  const file = provenanceFile(dryRun);

  return withProvenanceLock(async () => {
    const all = await readAllFrom(file);
    const existing = new Set(all.map(rowKey));
    const now = new Date().toISOString();
    const created: CandidateFieldProvenanceRecord[] = [];

    for (const r of rows) {
      const key = rowKey(r);
      if (existing.has(key)) continue; // idempotent retry
      // Strip overly large raw extracts / avoid secret-looking blobs
      const rawExtract =
        typeof r.rawExtract === 'string' ? sanitizeRawExtract(r.rawExtract) : r.rawExtract;
      const row: CandidateFieldProvenanceRecord = {
        ...r,
        rawExtract,
        id: randomUUID(),
        generatedAt: now,
        ...(dryRun ? { dryRun: true } : {}),
      } as CandidateFieldProvenanceRecord & { dryRun?: boolean };
      all.push(row);
      existing.add(key);
      created.push(row);
    }

    if (created.length) await atomicWrite(file, all);
    return created;
  });
}

function sanitizeRawExtract(value: string): string {
  const trimmed = value.slice(0, 2000);
  if (/(api[_-]?key|authorization|password|secret|bearer\s+)/i.test(trimmed)) {
    return '[redacted:possible_secret]';
  }
  return trimmed;
}

export async function listProvenanceForCandidate(
  candidateId: string,
  opts?: { dryRun?: boolean },
): Promise<CandidateFieldProvenanceRecord[]> {
  const all = await readAllFrom(provenanceFile(opts?.dryRun === true));
  return all.filter((r) => r.candidateId === candidateId);
}

export async function listProvenanceForRun(
  enrichmentRunId: string,
  opts?: { dryRun?: boolean },
): Promise<CandidateFieldProvenanceRecord[]> {
  const all = await readAllFrom(provenanceFile(opts?.dryRun === true));
  return all.filter((r) => r.enrichmentRunId === enrichmentRunId);
}

/** Remove all provenance rows for a run (rollback handle). Live and dry-run files are separate. */
export async function deleteProvenanceForRun(
  enrichmentRunId: string,
  opts?: { dryRun?: boolean },
): Promise<number> {
  const dryRun = opts?.dryRun === true;
  const file = provenanceFile(dryRun);
  return withProvenanceLock(async () => {
    const all = await readAllFrom(file);
    const kept = all.filter((r) => r.enrichmentRunId !== enrichmentRunId);
    const removed = all.length - kept.length;
    if (removed > 0) await atomicWrite(file, kept);
    return removed;
  });
}

export async function resetCandidateProvenanceForTests(): Promise<void> {
  await withProvenanceLock(async () => {
    await atomicWrite(provenanceFile(false), []);
    await atomicWrite(provenanceFile(true), []);
  });
}

export function provenanceFilePathForTests(dryRun = false): string {
  return provenanceFile(dryRun);
}

export async function readProvenanceRawForTests(dryRun = false): Promise<CandidateFieldProvenanceRecord[]> {
  return readAllFrom(provenanceFile(dryRun));
}
