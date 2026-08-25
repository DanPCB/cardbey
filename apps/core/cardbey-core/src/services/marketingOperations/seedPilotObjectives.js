/**
 * Seed the three pilot Marketing Objectives (idempotent). Research only.
 */

import { OBJECTIVE_STATES } from './constants.js';
import { createObjective, listObjectives } from './objectiveService.js';
import { PILOT_OBJECTIVE_SEEDS } from './researchContract.js';

export async function ensurePilotResearchObjectives(ctx = {}) {
  const existing = await listObjectives({ take: 200 }).catch(() => []);
  const byName = new Map((existing || []).map((o) => [o.name, o]));
  const out = [];
  for (const seed of PILOT_OBJECTIVE_SEEDS) {
    if (byName.has(seed.name)) {
      out.push(byName.get(seed.name));
      continue;
    }
    const created = await createObjective(
      {
        name: seed.name,
        targetType: seed.targetType,
        market: seed.market,
        language: seed.language,
        goal: seed.question,
        status: OBJECTIVE_STATES.ACTIVE,
      },
      ctx,
    );
    out.push(created);
  }
  return out;
}
