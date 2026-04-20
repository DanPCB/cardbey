/**
 * Migration (NOT RUN AUTOMATICALLY):
 * Backfill checkpoint configJson canonical fields and remove deprecated aliases.
 *
 * What it would do:
 * - For checkpoint steps, if configJson.prompt is missing/empty and configJson.checkpointPrompt is present,
 *   copy checkpointPrompt -> prompt.
 * - Same for options/checkpointOptions.
 * - Then delete checkpointPrompt/checkpointOptions keys (leave prompt/options).
 *
 * IMPORTANT: Commit this script but do NOT execute as part of any deploy.
 */

import { getPrismaClient } from '../src/lib/prisma.js';

function isEmptyString(x) {
  return x == null || (typeof x === 'string' && x.trim() === '');
}

function isEmptyOptions(x) {
  return !Array.isArray(x) || x.length === 0;
}

async function main() {
  const prisma = getPrismaClient();

  const steps = await prisma.missionPipelineStep.findMany({
    where: {
      stepKind: 'checkpoint',
    },
    select: { id: true, configJson: true },
  });

  let updated = 0;
  for (const s of steps) {
    const cfg = s.configJson && typeof s.configJson === 'object' && !Array.isArray(s.configJson) ? s.configJson : null;
    if (!cfg) continue;

    const next = { ...cfg };
    let changed = false;

    if (isEmptyString(next.prompt) && !isEmptyString(next.checkpointPrompt)) {
      next.prompt = next.checkpointPrompt;
      changed = true;
    }
    if (isEmptyOptions(next.options) && Array.isArray(next.checkpointOptions) && next.checkpointOptions.length > 0) {
      next.options = next.checkpointOptions;
      changed = true;
    }

    if ('checkpointPrompt' in next) {
      delete next.checkpointPrompt;
      changed = true;
    }
    if ('checkpointOptions' in next) {
      delete next.checkpointOptions;
      changed = true;
    }

    if (!changed) continue;
    await prisma.missionPipelineStep.update({
      where: { id: s.id },
      data: { configJson: next },
    });
    updated++;
  }

  // eslint-disable-next-line no-console
  console.log(`[migrate_checkpoint_aliases] updated steps: ${updated}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[migrate_checkpoint_aliases] failed:', err);
  process.exitCode = 1;
});

