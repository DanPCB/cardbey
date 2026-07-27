/**
 * Candidate Intelligence Brief persistence (JSON).
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CandidateIntelligenceBrief } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

function briefsFile(): string {
  const root =
    process.env.BUSINESS_CANDIDATE_DIR ||
    path.join(CORE_ROOT, 'data', 'businessCandidates');
  return path.join(root, 'intelligence-briefs.json');
}

let writeChain: Promise<unknown> = Promise.resolve();

async function readAll(): Promise<CandidateIntelligenceBrief[]> {
  try {
    const buf = await fs.readFile(briefsFile(), 'utf8');
    return JSON.parse(buf) as CandidateIntelligenceBrief[];
  } catch {
    return [];
  }
}

async function writeAll(rows: CandidateIntelligenceBrief[]): Promise<void> {
  const file = briefsFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(rows, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

export async function getBriefByCandidateId(
  candidateId: string,
): Promise<CandidateIntelligenceBrief | null> {
  const all = await readAll();
  return all.find((b) => b.candidateId === candidateId) ?? null;
}

export async function getBriefBySeedId(seedId: string): Promise<CandidateIntelligenceBrief | null> {
  const all = await readAll();
  return all.find((b) => b.seedId === seedId) ?? null;
}

export async function saveBrief(brief: CandidateIntelligenceBrief): Promise<CandidateIntelligenceBrief> {
  const all = await readAll();
  const idx = all.findIndex(
    (b) =>
      b.id === brief.id ||
      b.candidateId === brief.candidateId ||
      (brief.seedId && b.seedId === brief.seedId),
  );
  if (idx >= 0) all[idx] = brief;
  else all.push(brief);
  const op = writeChain.then(() => writeAll(all));
  writeChain = op.catch(() => undefined);
  await op;
  return brief;
}

export function newBriefId(): string {
  return randomUUID();
}

export async function listBriefs(): Promise<CandidateIntelligenceBrief[]> {
  return readAll();
}

export async function resetBriefsForTests(): Promise<void> {
  const op = writeChain.then(() => writeAll([]));
  writeChain = op.catch(() => undefined);
  await op;
}
