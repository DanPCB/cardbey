import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

const MAX_HISTORY = 60;

/**
 * @param {unknown[]} violations
 */
export function buildTruthMetricsSnapshot(violations) {
  const list = Array.isArray(violations) ? violations : [];
  const errors = list.filter((v) => v?.severity === 'error');
  const warnings = list.filter((v) => v?.severity === 'warning');
  const byFile = new Map();

  for (const v of list) {
    const file = typeof v?.file === 'string' ? v.file : 'unknown';
    byFile.set(file, (byFile.get(file) || 0) + 1);
  }

  const topFiles = [...byFile.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([file, count]) => ({ file, count }));

  const errorCount = errors.length;
  const warningCount = warnings.length;
  const truthScore = Math.max(0, Math.min(100, 100 - errorCount * 3 - warningCount));

  return {
    errorCount,
    warningCount,
    truthScore,
    violationCount: list.length,
    topFiles,
    scannedAt: new Date().toISOString(),
  };
}

/**
 * @param {string} repoRoot
 * @param {ReturnType<typeof buildTruthMetricsSnapshot>} snapshot
 */
export function appendTruthMetricsHistory(repoRoot, snapshot) {
  const dir = path.join(repoRoot, '.cardbey');
  const filePath = path.join(dir, 'truth-metrics.json');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  let history = [];
  if (existsSync(filePath)) {
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
      history = Array.isArray(parsed?.history) ? parsed.history : [];
    } catch {
      history = [];
    }
  }

  history.push({
    at: snapshot.scannedAt,
    errorCount: snapshot.errorCount,
    warningCount: snapshot.warningCount,
    truthScore: snapshot.truthScore,
    violationCount: snapshot.violationCount,
  });
  if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);

  const prev = history.length >= 2 ? history[history.length - 2] : null;
  const last = history[history.length - 1];
  let trend = 'stable';
  if (prev && last.truthScore > prev.truthScore) trend = 'improving';
  else if (prev && last.truthScore < prev.truthScore) trend = 'declining';

  const payload = {
    updatedAt: snapshot.scannedAt,
    trend,
    current: snapshot,
    history,
  };
  writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
  return payload;
}
