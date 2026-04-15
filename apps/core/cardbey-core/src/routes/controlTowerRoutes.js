/**
 * Control Tower read-only API (admin).
 * GET /api/control-tower/*
 *
 * AuthZ: requireAuth + requireAdmin (same bar as /api/ops).
 * No deploy actions, no secrets, no raw config dumps.
 */

import { Router } from 'express';
import { getPrismaClient } from '../lib/prisma.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { loadGithubCiSummary } from '../lib/controlTowerGithubCi.js';

const router = Router();
router.use(requireAuth);
router.use(requireAdmin);

const WINDOW_DAYS = 30;

function windowStart() {
  return new Date(Date.now() - WINDOW_DAYS * 86400000);
}

function pctStr(numerator, denominator) {
  const d = Number(denominator) || 0;
  const n = Number(numerator) || 0;
  if (d < 5) return null;
  return `${Math.round((100 * n) / d)}%`;
}

function truthyEnv(name) {
  const v = process.env[name];
  if (v == null || v === '') return null;
  const s = String(v).toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no') return false;
  return null;
}

function envFlagSummary() {
  const keys = [
    { name: 'FF_CAMPAIGN_V2', keys: ['FF_CAMPAIGN_V2'] },
    { name: 'FF_CAPABILITY_PROPOSAL', keys: ['FF_CAPABILITY_PROPOSAL'] },
    { name: 'FF_PROMOTION_FLOW', keys: ['FF_PROMOTION_FLOW'] },
  ];
  const envLabel =
    process.env.CONTROL_TOWER_ENV_LABEL ||
    (process.env.NODE_ENV === 'production' ? 'prod' : 'non-prod');
  return keys.map(({ name, keys: envKeys }) => {
    let value = null;
    for (const k of envKeys) {
      const t = truthyEnv(k);
      if (t !== null) {
        value = t;
        break;
      }
    }
    return {
      name,
      env: envLabel,
      value,
      availability: value === null ? 'unavailable' : 'live',
    };
  });
}

function overallSourceStatus(parts) {
  const anyLive = parts.includes('live');
  const anyPartial = parts.includes('partial') || parts.includes('derived');
  if (anyLive && !anyPartial) return 'live';
  if (anyLive && anyPartial) return 'partial';
  if (anyPartial) return 'partial';
  return 'placeholder';
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function loadDbSnapshot(prisma) {
  const since = windowStart();

  const [
    missionRunTotal,
    missionRunCompleted,
    missionRunFailed,
    missionOperatorSucceeded,
    missionOperatorFailed,
    missionOperatorNeedsHuman,
    intentCompleted,
    intentFailed,
    draftTotal,
    draftCommitted,
    draftFailed,
    orchCompleted,
    orchFailed,
    campaignDone,
    campaignFailed,
    campaignOther,
    wfStoreCompleted,
    wfStoreFailed,
    userSignups,
    draftReadyish,
    insightRecent,
    wfStoreLatest,
  ] = await Promise.all([
    prisma.missionRun.count({ where: { createdAt: { gte: since } } }),
    prisma.missionRun.count({ where: { createdAt: { gte: since }, status: 'completed' } }),
    prisma.missionRun.count({ where: { createdAt: { gte: since }, status: 'failed' } }),
    prisma.missionOperatorRun.count({ where: { updatedAt: { gte: since }, status: 'succeeded' } }),
    prisma.missionOperatorRun.count({ where: { updatedAt: { gte: since }, status: 'failed' } }),
    prisma.missionOperatorRun.count({ where: { updatedAt: { gte: since }, status: 'needs_human' } }),
    prisma.intentRequest.count({ where: { updatedAt: { gte: since }, status: 'completed' } }),
    prisma.intentRequest.count({ where: { updatedAt: { gte: since }, status: 'failed' } }),
    prisma.draftStore.count({ where: { updatedAt: { gte: since } } }),
    prisma.draftStore.count({ where: { updatedAt: { gte: since }, status: 'committed' } }),
    prisma.draftStore.count({ where: { updatedAt: { gte: since }, status: 'failed' } }),
    prisma.orchestratorTask.count({ where: { updatedAt: { gte: since }, status: 'completed' } }),
    prisma.orchestratorTask.count({ where: { updatedAt: { gte: since }, status: 'failed' } }),
    prisma.campaignV2.count({ where: { updatedAt: { gte: since }, status: 'DONE' } }),
    prisma.campaignV2.count({ where: { updatedAt: { gte: since }, status: 'FAILED' } }),
    prisma.campaignV2.count({
      where: {
        updatedAt: { gte: since },
        status: { notIn: ['DONE', 'FAILED'] },
      },
    }),
    prisma.workflowRun.count({
      where: { workflowKey: 'store_creation', startedAt: { gte: since }, status: 'completed' },
    }),
    prisma.workflowRun.count({
      where: { workflowKey: 'store_creation', startedAt: { gte: since }, status: 'failed' },
    }),
    prisma.user.count({ where: { createdAt: { gte: since } } }),
    prisma.draftStore.count({
      where: {
        updatedAt: { gte: since },
        status: { in: ['ready', 'committed', 'generating', 'draft'] },
      },
    }),
    prisma.tenantInsight.findMany({
      where: { createdAt: { gte: since } },
      select: { kind: true, tags: true, severity: true },
      take: 400,
    }),
    prisma.workflowRun.findFirst({
      where: { workflowKey: 'store_creation' },
      orderBy: { startedAt: 'desc' },
      select: {
        status: true,
        startedAt: true,
        endedAt: true,
        failureCode: true,
        workflowKey: true,
      },
    }),
  ]);

  const missionTerminal = missionRunCompleted + missionRunFailed;
  const missionSuccessRate = pctStr(missionRunCompleted, missionTerminal);

  const operatorTerminal = missionOperatorSucceeded + missionOperatorFailed + missionOperatorNeedsHuman;
  const operatorOkRate = pctStr(missionOperatorSucceeded, operatorTerminal);

  const publishTerminal = draftCommitted + draftFailed;
  const publishSuccessRate = pctStr(draftCommitted, publishTerminal);

  const campaignTerminal = campaignDone + campaignFailed;
  const campaignSuccessRate = pctStr(campaignDone, campaignTerminal);

  const wfTerminal = wfStoreCompleted + wfStoreFailed;
  const wfStorePassRate = pctStr(wfStoreCompleted, wfTerminal);

  const promotionVerified = process.env.CONTROL_TOWER_PROMOTION_VERIFIED === 'true';

  return {
    since: since.toISOString(),
    missionRunTotal,
    missionRunCompleted,
    missionRunFailed,
    missionSuccessRate,
    missionOperatorSucceeded,
    missionOperatorFailed,
    missionOperatorNeedsHuman,
    operatorOkRate,
    intentCompleted,
    intentFailed,
    draftTotal,
    draftCommitted,
    draftFailed,
    publishSuccessRate,
    orchCompleted,
    orchFailed,
    campaignDone,
    campaignFailed,
    campaignOther,
    campaignSuccessRate,
    wfStoreCompleted,
    wfStoreFailed,
    wfStorePassRate,
    userSignups,
    draftReadyish,
    insightRecent,
    promotionVerified,
    wfStoreLatest,
  };
}

function smokeGateFromDbLatest(latest) {
  if (!latest) return 'unknown';
  const s = String(latest.status || '').toLowerCase();
  if (s === 'completed') return 'pass';
  if (s === 'failed') return 'fail';
  return 'unknown';
}

function insightThemes(insights) {
  const counts = new Map();
  for (const row of insights || []) {
    const k = row.kind && String(row.kind).trim() ? String(row.kind).trim() : 'uncategorized';
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

function stackStatusFromRates({ failRatioHint, blocked }) {
  if (blocked) return 'blocked';
  if (failRatioHint != null && failRatioHint > 0.25) return 'warning';
  if (failRatioHint != null && failRatioHint > 0.08) return 'warning';
  return 'healthy';
}

function buildStacks(snapshot) {
  const wfTerminal = snapshot.wfStoreCompleted + snapshot.wfStoreFailed;
  const wfPassPct = snapshot.wfStorePassRate
    ? parseInt(String(snapshot.wfStorePassRate), 10)
    : NaN;

  const missionFailRatio =
    snapshot.missionRunCompleted + snapshot.missionRunFailed > 0
      ? snapshot.missionRunFailed / (snapshot.missionRunCompleted + snapshot.missionRunFailed)
      : null;

  const ci = snapshot.ciSummary || {
    availability: 'unavailable',
    branch: 'main',
    repo: null,
    fetchedAt: new Date().toISOString(),
    runs: [],
    aggregateGate: 'unknown',
    coreTestsGate: 'unknown',
    dashboardTestsGate: 'unknown',
    note: 'CI summary not loaded',
  };

  const wfFiles = (process.env.CONTROL_TOWER_GITHUB_WORKFLOWS || 'tests.yml,contract-tests.yml')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const smokeGate = smokeGateFromDbLatest(snapshot.wfStoreLatest);
  const lastSmokeLabel = snapshot.wfStoreLatest
    ? `${snapshot.wfStoreLatest.status} @ ${snapshot.wfStoreLatest.startedAt?.toISOString?.() || snapshot.wfStoreLatest.startedAt}`
    : 'no runs';

  const deploymentKpis = [
    {
      label: 'GitHub CI (aggregate)',
      value: ci.aggregateGate,
      availability:
        ci.availability === 'live' ? 'live' : ci.availability === 'partial' ? 'partial' : 'unavailable',
      note: ci.note,
    },
  ];
  for (let i = 0; i < ci.runs.length; i++) {
    const r = ci.runs[i];
    const label =
      r.workflowFile === wfFiles[0]
        ? 'Core tests (GitHub workflow)'
        : r.workflowFile === wfFiles[1]
          ? 'Contract tests (GitHub workflow)'
          : `Workflow ${r.workflowFile}`;
    deploymentKpis.push({
      label,
      value: r.conclusion || r.status || r.error || 'unknown',
      availability: r.error ? 'partial' : ci.availability === 'unavailable' ? 'unavailable' : 'live',
    });
  }
  deploymentKpis.push({
    label: 'Store smoke — latest run (DB)',
    value: lastSmokeLabel,
    availability: snapshot.wfStoreLatest ? 'live' : 'partial',
  });
  deploymentKpis.push({
    label: 'Store smoke — pass rate (30d)',
    value: snapshot.wfStorePassRate ?? 'n/a (sample < 5)',
    availability: snapshot.wfStorePassRate ? 'derived' : 'partial',
  });

  const deploymentBlockers = [
    snapshot.promotionVerified
      ? 'Promotion path marked verified (CONTROL_TOWER_PROMOTION_VERIFIED)'
      : 'Production promotion path not marked verified (set CONTROL_TOWER_PROMOTION_VERIFIED=true when true)',
  ];
  if (ci.aggregateGate === 'fail') {
    deploymentBlockers.push('GitHub CI: at least one configured workflow last run did not succeed');
  }
  if (smokeGate === 'fail') {
    deploymentBlockers.push('Latest store_creation WorkflowRun in DB is failed');
  }
  if (ci.availability === 'unavailable') {
    deploymentBlockers.push(
      'GitHub CI not configured (CONTROL_TOWER_GITHUB_REPO + token) — CI gates remain unknown'
    );
  }
  if (!snapshot.wfStoreLatest) {
    deploymentBlockers.push('No store_creation WorkflowRun rows yet — stagingSmoke gate unknown');
  }

  const deploymentActions = ['Keep promotion gated until independently verified'];
  if (ci.availability === 'unavailable') {
    deploymentActions.unshift(
      'Set CONTROL_TOWER_GITHUB_REPO (owner/repo) and CONTROL_TOWER_GITHUB_TOKEN for live CI reads'
    );
  }
  if (ci.aggregateGate === 'fail') {
    deploymentActions.unshift('Investigate failing GitHub Actions workflow(s)');
  }

  const deployment = {
    promotionVerified: snapshot.promotionVerified,
    status: !snapshot.promotionVerified
      ? 'warning'
      : Number.isFinite(wfPassPct) && wfPassPct >= 75
        ? 'healthy'
        : 'warning',
    progress: Number.isFinite(wfPassPct) ? Math.min(100, wfPassPct) : 40,
    automation:
      wfTerminal >= 5 && Number.isFinite(wfPassPct)
        ? Math.min(100, Math.round(wfPassPct * 0.85))
        : 35,
    kpis: deploymentKpis,
    blockers: deploymentBlockers,
    actions: deploymentActions,
    gates: {
      ci: ci.aggregateGate,
      coreTests: ci.coreTestsGate,
      dashboardTests: ci.dashboardTestsGate,
      stagingSmoke: smokeGate,
      storeFlow:
        wfTerminal >= 3 ? Number.isFinite(wfPassPct) && wfPassPct >= 70 : 'unknown',
      missionTruthfulness: snapshot.missionRunTotal >= 5 && missionFailRatio != null && missionFailRatio < 0.2,
      promotionFlow: snapshot.promotionVerified,
    },
    gateNotes: {
      ci:
        ci.availability === 'unavailable'
          ? ci.note || 'Set CONTROL_TOWER_GITHUB_REPO and CONTROL_TOWER_GITHUB_TOKEN'
          : `GitHub Actions latest run per workflow on branch ${ci.branch} (${ci.repo || 'repo'})`,
      coreTests: wfFiles[0]
        ? `Workflow file .github/workflows/${wfFiles[0]}`
        : 'Set CONTROL_TOWER_GITHUB_WORKFLOWS (comma-separated filenames)',
      dashboardTests: wfFiles[1]
        ? `Second workflow .github/workflows/${wfFiles[1]} (contract / gold flows; not necessarily dashboard UI)`
        : 'No second workflow in CONTROL_TOWER_GITHUB_WORKFLOWS — gate stays unknown',
      stagingSmoke:
        'Latest WorkflowRun with workflowKey=store_creation in product DB (persisted smoke truth; not CI runner)',
      storeFlow:
        wfTerminal < 3
          ? 'insufficient store_creation workflow samples in window'
          : 'derived from WorkflowRun store_creation counts in window; not full E2E proof',
    },
    ci: {
      availability: ci.availability,
      branch: ci.branch,
      repo: ci.repo,
      fetchedAt: ci.fetchedAt,
      aggregateGate: ci.aggregateGate,
      workflows: ci.runs.map((r) => ({
        workflowFile: r.workflowFile,
        conclusion: r.conclusion,
        status: r.status,
        gate: r.gate,
        htmlUrl: r.htmlUrl,
        runStartedAt: r.runStartedAt,
        updatedAt: r.updatedAt,
      })),
      note: ci.note,
    },
    smokeTruth: {
      latest: snapshot.wfStoreLatest
        ? {
            status: snapshot.wfStoreLatest.status,
            startedAt:
              snapshot.wfStoreLatest.startedAt?.toISOString?.() || snapshot.wfStoreLatest.startedAt,
            endedAt: snapshot.wfStoreLatest.endedAt?.toISOString?.() || snapshot.wfStoreLatest.endedAt,
            failureCode: snapshot.wfStoreLatest.failureCode,
          }
        : null,
      window30d: {
        completed: snapshot.wfStoreCompleted,
        failed: snapshot.wfStoreFailed,
        passRate: snapshot.wfStorePassRate,
      },
      sourceStatus: 'live',
      note: 'WorkflowRun rows in Cardbey DB (workflowKey=store_creation)',
    },
  };

  const telemetry = {
    status: stackStatusFromRates({ failRatioHint: missionFailRatio, blocked: false }),
    progress: missionSuccessRateToProgress(snapshot.missionSuccessRate),
    automation: snapshot.intentCompleted + snapshot.intentFailed >= 5 ? 55 : 40,
    kpis: [
      {
        label: 'Mission runs (30d)',
        value: String(snapshot.missionRunTotal),
        availability: 'live',
      },
      {
        label: 'Mission success (completed vs failed)',
        value: snapshot.missionSuccessRate ?? 'n/a (sample < 5)',
        availability: snapshot.missionSuccessRate ? 'derived' : 'partial',
      },
      {
        label: 'Intent completed vs failed',
        value: `${snapshot.intentCompleted} / ${snapshot.intentFailed}`,
        availability: 'live',
      },
    ],
    blockers: [
      'API / frontend error rates are not aggregated here yet',
      'Campaign outcomes below are DB status only — not channel-verified',
    ],
    actions: ['Inspect failed MissionRun rows in admin tools', 'Add error budget sources when ready'],
    health: {
      publishSuccess: snapshot.publishSuccessRate ?? 'n/a',
      campaignSuccess: snapshot.campaignSuccessRate ?? 'n/a',
      completedCorrectedLater: null,
      improveResultsRate: null,
      notes: {
        publish:
          snapshot.publishSuccessRate == null
            ? 'insufficient committed+failed draft samples in window'
            : 'committed / (committed+failed) for DraftStore in window — not full publish pipeline proof',
        campaign:
          snapshot.campaignSuccessRate == null
            ? 'insufficient DONE+FAILED campaign samples in window'
            : 'DONE vs FAILED counts from CampaignV2 only',
        completedCorrectedLater: 'live source not wired yet',
        improveResultsRate: 'live source not wired yet',
      },
    },
  };

  const signups = Math.max(snapshot.userSignups, 1);
  const funnel = [
    {
      label: 'Signed up',
      value: 100,
      availability: snapshot.userSignups > 0 ? 'derived' : 'partial',
    },
    {
      label: 'Draft activity',
      value: Math.min(100, Math.round((100 * snapshot.draftReadyish) / signups)),
      availability: 'derived',
    },
    {
      label: 'Mission runs (share of signups)',
      value: Math.min(100, Math.round((100 * snapshot.missionRunTotal) / signups)),
      availability: 'partial',
    },
    {
      label: 'Campaigns terminal',
      value: Math.min(
        100,
        Math.round((100 * (snapshot.campaignDone + snapshot.campaignFailed)) / signups)
      ),
      availability: 'partial',
    },
  ];

  const gtm = {
    status: 'blocked',
    progress: 35,
    automation: 30,
    kpis: [
      {
        label: 'New users (30d)',
        value: String(snapshot.userSignups),
        availability: 'live',
      },
      {
        label: 'Draft touchpoints (30d)',
        value: String(snapshot.draftReadyish),
        availability: 'live',
      },
      {
        label: 'Campaigns DONE (30d)',
        value: String(snapshot.campaignDone),
        availability: 'live',
      },
    ],
    blockers: [
      'CRM / activation analytics are not wired',
      'Funnel is a coarse DB-derived sketch, not marketing truth',
    ],
    actions: ['Connect CRM milestones when available', 'Replace funnel denominators with product definitions'],
    funnel,
    milestones: [
      { label: 'CRM setup', done: false, availability: 'placeholder' },
      { label: 'Email sequences', done: false, availability: 'placeholder' },
      { label: 'Landing pages', done: false, availability: 'placeholder' },
      { label: 'Outreach machine', done: false, availability: 'placeholder' },
      {
        label: 'First 10 beta users',
        done: snapshot.userSignups >= 10,
        availability: 'derived',
      },
      { label: 'First 20 paying users', done: false, availability: 'placeholder' },
    ],
  };

  const flags = envFlagSummary();
  const product = {
    status: 'warning',
    progress: 55,
    automation: 40,
    kpis: [
      {
        label: 'Mission operator succeeded (30d)',
        value: String(snapshot.missionOperatorSucceeded),
        availability: 'live',
      },
      {
        label: 'Mission operator failed + needs_human',
        value: String(snapshot.missionOperatorFailed + snapshot.missionOperatorNeedsHuman),
        availability: 'live',
      },
      {
        label: 'Operator OK rate',
        value: snapshot.operatorOkRate ?? 'n/a (sample < 5)',
        availability: snapshot.operatorOkRate ? 'derived' : 'partial',
      },
    ],
    blockers: [
      'Feature flags below are env key summaries only (no remote flag service)',
      'Protected-path health is not fully instrumented here',
    ],
    actions: ['Review env-flag allowlist in controlTowerRoutes.js', 'Add service-level flag provider when ready'],
    flags,
  };

  const themes = insightThemes(snapshot.insightRecent);
  const feedback = {
    status: themes.length ? 'healthy' : 'warning',
    progress: themes.length ? Math.min(100, 40 + themes.length * 5) : 30,
    automation: 25,
    kpis: [
      {
        label: 'Tenant insights captured (30d)',
        value: String(snapshot.insightRecent.length),
        availability: 'live',
      },
      {
        label: 'NPS',
        value: 'n/a',
        availability: 'placeholder',
      },
      {
        label: 'Urgent follow-ups',
        value: 'n/a',
        availability: 'placeholder',
      },
    ],
    blockers:
      themes.length === 0
        ? ['No TenantInsight rows in window — themes empty']
        : ['Themes are kind-level rollups only'],
    actions: ['Tag insights consistently for richer themes', 'Wire NPS source when available'],
    themes: themes.length
      ? themes
      : [
          { label: 'No signal in window', count: 0, availability: 'placeholder' },
        ],
  };

  return { deployment, telemetry, gtm, product, feedback };
}

function missionSuccessRateToProgress(rateStr) {
  if (!rateStr || typeof rateStr !== 'string') return 45;
  const n = parseInt(rateStr, 10);
  if (Number.isFinite(n)) return Math.max(0, Math.min(100, n));
  return 45;
}

async function getSnapshot() {
  const prisma = getPrismaClient();
  const [snap, ciSummary] = await Promise.all([loadDbSnapshot(prisma), loadGithubCiSummary()]);
  const merged = { ...snap, ciSummary };
  const stacks = buildStacks(merged);
  return { snap: merged, stacks };
}

router.get('/overview', async (req, res) => {
  try {
    const { snap, stacks } = await getSnapshot();
    const sourceStatus = overallSourceStatus([
      'partial',
      snap.missionRunTotal >= 5 ? 'live' : 'partial',
      'partial',
      'partial',
      snap.insightRecent.length ? 'derived' : 'placeholder',
    ]);

    const summary = {
      overallStatus: stacks.telemetry.status,
      currentPhase: 'V1 Rollout Hardening',
      weeklyFocus: 'Store → publish → campaign trust path',
      nextCriticalAction: snap.promotionVerified
        ? 'Review telemetry and campaign verification gaps.'
        : 'Do not treat promotion as safe until independently verified (see deployment gates).',
      weeklyMomentum: missionSuccessRateToProgress(snap.missionSuccessRate),
      note: 'summary mixes live DB hints with operator copy; see per-stack sourceStatus',
    };

    const stackCards = {
      deployment: {
        ...stacks.deployment,
        sourceStatus:
          snap.ciSummary?.availability === 'live' && snap.wfStoreLatest
            ? 'live'
            : snap.ciSummary?.availability === 'live' || snap.wfStoreLatest
              ? 'partial'
              : 'partial',
        note: 'GitHub CI (optional env) + DB WorkflowRun store_creation smoke; no fake green',
      },
      telemetry: {
        ...stacks.telemetry,
        sourceStatus: snap.missionRunTotal >= 5 ? 'live' : 'partial',
        note: 'error rates not wired; mission rates from MissionRun',
      },
      gtm: {
        ...stacks.gtm,
        sourceStatus: 'partial',
        note: 'live source not wired yet for CRM; funnel is derived',
      },
      product: {
        ...stacks.product,
        sourceStatus: 'partial',
        note: 'flags from env allowlist only',
      },
      feedback: {
        ...stacks.feedback,
        sourceStatus: snap.insightRecent.length ? 'derived' : 'placeholder',
        note:
          snap.insightRecent.length === 0
            ? 'no TenantInsight rows in window'
            : 'themes from TenantInsight.kind',
      },
    };

    const timeline = [
      { week: 'Week 1', focus: 'CI + environment foundation', done: true, availability: 'placeholder' },
      { week: 'Week 2', focus: 'Staging smoke + protected paths', done: false, availability: 'placeholder' },
      { week: 'Week 3', focus: 'GTM machine setup', done: false, availability: 'placeholder' },
      { week: 'Week 4', focus: 'Controlled rollout', done: false, availability: 'placeholder' },
    ];

    const topBlockers = [
      stacks.deployment.blockers[0],
      stacks.gtm.blockers[0],
      stacks.telemetry.blockers[0],
    ].filter(Boolean);

    const actionQueue = [
      {
        id: 1,
        title: 'Verify promotion path outside of this UI before enabling in prod',
        owner: 'Operator',
        priority: 'high',
        availability: 'placeholder',
      },
      {
        id: 2,
        title: `Mission failures (30d): ${snap.missionRunFailed} — triage in admin tooling`,
        owner: 'Operator',
        priority: snap.missionRunFailed > 0 ? 'high' : 'low',
        availability: 'live',
      },
      {
        id: 3,
        title:
          snap.ciSummary?.availability === 'unavailable'
            ? 'Configure CONTROL_TOWER_GITHUB_REPO + token for CI gates'
            : 'Review deployment stack gates (CI + DB smoke) after each release',
        owner: 'Operator',
        priority: 'medium',
        availability: snap.ciSummary?.availability === 'unavailable' ? 'partial' : 'live',
      },
    ];

    return res.json({
      ok: true,
      sourceStatus,
      summary,
      stackCards,
      topBlockers,
      timeline,
      actionQueue,
      window: { days: WINDOW_DAYS, since: snap.since },
    });
  } catch (err) {
    console.error('[control-tower/overview]', err);
    return res.status(500).json({
      ok: false,
      error: 'control_tower_overview_failed',
      message: err?.message || 'overview failed',
    });
  }
});

function sendStackSection(req, res, key) {
  getSnapshot()
    .then(({ stacks, snap }) => {
      const body = stacks[key];
      if (!body) {
        return res.status(404).json({ ok: false, error: 'not_found' });
      }
      const meta = {
        ok: true,
        sourceStatus: 'partial',
        window: { days: WINDOW_DAYS, since: snap.since },
        note: 'read-only slice; see stack.sourceStatus when present',
      };
      if (key === 'deployment') {
        return res.json({
          ...meta,
          sourceStatus:
            snap.ciSummary?.availability === 'live' && snap.wfStoreLatest ? 'live' : 'partial',
          status: body.status,
          progress: body.progress,
          automation: body.automation,
          kpis: body.kpis,
          blockers: body.blockers,
          actions: body.actions,
          gates: body.gates,
          gateNotes: body.gateNotes,
          ci: body.ci,
          smokeTruth: body.smokeTruth,
        });
      }
      if (key === 'telemetry') {
        return res.json({
          ...meta,
          status: body.status,
          progress: body.progress,
          automation: body.automation,
          kpis: body.kpis,
          blockers: body.blockers,
          actions: body.actions,
          health: body.health,
        });
      }
      if (key === 'gtm') {
        return res.json({
          ...meta,
          sourceStatus: 'partial',
          status: body.status,
          progress: body.progress,
          automation: body.automation,
          kpis: body.kpis,
          blockers: body.blockers,
          actions: body.actions,
          funnel: body.funnel,
          milestones: body.milestones,
        });
      }
      if (key === 'product') {
        return res.json({
          ...meta,
          status: body.status,
          progress: body.progress,
          automation: body.automation,
          kpis: body.kpis,
          blockers: body.blockers,
          actions: body.actions,
          flags: body.flags,
        });
      }
      if (key === 'feedback') {
        return res.json({
          ...meta,
          status: body.status,
          progress: body.progress,
          automation: body.automation,
          kpis: body.kpis,
          blockers: body.blockers,
          actions: body.actions,
          themes: body.themes,
        });
      }
      return res.json({ ...meta, ...body });
    })
    .catch((err) => {
      console.error(`[control-tower/${key}]`, err);
      res.status(500).json({
        ok: false,
        error: `control_tower_${key}_failed`,
        message: err?.message || 'failed',
      });
    });
}

router.get('/deployment', (req, res) => sendStackSection(req, res, 'deployment'));
router.get('/telemetry', (req, res) => sendStackSection(req, res, 'telemetry'));
router.get('/gtm', (req, res) => sendStackSection(req, res, 'gtm'));
router.get('/product', (req, res) => sendStackSection(req, res, 'product'));
router.get('/feedback', (req, res) => sendStackSection(req, res, 'feedback'));

export default router;
