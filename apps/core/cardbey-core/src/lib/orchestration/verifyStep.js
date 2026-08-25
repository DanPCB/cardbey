/**
 * Verify step — quality floor after orchestration agents complete (Phase 6).
 * Kept under 30s: rule-based alignment only (no Claude required for the floor).
 */

/**
 * @param {{
 *   missionId?: string,
 *   brief?: string,
 *   artifacts?: Array<Record<string, unknown>>,
 *   storeKnowledge?: Record<string, unknown> | null,
 *   blackboard?: { set?: Function, appendEvent?: Function } | null,
 * }} context
 * @returns {Promise<{ passed: boolean, score: number, issues: string[] }>}
 */
export async function runVerifyStep(context = {}) {
  const artifacts = Array.isArray(context.artifacts) ? context.artifacts : [];
  const brief = String(context.brief ?? '').trim();
  const storeKnowledge = context.storeKnowledge ?? null;
  const issues = [];
  let score = 0;

  if (!artifacts.length) {
    issues.push('No artifacts produced by the action agent');
  } else {
    score += 30;
  }

  const validArtifacts = artifacts.filter(
    (a) =>
      a &&
      typeof a === 'object' &&
      a.type &&
      (a.content || a.url || a.graphicUrl || a.artifactUrl || a.summary || a.result),
  );
  if (artifacts.length && validArtifacts.length < artifacts.length) {
    issues.push(`${artifacts.length - validArtifacts.length} artifacts have missing content`);
  } else if (artifacts.length) {
    score += 30;
  }

  if (brief && storeKnowledge) {
    const alignment = checkBriefAlignmentLocal(brief, artifacts, storeKnowledge);
    if (alignment.aligned) score += 40;
    else issues.push(`Output may not match brief: ${alignment.reason}`);
  } else {
    score += 20;
  }

  const passed = score >= 60 && issues.length === 0;
  const verifyResult = {
    passed,
    score,
    issues,
    verifiedAt: new Date().toISOString(),
  };

  try {
    context.blackboard?.set?.('verify_result', verifyResult);
  } catch {
    // non-fatal
  }
  if (context.missionId && context.blackboard?.appendEvent) {
    try {
      await context.blackboard.appendEvent(context.missionId, 'verify_complete', verifyResult);
    } catch {
      // non-fatal
    }
  }

  return verifyResult;
}

function checkBriefAlignmentLocal(brief, artifacts, storeKnowledge) {
  const lower = brief.toLowerCase();
  const types = artifacts.map((a) => String(a.type ?? '').toLowerCase());
  const name = String(storeKnowledge?.name ?? '').toLowerCase();

  if (/graphic|poster|image|visual|promo/.test(lower)) {
    if (types.some((t) => /graphic|promotion|poster|image|package/.test(t))) {
      return { aligned: true, reason: 'graphic-related artifact present' };
    }
    return { aligned: false, reason: 'expected a graphic-related artifact' };
  }
  if (/analytic|report|performance/.test(lower)) {
    if (types.some((t) => /analytics|report/.test(t))) {
      return { aligned: true, reason: 'analytics artifact present' };
    }
    return { aligned: false, reason: 'expected an analytics report artifact' };
  }
  if (/campaign/.test(lower)) {
    if (types.some((t) => /campaign|package|graphic|copy/.test(t)) || artifacts.length > 0) {
      return { aligned: true, reason: 'campaign deliverable present' };
    }
  }
  if (name && lower.includes(name.split(/\s+/)[0])) {
    return { aligned: true, reason: 'brief references store name' };
  }
  if (artifacts.length > 0) {
    return { aligned: true, reason: 'artifacts produced for brief' };
  }
  return { aligned: false, reason: 'no clear alignment signal' };
}
