/**
 * A/B testing example — routes traffic by DEEPSEEK_AB_TRAFFIC_PERCENT.
 * npx tsx apps/core/cardbey-core/src/multiAgent/examples/ab_testing.ts
 */

import 'dotenv/config';
import { shouldRouteToDeepSeek } from '../config/agent.config.js';

async function main(): Promise<void> {
  const percent = Number(process.env.DEEPSEEK_AB_TRAFFIC_PERCENT || '50');
  process.env.DEEPSEEK_AB_TRAFFIC_PERCENT = String(percent);

  const samples = 20;
  let deepseekCount = 0;

  for (let i = 0; i < samples; i += 1) {
    const missionId = `MISSION_test_${i}`;
    if (shouldRouteToDeepSeek(missionId)) {
      deepseekCount += 1;
    }
  }

  console.log(`A/B routing (${percent}% target):`);
  console.log(`  DeepSeek: ${deepseekCount}/${samples} (${((deepseekCount / samples) * 100).toFixed(0)}%)`);
  console.log(`  Legacy:   ${samples - deepseekCount}/${samples}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
