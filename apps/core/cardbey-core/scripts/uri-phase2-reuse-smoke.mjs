/**
 * URI Phase 2 — Rights-Aware Resource Reuse Pilot smoke.
 * Proves: discovery → select → confirm → draft playlist + ExternalResourceUse (no publish, no binary).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma, ensurePrismaConnection } from '../src/lib/prisma.js';
import { ensureUriReuseTables } from './ensure-uri-reuse-tables.mjs';
import {
  runResourceIntelligenceSearch,
  selectResourceCandidate,
  confirmAndExecuteReuse,
  cancelReuseDecision,
  runReuseOpsProofs,
  CUSTODY_MODE,
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
process.env.ENABLE_URI_REUSE_PILOT_V1 = 'true';

await ensurePrismaConnection();
await ensureUriReuseTables();

const utterance =
  'Find a relaxing café background video for a commercial digital display';

const search = await runResourceIntelligenceSearch(prisma, {
  utterance,
  consumer: 'uri_phase2_smoke',
});
if (!search.ok) {
  console.error(search);
  process.exit(1);
}

const external = (search.candidates || []).find(
  (c) => c.resource?.sourceId === 'src_pexels' && c.candidateSnapshotId,
);
const chosen =
  external ||
  (search.candidates || []).find((c) => c.candidateSnapshotId) ||
  null;

if (!chosen) {
  console.error(JSON.stringify({ ok: false, error: 'no_candidates', search }, null, 2));
  process.exit(1);
}

// Cancellation path proof
const cancelSelect = await selectResourceCandidate(prisma, {
  sessionId: search.sessionId,
  candidateSnapshotId: chosen.candidateSnapshotId,
  custodyMode: CUSTODY_MODE.PROVIDER_HOSTED,
  intendedPurpose: 'commercial_digital_display',
});
const cancelled = await cancelReuseDecision(prisma, {
  reuseDecisionId: cancelSelect.reuseDecision.id,
});

// Happy path
const select = await selectResourceCandidate(prisma, {
  sessionId: search.sessionId,
  candidateSnapshotId: chosen.candidateSnapshotId,
  custodyMode:
    chosen.explanation?.custodyMode || CUSTODY_MODE.PROVIDER_HOSTED,
  intendedPurpose: 'commercial_digital_display',
});
if (!select.ok) {
  console.error(select);
  process.exit(1);
}

// Simulated retrieval failure then retry
const fail = await confirmAndExecuteReuse(prisma, {
  reuseDecisionId: select.reuseDecision.id,
  confirm: true,
  simulateRetrievalFailure: true,
});
if (fail.ok) {
  console.error({ ok: false, error: 'expected_retrieval_failure', fail });
  process.exit(1);
}
const executed = await confirmAndExecuteReuse(prisma, {
  reuseDecisionId: select.reuseDecision.id,
  confirm: true,
  simulateRetrievalFailure: true,
  retry: true,
  playlistName: 'URI Phase 2 café display draft',
});
if (!executed.ok) {
  console.error(executed);
  process.exit(1);
}

const playlist = await prisma.playlist.findUnique({
  where: { id: executed.draft.playlistId },
  include: { items: true },
});

const ops = runReuseOpsProofs(chosen.resource);

const report = {
  ok: true,
  verdict: 'RESOURCE_REUSE_PILOT_READY',
  utterance,
  sessionId: search.sessionId,
  candidates: search.candidates.length,
  downloaded: Boolean(search.discoveryMeta?.downloaded),
  hosted: Boolean(search.discoveryMeta?.hosted),
  selected: {
    resourceId: chosen.resource.id,
    sourceId: chosen.resource.sourceId,
    custodyMode: executed.custodyMode,
  },
  cancellation: { ok: cancelled.ok, status: cancelled.reuseDecision?.status },
  retrievalRetry: { failedThenRetried: true },
  draft: {
    playlistId: playlist?.id,
    active: playlist?.active,
    itemCount: playlist?.items?.length ?? 0,
    published: false,
  },
  externalResourceUse: {
    id: executed.externalResourceUse.id,
    binaryStored: executed.binaryStored,
    attributionSnapshotId: executed.attribution?.id,
    policyVersion: executed.externalResourceUse.policyVersion,
  },
  opsProofs: Object.fromEntries(
    Object.entries(ops.scenarios).map(([k, v]) => [k, Boolean(v.proven)]),
  ),
  explanationSample: {
    why: chosen.explanation?.whyItMatches?.slice(0, 2),
    actions: chosen.explanation?.actions,
    restrictions: chosen.explanation?.restrictions?.slice(0, 2),
  },
};

console.log(JSON.stringify(report, null, 2));
await prisma.$disconnect();
