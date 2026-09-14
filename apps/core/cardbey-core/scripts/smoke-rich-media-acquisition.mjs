/**
 * Runtime smoke: federated search for Vietnamese bakery (mocked adapters optional).
 * Run: node --import tsx/esm scripts/smoke-rich-media-acquisition.mjs
 */
import { runFederatedMediaSearch } from '../src/services/mediaAcquisition/federatedMediaSearch.js';
import { resolveAcquisitionDecision, ACQUISITION_DECISION } from '../src/services/mediaAcquisition/acquisitionDecision.js';

const result = await runFederatedMediaSearch({
  query: 'Vietnamese bakery advertising content',
  mediaType: 'all',
  limitPerSource: 4,
});

console.log(
  JSON.stringify(
    {
      ok: result.ok,
      query: result.query,
      expandedQueries: result.expandedQueries,
      latencyMs: result.latencyMs,
      sourceStatuses: result.sourceStatuses,
      candidateCount: result.candidates?.length || 0,
      sample: (result.candidates || []).slice(0, 3).map((c) => ({
        id: c.id,
        provider: c.provider,
        mediaType: c.mediaType,
        title: c.title,
        license: c.license,
        acquisitionDecision: c.acquisitionDecision,
        rightsConfidence: c.rightsConfidence,
        relevanceScore: c.relevanceScore,
        qualityScore: c.qualityScore,
        canAcquire: c.canAcquire,
        canDownload: c.canDownload,
      })),
      tiktokBlocked: resolveAcquisitionDecision({ provider: 'tiktok', license: 'n/a' }),
      blockedCannotDownload:
        resolveAcquisitionDecision({ provider: 'tiktok' }).decision ===
        ACQUISITION_DECISION.REFERENCE_ONLY,
    },
    null,
    2,
  ),
);

if (!result.ok) process.exit(1);
// Pass if at least one source returned SUCCESS or PARTIAL, or all CONFIG_REQUIRED (env without keys)
const statuses = result.sourceStatuses || [];
const anyLive = statuses.some((s) => s.status === 'SUCCESS' || s.count > 0);
const isolated = !statuses.every((s) => s.status === 'FAILED');
if (!isolated) {
  console.error('FAIL: all sources failed');
  process.exit(1);
}
console.log(anyLive ? 'SMOKE_OK_WITH_RESULTS' : 'SMOKE_OK_NO_LIVE_KEYS');
