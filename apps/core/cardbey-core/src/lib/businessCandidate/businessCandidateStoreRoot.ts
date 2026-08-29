/**
 * Writable directory for BusinessCandidate JSON stores.
 * Render staging often sets BUSINESS_CANDIDATE_DIR=/var/data/... without a mounted disk — fall back to /tmp.
 */

import { accessSync, constants, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '..', '..', '..');

let cachedStoreRoot: string | null = null;
let loggedFallback = false;

function isWritableDirectory(dir: string): boolean {
  try {
    mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
    const probe = path.join(dir, `.write-probe-${process.pid}`);
    writeFileSync(probe, 'ok', 'utf8');
    unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

export function resolveBusinessCandidateStoreRoot(): string {
  if (cachedStoreRoot) return cachedStoreRoot;

  const configured = process.env.BUSINESS_CANDIDATE_DIR?.trim();
  const candidates = [
    configured,
    path.join(CORE_ROOT, 'data', 'businessCandidates'),
    path.join(os.tmpdir(), 'cardbey', 'businessCandidates'),
  ].filter((value): value is string => Boolean(value));

  for (const dir of candidates) {
    if (!isWritableDirectory(dir)) continue;
    cachedStoreRoot = dir;
    if (configured && dir !== configured && !loggedFallback) {
      loggedFallback = true;
      console.warn(
        `[businessCandidate] BUSINESS_CANDIDATE_DIR=${configured} is not writable; using ${dir}`,
      );
    }
    return dir;
  }

  throw new Error(
    `EACCES: no writable business candidate store (tried: ${candidates.join(', ')})`,
  );
}

/** Test hook — call when BUSINESS_CANDIDATE_DIR changes between cases. */
export function resetBusinessCandidateStoreRootForTests(): void {
  cachedStoreRoot = null;
  loggedFallback = false;
}
