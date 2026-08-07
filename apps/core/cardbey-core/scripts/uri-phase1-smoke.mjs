import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma, ensurePrismaConnection } from '../src/lib/prisma.js';
import {
  runResourceIntelligenceSearch,
  uriHealth,
  buildCanonicalIntent,
  planSearchFromIntent,
} from '../src/services/universalResourceIntelligence/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
process.env.ENABLE_UNIVERSAL_RESOURCE_INTELLIGENCE_V1 = 'true';

await ensurePrismaConnection();
const h = uriHealth();
const intent = (
  await buildCanonicalIntent({
    utterance: 'Need a relaxing cafe background for a digital display',
  })
).intent;
const plan = await planSearchFromIntent(intent);
const search = await runResourceIntelligenceSearch(prisma, {
  utterance: 'Need a relaxing cafe background for a digital display',
});
console.log(
  JSON.stringify(
    {
      healthOk: h.ok,
      sources: h.federation.active,
      planSteps: plan.searchPlan.steps.map((s) => s.sourceId),
      searchOk: search.ok,
      candidates: search.candidates?.length,
      downloaded: search.discoveryMeta?.downloaded,
      jobId: search.jobId,
      industry: intent.industry,
      channel: intent.channel,
    },
    null,
    2,
  ),
);
await prisma.$disconnect();
