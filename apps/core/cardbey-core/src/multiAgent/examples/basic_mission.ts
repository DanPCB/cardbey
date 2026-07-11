/**
 * Basic mission example — run with:
 * npx tsx apps/core/cardbey-core/src/multiAgent/examples/basic_mission.ts
 */

import 'dotenv/config';
import { Orchestrator } from '../orchestrator/orchestrator.js';

async function main(): Promise<void> {
  const orchestrator = new Orchestrator();
  const result = await orchestrator.processMission(
    "I want to open a beauty store called 'Glow Beauty' in Melbourne",
  );

  console.log('Mission Result:', {
    missionId: result.missionId,
    status: result.status,
    intent: result.intent,
    response: result.finalResponse.slice(0, 200),
    agentsUsed: result.telemetry.agentsUsed,
    tokens: result.telemetry.tokenUsage.total,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
