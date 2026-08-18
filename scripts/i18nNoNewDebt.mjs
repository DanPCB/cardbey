/**
 * Pure i18n no-new-debt ratchet. Never auto-increases the audited baseline.
 */

const SHA_RE = /^[0-9a-f]{40}$/i;

/**
 * @param {unknown} raw
 */
export function loadAndValidateBaseline(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, code: 'BASELINE_MISSING_OR_CORRUPT', message: 'baseline is missing or not an object' };
  }
  const b = /** @type {Record<string, unknown>} */ (raw);
  if (!Number.isInteger(b.auditedGapCount) || /** @type {number} */ (b.auditedGapCount) < 0) {
    return { ok: false, code: 'BASELINE_CORRUPT_COUNT', message: 'auditedGapCount must be a non-negative integer' };
  }
  if (typeof b.sourceDashboardSha !== 'string' || !SHA_RE.test(b.sourceDashboardSha)) {
    return { ok: false, code: 'BASELINE_CORRUPT_SHA', message: 'sourceDashboardSha must be a 40-char git SHA' };
  }
  if (typeof b.auditDate !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(b.auditDate)) {
    return { ok: false, code: 'BASELINE_CORRUPT_DATE', message: 'auditDate must be YYYY-MM-DD' };
  }
  if (typeof b.historicalTargetGapCount !== 'number' || b.historicalTargetGapCount < 0) {
    return { ok: false, code: 'BASELINE_CORRUPT_TARGET', message: 'historicalTargetGapCount must be a non-negative number' };
  }
  if (typeof b.report !== 'string' || !b.report) {
    return { ok: false, code: 'BASELINE_CORRUPT_REPORT', message: 'report path is required' };
  }
  if (b.fileGapCounts != null && (typeof b.fileGapCounts !== 'object' || Array.isArray(b.fileGapCounts))) {
    return { ok: false, code: 'BASELINE_CORRUPT_FILE_COUNTS', message: 'fileGapCounts must be an object' };
  }
  return { ok: true, baseline: raw };
}

/**
 * @param {{
 *   count: number,
 *   fileCounts?: Record<string, number>,
 *   changedFiles?: string[],
 *   dashboardSha?: string | null,
 *   baseline: {
 *     auditedGapCount: number,
 *     historicalTargetGapCount: number,
 *     sourceDashboardSha: string,
 *     acceptedAuditedShas?: string[],
 *     fileGapCounts?: Record<string, number>,
 *     auditDate: string,
 *     report: string,
 *   },
 * }} input
 */
export function evaluateI18nNoNewDebt(input) {
  const { count, fileCounts = {}, changedFiles = [], dashboardSha = null, baseline } = input;
  const delta = count - baseline.auditedGapCount;
  const accepted = new Set(
    [baseline.sourceDashboardSha, ...(baseline.acceptedAuditedShas ?? [])].map((s) => s.toLowerCase()),
  );
  const shaKnown = Boolean(dashboardSha && accepted.has(dashboardSha.toLowerCase()));

  const changedFileFindings = [];
  for (const file of changedFiles) {
    const now = Number(fileCounts[file] ?? 0);
    const was = Number(baseline.fileGapCounts?.[file] ?? 0);
    if (now > was) {
      changedFileFindings.push({ file, was, now, added: now - was });
    }
  }

  let verdict = 'pass';
  let reason = 'equal';
  if (count > baseline.auditedGapCount) {
    verdict = 'fail';
    reason = 'count_increase';
  } else if (changedFileFindings.length > 0) {
    verdict = 'fail';
    reason = 'changed_file_regression';
  } else if (count < baseline.auditedGapCount) {
    verdict = 'pass';
    reason = 'improvement';
  }

  return {
    verdict,
    reason,
    count,
    auditedBaseline: baseline.auditedGapCount,
    historicalTarget: baseline.historicalTargetGapCount,
    delta,
    remainingVsTarget: count - baseline.historicalTargetGapCount,
    changedFileFindings,
    dashboardSha,
    shaKnown,
    sourceDashboardSha: baseline.sourceDashboardSha,
    auditDate: baseline.auditDate,
    report: baseline.report,
  };
}

export function formatI18nDebtReport(result) {
  const lines = [
    '## i18n no-new-debt gate',
    '',
    `- Verdict: **${result.verdict}** (${result.reason})`,
    `- Current audited debt: ${result.count}`,
    `- Audited baseline (do not auto-raise): ${result.auditedBaseline}`,
    `- Historical/product target: ${result.historicalTarget}`,
    `- Delta vs audited baseline: ${result.delta >= 0 ? '+' : ''}${result.delta}`,
    `- Remaining vs target: ${result.remainingVsTarget}`,
    `- Dashboard SHA: \`${result.dashboardSha ?? 'unknown'}\``,
    `- SHA in audited set: ${result.shaKnown ? 'yes' : 'no'} (source \`${result.sourceDashboardSha}\`)`,
    `- Audit date: ${result.auditDate}`,
    `- Report: ${result.report}`,
    '',
  ];
  if (result.changedFileFindings.length) {
    lines.push('### Changed-file findings (new gaps vs pinned file counts)');
    for (const f of result.changedFileFindings.slice(0, 40)) {
      lines.push(`- \`${f.file}\`: ${f.was} → ${f.now} (+${f.added})`);
    }
    if (result.changedFileFindings.length > 40) {
      lines.push(`- … +${result.changedFileFindings.length - 40} more`);
    }
    lines.push('');
  } else {
    lines.push('Changed-file findings: none');
    lines.push('');
  }
  lines.push('This gate does **not** claim translation debt is resolved.');
  lines.push('Prisma schema drift is a separate deployment-blocking gate.');
  return `${lines.join('\n')}\n`;
}
