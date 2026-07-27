/**
 * Shadow mode example — compares DeepSeek vs OpenAI intent classification.
 * npx tsx apps/core/cardbey-core/src/multiAgent/examples/shadow_mode.ts
 */

import 'dotenv/config';
import { Orchestrator } from '../orchestrator/orchestrator.js';

async function main(): Promise<void> {
  process.env.MULTI_AGENT_SHADOW = 'true';
  process.env.AGENT_SHADOW_LOG_DETAILED = 'true';

  const orchestrator = new Orchestrator();
  const result = await orchestrator.processMission(
    'Set up 3 stores: Beauty in Melbourne, Fashion in Sydney, Electronics in Brisbane',
  );

  console.log('Shadow comparison:', result.telemetry.shadowComparison);
  console.log('Primary intent:', result.intent);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
