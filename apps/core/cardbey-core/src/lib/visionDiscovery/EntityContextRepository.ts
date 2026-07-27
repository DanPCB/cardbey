/**
 * Persist entity contexts for vision intent graph learning loop.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EntityContext } from '../intentGraph/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '..', '..', '..');

function contextsFile(): string {
  const dir =
    process.env.VISION_DISCOVERY_DIR ||
    path.join(CORE_ROOT, 'data', 'visionDiscovery');
  return path.join(dir, 'entityContexts.json');
}

let writeChain: Promise<unknown> = Promise.resolve();

export async function saveEntityContext(context: EntityContext): Promise<EntityContext> {
  const op = writeChain.then(async () => {
    let existing: EntityContext[] = [];
    try {
      const buf = await fs.readFile(contextsFile(), 'utf8');
      existing = JSON.parse(buf) as EntityContext[];
    } catch {
      existing = [];
    }
    const merged = [context, ...existing.filter((c) => c.id !== context.id)].slice(0, 500);
    await fs.mkdir(path.dirname(contextsFile()), { recursive: true });
    await fs.writeFile(contextsFile(), JSON.stringify(merged, null, 2), 'utf8');
    return context;
  });
  writeChain = op.catch(() => undefined);
  return op;
}

export async function getEntityContextById(id: string): Promise<EntityContext | null> {
  try {
    const buf = await fs.readFile(contextsFile(), 'utf8');
    const all = JSON.parse(buf) as EntityContext[];
    return all.find((c) => c.id === id) ?? null;
  } catch {
    return null;
  }
}
