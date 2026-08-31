/**
 * Append-only seed curation audit (file + Prisma when available).
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '..', '..', '..');

function storeDir() {
  return process.env.BUSINESS_INGESTION_DIR || path.join(CORE_ROOT, 'data', 'businessIngestion');
}

function eventsFile() {
  return path.join(storeDir(), 'seed-curation-events.json');
}

let writeChain = Promise.resolve();

async function readAll() {
  try {
    const buf = await fs.readFile(eventsFile(), 'utf8');
    const parsed = JSON.parse(buf);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? err.code : '';
    if (code === 'ENOENT') return [];
    return [];
  }
}

async function writeAll(entries) {
  const dir = storeDir();
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.seed-curation-events.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(entries, null, 2), 'utf8');
  await fs.rename(tmp, eventsFile());
}

async function tryPrismaAppend(entry) {
  try {
    const { default: prisma } = await import('../prisma.js');
    if (typeof prisma.seedCurationEvent?.create !== 'function') return;
    await prisma.seedCurationEvent.create({
      data: {
        id: entry.id,
        seedId: entry.seedId,
        field: entry.field,
        adminId: entry.adminId,
        note: entry.note,
        previousValue: JSON.stringify(entry.previousValue ?? null),
        createdAt: new Date(entry.createdAt),
      },
    });
  } catch {
    /* file log is enough when the table/client is missing */
  }
}

export async function appendSeedCurationEvent(params) {
  const entry = {
    id: randomUUID(),
    seedId: params.seedId,
    field: params.field ?? 'hero',
    adminId: params.adminId,
    note: params.note?.trim() || null,
    previousValue: params.previousValue ?? null,
    createdAt: new Date().toISOString(),
  };

  const op = writeChain.then(async () => {
    const all = await readAll();
    all.push(entry);
    await writeAll(all.slice(-5000));
    await tryPrismaAppend(entry);
    return entry;
  });
  writeChain = op.catch(() => undefined);
  return op;
}

export async function listSeedCurationEvents(opts = {}) {
  const all = await readAll();
  const filtered = opts.seedId ? all.filter((e) => e.seedId === opts.seedId) : all;
  const limit = opts.limit ?? 50;
  return filtered.slice(-limit).reverse();
}

export async function resetSeedCurationEventsForTests() {
  writeChain = Promise.resolve();
  try {
    await fs.unlink(eventsFile());
  } catch {
    /* missing is fine */
  }
}
