/**
 * URI observable pipeline:
 * Intent → Planning → Discovery → Ranking → Metadata → Rights → Reuse Plan → User
 */

import { buildCanonicalIntent } from './intentEngine.js';
import { planSearchFromIntent } from './queryPlanner.js';
import { discoverFromPlan } from './discoveryEngine.js';
import { evaluateResourceRights } from './rightsIntelligence.js';
import { buildReusePlan } from './reusePlanner.js';
import { explainCandidate } from './candidateExplainer.js';
import { createJob, updateJob, appendJobStage } from './jobStore.js';
import { URI_JOB_KIND, URI_JOB_STATUS } from './types.js';
import { recordLearningEvent } from './learningEngine.js';
import { createSearchSession, insertCandidateSnapshots } from './reuseRepository.js';

/**
 * Full search pipeline (no download/host/publish).
 * Phase 2: persists ResourceSearchSession + candidate snapshots with explanations.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} input
 */
export async function runResourceIntelligenceSearch(prisma, input = {}) {
  const job = createJob(URI_JOB_KIND.SEARCH, { utterance: input.utterance || input.query });
  updateJob(job.id, { status: URI_JOB_STATUS.RUNNING, startedAt: new Date().toISOString() });

  try {
    const intentRes = await buildCanonicalIntent(input);
    appendJobStage(job.id, { stage: 'intent', ok: intentRes.ok });
    if (!intentRes.ok) throw new Error(intentRes.error || 'intent_failed');

    // Commercial display pilot: enrich intent purpose when utterance implies it
    if (
      /commercial|display|digital display|signage/i.test(
        String(input.utterance || input.query || ''),
      )
    ) {
      intentRes.intent.purpose =
        intentRes.intent.purpose || 'commercial_digital_display';
      intentRes.intent.channel = intentRes.intent.channel || 'display';
      intentRes.intent.orientation = intentRes.intent.orientation || 'landscape';
    }

    const planRes = await planSearchFromIntent(intentRes.intent);
    appendJobStage(job.id, {
      stage: 'planning',
      ok: planRes.ok,
      steps: planRes.searchPlan?.steps?.length,
    });
    if (!planRes.ok) throw new Error(planRes.error || 'plan_failed');

    const discovery = await discoverFromPlan(prisma, planRes.searchPlan, intentRes.intent);
    appendJobStage(job.id, {
      stage: 'discovery',
      ok: discovery.ok,
      count: discovery.count,
      downloaded: discovery.downloaded,
    });

    const ranked = rankCandidates(discovery.candidates || [], intentRes.intent);
    appendJobStage(job.id, { stage: 'candidate_ranking', ok: true, count: ranked.length });

    const withRights = ranked.map((r) => {
      const rights = evaluateResourceRights(r);
      const explanation = explainCandidate(r, rights, intentRes.intent);
      return { resource: r, rights, explanation };
    });
    appendJobStage(job.id, { stage: 'rights', ok: true, note: 'suggestions_only' });

    const session = await createSearchSession(prisma, {
      userId: input.userId || null,
      utterance: input.utterance || input.query || null,
      intent: intentRes.intent,
      searchPlan: planRes.searchPlan,
      jobId: job.id,
      consumer: input.consumer || null,
    });
    const snapshots = await insertCandidateSnapshots(prisma, session.id, withRights);
    appendJobStage(job.id, {
      stage: 'session_persist',
      ok: true,
      sessionId: session.id,
      snapshots: snapshots.length,
    });

    const candidates = withRights.map((c, i) => ({
      ...c,
      candidateSnapshotId: snapshots[i]?.id || null,
      sessionId: session.id,
    }));

    const result = {
      intent: intentRes.intent,
      searchPlan: planRes.searchPlan,
      sessionId: session.id,
      candidates,
      discoveryMeta: { skipped: discovery.skipped, downloaded: false, hosted: false },
      next: {
        select: 'POST /api/resource-intelligence/select',
        reuse: 'POST /api/resource-intelligence/reuse',
        explain: 'POST /api/resource-intelligence/explain',
      },
    };

    updateJob(job.id, {
      status: URI_JOB_STATUS.COMPLETED,
      completedAt: new Date().toISOString(),
      result: {
        intentId: intentRes.intent.id,
        candidateCount: candidates.length,
        planId: planRes.searchPlan.id,
        sessionId: session.id,
      },
    });

    recordLearningEvent({
      type: 'pipeline',
      signal: 'search_completed',
      intentId: intentRes.intent.id,
      payload: { candidateCount: candidates.length, sessionId: session.id },
    });

    return { ok: true, jobId: job.id, ...result, authority: 'universal_resource_intelligence' };
  } catch (e) {
    updateJob(job.id, {
      status: URI_JOB_STATUS.FAILED,
      error: e?.message || String(e),
      completedAt: new Date().toISOString(),
    });
    return { ok: false, jobId: job.id, error: e?.message || String(e) };
  }
}

/**
 * Plan-only endpoint body.
 */
export async function runResourceIntelligencePlan(input = {}) {
  const job = createJob(URI_JOB_KIND.PLAN, input);
  updateJob(job.id, { status: URI_JOB_STATUS.RUNNING, startedAt: new Date().toISOString() });
  const intentRes = await buildCanonicalIntent(input);
  const planRes = await planSearchFromIntent(intentRes.intent);
  updateJob(job.id, {
    status: planRes.ok ? URI_JOB_STATUS.COMPLETED : URI_JOB_STATUS.FAILED,
    completedAt: new Date().toISOString(),
    result: planRes.searchPlan || null,
    error: planRes.error || null,
  });
  return { ok: planRes.ok, jobId: job.id, intent: intentRes.intent, searchPlan: planRes.searchPlan, error: planRes.error };
}

/**
 * Discover-only (requires plan or builds one).
 */
export async function runResourceIntelligenceDiscover(prisma, input = {}) {
  const job = createJob(URI_JOB_KIND.DISCOVER, input);
  updateJob(job.id, { status: URI_JOB_STATUS.RUNNING, startedAt: new Date().toISOString() });
  let searchPlan = input.searchPlan;
  let intent = input.intent;
  if (!searchPlan) {
    const intentRes = await buildCanonicalIntent(input);
    intent = intentRes.intent;
    const planRes = await planSearchFromIntent(intent);
    searchPlan = planRes.searchPlan;
  }
  const discovery = await discoverFromPlan(prisma, searchPlan, intent || {});
  updateJob(job.id, {
    status: URI_JOB_STATUS.COMPLETED,
    completedAt: new Date().toISOString(),
    result: { count: discovery.count },
  });
  return { ok: true, jobId: job.id, intent, searchPlan, ...discovery };
}

export async function runResourceIntelligenceReuse(input = {}) {
  const job = createJob(URI_JOB_KIND.REUSE, input);
  updateJob(job.id, { status: URI_JOB_STATUS.RUNNING, startedAt: new Date().toISOString() });
  const plan = await buildReusePlan(input);
  updateJob(job.id, {
    status: plan.ok ? URI_JOB_STATUS.AWAITING_CONFIRMATION : URI_JOB_STATUS.FAILED,
    completedAt: new Date().toISOString(),
    result: plan.reusePlan || null,
    error: plan.error || null,
  });
  return { ...plan, jobId: job.id };
}

export async function explainResourceIntelligence(input = {}) {
  const job = createJob(URI_JOB_KIND.EXPLAIN, input);
  const explanation = {
    whatUriIs: 'AI-native resource intelligence — not a crawler or stock importer',
    pipeline: [
      'Intent',
      'Planning',
      'Discovery',
      'Candidate Ranking',
      'Metadata',
      'Rights (suggestion only)',
      'Reuse Plan',
      'User confirmation',
    ],
    never: [
      'autonomous crawling',
      'autonomous publishing',
      'automatic hosting',
      'automatic downloading',
      'AI rights decisions as authority',
    ],
    consumers: [
      'Universal Library',
      'Capability Engine',
      'Creator Studio',
      'Business Creation',
      'Performer',
    ],
    inputEcho: {
      utterance: input.utterance || input.query || null,
      resourceId: input.resourceId || null,
      jobId: input.jobId || null,
    },
  };
  updateJob(job.id, {
    status: URI_JOB_STATUS.COMPLETED,
    completedAt: new Date().toISOString(),
    result: explanation,
  });
  return { ok: true, jobId: job.id, explanation };
}

function rankCandidates(candidates, intent) {
  return [...candidates].sort((a, b) => {
    let sa = scoreCandidate(a, intent);
    let sb = scoreCandidate(b, intent);
    return sb - sa;
  });
}

function scoreCandidate(r, intent) {
  let s = 0;
  if (intent.industry && r.industry === intent.industry) s += 3;
  if (intent.mediaType && String(r.mediaType).toLowerCase() === String(intent.mediaType).toLowerCase()) {
    s += 2;
  }
  // Commercial display pilot: prefer video / loop-friendly provider-hosted refs
  if (intent.channel === 'display' && String(r.mediaType).toLowerCase() === 'video') s += 2;
  if (intent.purpose === 'commercial_digital_display' && r.sourceId === 'src_pexels') s += 1;
  if (r.sourceId?.startsWith('src_cardbey')) s += 1;
  if (r.rightsSnapshot?.aiSuggestion === 'SUGGESTED') s += 0.5;
  if (r.rightsSnapshot?.status === 'REJECTED') s -= 5;
  if (r.aiMetadata?.confidence) s += Number(r.aiMetadata.confidence);
  return s;
}
