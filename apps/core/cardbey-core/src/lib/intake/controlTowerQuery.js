import path from 'node:path';

const CONTROL_TOWER_ENDPOINTS = {
  telemetry: '/api/console/telemetry',
  deployment: '/api/console/deployment',
  missions: '/api/console/missions?filter=corrected&limit=20',
};

function asNumber(v, fallback = 0) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normaliseTelemetry(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    apiErrorRate: asNumber(r.apiErrorRate ?? r.api_error_rate ?? 0),
    frontendErrorRate: asNumber(r.frontendErrorRate ?? r.frontend_error_rate ?? 0),
    missionSuccessRate: asNumber(r.missionSuccessRate ?? r.mission_success ?? 0),
    publishSuccessRate: asNumber(r.publishSuccessRate ?? r.publish_success ?? 0),
    campaignSuccessRate: asNumber(r.campaignSuccessRate ?? r.campaign_success ?? 0),
    completedThenCorrected: asNumber(r.completedThenCorrected ?? r.corrected_count ?? 0),
    improveResultsRate: asNumber(r.improveResultsRate ?? r.improve_rate ?? 0),
    activationRate: asNumber(r.activationRate ?? r.activation ?? 0),
  };
}

function normaliseDeployment(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const gates = (r.gates ?? r.deploymentGates ?? {}) || {};
  const entries = Object.entries(gates);
  const failing = entries
    .filter(([, v]) => v === false || v === 'false' || v === 'fail')
    .map(([k]) => k);
  const passing = entries
    .filter(([, v]) => v === true || v === 'true' || v === 'pass')
    .map(([k]) => k);

  return {
    overallReadiness: asNumber(r.overallReadiness ?? r.overall_readiness ?? 0),
    smokePass: asNumber(r.smokePass ?? r.smoke_pass ?? 0),
    deploySuccess: asNumber(r.deploySuccess ?? r.deploy_success ?? 0),
    rollbackCount: asNumber(r.rollbackCount ?? r.rollback_count ?? 0),
    failingGates: failing,
    passingGates: passing,
  };
}

function normaliseMissions(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const missions = Array.isArray(r.missions) ? r.missions : Array.isArray(r.data) ? r.data : [];

  /** @type {Record<string, number>} */
  const typeCounts = {};
  const correctedMissions = missions.map((m) => {
    const mm = m && typeof m === 'object' ? m : {};
    const errorType = String(mm.errorType ?? 'unknown');
    typeCounts[errorType] = (typeCounts[errorType] ?? 0) + 1;
    return {
      missionId: String(mm.missionId ?? mm.id ?? ''),
      errorType,
      correctedAt: String(mm.correctedAt ?? mm.updated_at ?? ''),
      storeId: mm.storeId ?? null,
    };
  });

  const topCorrectedErrorTypes = Object.entries(typeCounts)
    .map(([errorType, count]) => ({ errorType, count }))
    .sort((a, b) => b.count - a.count);

  return { correctedMissions, topCorrectedErrorTypes };
}

function deriveBlockers({ telemetry, deployment, missions }) {
  const blockers = [];

  if (deployment?.failingGates?.length) {
    for (const gate of deployment.failingGates) {
      blockers.push({
        priority: 'high',
        description: `Deployment gate failing: ${gate}`,
        source: 'deployment',
        actionable: true,
      });
    }
  }

  if (telemetry?.activationRate < 0.3) {
    blockers.push({
      priority: 'high',
      description: `Activation rate ${Math.round((telemetry.activationRate ?? 0) * 100)}% is below 30% target`,
      source: 'telemetry',
      actionable: false,
    });
  }

  if (telemetry?.frontendErrorRate > 0.01) {
    blockers.push({
      priority: 'medium',
      description: `Frontend error rate ${((telemetry.frontendErrorRate ?? 0) * 100).toFixed(1)}% exceeds 1% threshold`,
      source: 'telemetry',
      actionable: true,
    });
  }

  if (telemetry?.apiErrorRate > 0.02) {
    blockers.push({
      priority: 'medium',
      description: `API error rate ${((telemetry.apiErrorRate ?? 0) * 100).toFixed(1)}% exceeds 2% threshold`,
      source: 'telemetry',
      actionable: true,
    });
  }

  if ((missions?.correctedMissions?.length ?? 0) > 10) {
    const top = missions?.topCorrectedErrorTypes?.[0];
    blockers.push({
      priority: 'medium',
      description:
        `${missions.correctedMissions.length} missions corrected after completion` +
        (top ? ` (top error: ${top.errorType})` : ''),
      source: 'missions',
      actionable: true,
    });
  }

  if (telemetry?.campaignSuccessRate < 0.8) {
    blockers.push({
      priority: 'medium',
      description: `Campaign success ${Math.round((telemetry.campaignSuccessRate ?? 0) * 100)}% below 80% target`,
      source: 'telemetry',
      actionable: false,
    });
  }

  return blockers;
}

export function formatControlTowerSummary(summary, tracedBlockers = []) {
  const s = summary && typeof summary === 'object' ? summary : null;
  if (!s) return 'Control Tower unavailable.';

  const sourceList = (
    Array.isArray(tracedBlockers) && tracedBlockers.length ? tracedBlockers : s.blockers ?? []
  ).filter((b) => b && typeof b === 'object');

  const high = sourceList.filter((b) => b.priority === 'high');
  const medium = sourceList.filter((b) => b.priority === 'medium');
  const total = high.length + medium.length;

  const lines = [];
  if (total === 0) {
    lines.push('✅ Control Tower: no issues detected.');
  } else {
    lines.push(`Control Tower shows ${total} issue${total === 1 ? '' : 's'} needing attention:\n`);
  }

  const renderGroup = (label, items) => {
    if (!items.length) return;
    lines.push(label);
    for (const b of items) {
      lines.push(`• ${b.description}`);
      if (b.tracedFile) lines.push(`  → traced to: ${path.basename(String(b.tracedFile))}`);
      if (b.actionable === false) lines.push('  → business metric, code fix not applicable');
    }
    lines.push('');
  };

  renderGroup('🔴 HIGH', high);
  renderGroup('🟡 MEDIUM', medium);

  const t = s.telemetry;
  const d = s.deployment;
  if (t && d) {
    lines.push(
      `Deployment: smoke ${Math.round((d.smokePass ?? 0) * 100)}% · deploy ${Math.round((d.deploySuccess ?? 0) * 100)}% · rollbacks ${d.rollbackCount ?? 0}`,
    );
    lines.push(
      `Mission success: ${Math.round((t.missionSuccessRate ?? 0) * 100)}% · Publish: ${Math.round((t.publishSuccessRate ?? 0) * 100)}%`,
    );
  }

  const firstActionable = sourceList.find(
    (b) => b.actionable && (b.tracedFile || b.source === 'deployment'),
  );
  if (firstActionable) {
    const target = firstActionable.tracedFile
      ? path.basename(String(firstActionable.tracedFile))
      : firstActionable.description;
    lines.push(`\nWant me to fix ${target} first?`);
  }

  return lines.join('\n');
}

export async function queryControlTower({ context }) {
  const base = String(process.env.INTERNAL_API_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

  const headers = {
    'Content-Type': 'application/json',
    'x-maintenance-token': String(context?.maintenanceToken ?? ''),
    'x-performer-role': 'super_admin',
  };

  const skipped = [];
  const rawResults = { telemetry: null, deployment: null, missions: null };

  for (const [key, endpoint] of Object.entries(CONTROL_TOWER_ENDPOINTS)) {
    try {
      const res = await fetch(`${base}${endpoint}`, {
        headers,
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      rawResults[key] = await res.json();
    } catch (err) {
      console.warn(`[controlTowerQuery] ${key} fetch failed:`, err?.message ?? String(err));
      skipped.push(key);
      rawResults[key] = null;
    }
  }

  const telemetry = normaliseTelemetry(rawResults.telemetry);
  const deployment = normaliseDeployment(rawResults.deployment);
  const missions = normaliseMissions(rawResults.missions);
  const blockers = deriveBlockers({ telemetry, deployment, missions });

  return {
    telemetry,
    deployment,
    missions,
    blockers,
    fetchedAt: new Date().toISOString(),
    skipped,
  };
}
