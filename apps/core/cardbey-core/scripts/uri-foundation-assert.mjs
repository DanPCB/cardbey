/**
 * Phase 1 URI foundation assertions (avoids vitest/prisma pretest EPERM on Windows).
 */
import assert from 'node:assert/strict';
import { buildCanonicalIntent } from '../src/services/universalResourceIntelligence/intentEngine.js';
import { planSearchFromIntent } from '../src/services/universalResourceIntelligence/queryPlanner.js';
import {
  listSourceNodes,
  federationHealth,
} from '../src/services/universalResourceIntelligence/sourceFederation.js';
import {
  suggestRights,
  decideRights,
} from '../src/services/universalResourceIntelligence/rightsIntelligence.js';
import {
  buildReusePlan,
  confirmReusePlan,
} from '../src/services/universalResourceIntelligence/reusePlanner.js';
import {
  listAiProviders,
  invokeAiModality,
} from '../src/services/universalResourceIntelligence/aiProviderRegistry.js';
import { AI_MODALITY } from '../src/services/universalResourceIntelligence/types.js';
import {
  resetResourceIndexForTests,
  upsertResourceRecord,
} from '../src/services/universalResourceIntelligence/resourceIndex.js';

resetResourceIndexForTests();

const intentRes = await buildCanonicalIntent({
  utterance: 'Need a relaxing café background for a digital display',
});
assert.equal(intentRes.ok, true);
assert.equal(intentRes.intent.industry, 'food-drink');
assert.equal(intentRes.intent.channel, 'display');
assert.equal(intentRes.intent.authority, 'intent_engine');

const plan = await planSearchFromIntent(intentRes.intent);
assert.equal(plan.ok, true);
assert.ok(plan.searchPlan.steps.length > 1);
assert.ok(plan.searchPlan.steps.some((s) => s.sourceId === 'src_cardbey_library'));
assert.equal(plan.searchPlan.policies.download, false);
assert.equal(plan.searchPlan.policies.publish, false);

const health = federationHealth();
assert.ok(health.total >= 5);
assert.ok(listSourceNodes({ status: 'ACTIVE' }).length > 0);

const suggestion = suggestRights({ sourceId: 'src_pexels', license: 'Pexels License' });
const decision = decideRights(suggestion);
assert.equal(suggestion.suggestion, 'SUGGESTED');
assert.equal(decision.decision, 'NEEDS_REVIEW');
assert.equal(decision.publicationAllowed, false);

const rec = upsertResourceRecord({
  sourceId: 'src_pexels',
  remoteId: '1',
  title: 'Cafe',
  mediaType: 'image',
  technical: { hostingMode: 'REFERENCE' },
});
const reuse = await buildReusePlan({ resourceIds: [rec.id] });
assert.equal(reuse.ok, true);
assert.equal(reuse.reusePlan.policies.host, false);
assert.equal(confirmReusePlan(reuse.reusePlan, { confirm: false }).ok, false);
const confirmed = confirmReusePlan(reuse.reusePlan, { confirm: true });
assert.equal(confirmed.ok, true);
assert.equal(confirmed.reusePlan.execution.phase, '2_reuse_pilot');

const providers = listAiProviders();
assert.ok(providers.some((p) => p.modality === AI_MODALITY.TEXT));
const ai = await invokeAiModality(AI_MODALITY.CLASSIFICATION, { text: 'beauty salon template' });
assert.equal(ai.ok, true);

console.log(
  JSON.stringify(
    {
      ok: true,
      verdict: 'UNIVERSAL_RESOURCE_INTELLIGENCE_FOUNDATION_READY',
      checks: [
        'intent',
        'planner',
        'federation',
        'rights_non_authoritative',
        'reuse_confirm',
        'ai_registry',
      ],
    },
    null,
    2,
  ),
);
