import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadAndValidateBaseline, evaluateI18nNoNewDebt } from './i18nNoNewDebt.mjs';

const VALID = {
  auditedGapCount: 2553,
  sourceDashboardSha: '431406682f5ece98d561a839e1b397433aa2ccb8',
  acceptedAuditedShas: ['80f63c166bf448eda68c76cf304b2342ce36f8dd'],
  auditDate: '2026-08-15',
  report: 'docs/reports/I18N_TRANSLATION_DEBT_STAGING.md',
  historicalTargetGapCount: 1213,
  fileGapCounts: { 'pages/Foo.tsx': 2, 'app/Bar.tsx': 1 },
};

describe('i18n no-new-debt baseline metadata', () => {
  it('accepts a complete baseline including dashboard SHA', () => {
    const r = loadAndValidateBaseline(VALID);
    assert.equal(r.ok, true);
    assert.equal(r.baseline.sourceDashboardSha, VALID.sourceDashboardSha);
  });

  it('rejects missing baseline', () => {
    const r = loadAndValidateBaseline(null);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'BASELINE_MISSING_OR_CORRUPT');
  });

  it('rejects corrupt count', () => {
    const r = loadAndValidateBaseline({ ...VALID, auditedGapCount: '2553' });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'BASELINE_CORRUPT_COUNT');
  });

  it('rejects missing/short dashboard SHA', () => {
    const r = loadAndValidateBaseline({ ...VALID, sourceDashboardSha: '43140668' });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'BASELINE_CORRUPT_SHA');
  });

  it('pins audited dashboard SHA metadata in the committed baseline file', () => {
    const baselineFile = path.join(path.dirname(fileURLToPath(import.meta.url)), 'i18n-debt-baseline.json');
    const raw = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
    const r = loadAndValidateBaseline(raw);
    assert.equal(r.ok, true);
    assert.equal(r.baseline.sourceDashboardSha, '431406682f5ece98d561a839e1b397433aa2ccb8');
    assert.equal(r.baseline.auditedGapCount, 2553);
    assert.equal(r.baseline.auditDate, '2026-08-15');
    assert.equal(r.baseline.historicalTargetGapCount, 1213);
    assert.equal(r.baseline.report, 'docs/reports/I18N_TRANSLATION_DEBT_STAGING.md');
  });
});

describe('i18n no-new-debt evaluate', () => {
  it('passes when count equals the audited baseline', () => {
    const r = evaluateI18nNoNewDebt({
      count: 2553,
      fileCounts: VALID.fileGapCounts,
      changedFiles: [],
      dashboardSha: VALID.sourceDashboardSha,
      baseline: VALID,
    });
    assert.equal(r.verdict, 'pass');
    assert.equal(r.reason, 'equal');
    assert.equal(r.delta, 0);
    assert.equal(r.historicalTarget, 1213);
    assert.equal(r.shaKnown, true);
  });

  it('fails when count increases', () => {
    const r = evaluateI18nNoNewDebt({
      count: 2554,
      fileCounts: { ...VALID.fileGapCounts, 'pages/Foo.tsx': 3 },
      changedFiles: ['pages/Foo.tsx'],
      dashboardSha: VALID.sourceDashboardSha,
      baseline: VALID,
    });
    assert.equal(r.verdict, 'fail');
    assert.equal(r.reason, 'count_increase');
    assert.equal(r.delta, 1);
  });

  it('passes and reports improvement when count decreases', () => {
    const r = evaluateI18nNoNewDebt({
      count: 2550,
      fileCounts: { 'pages/Foo.tsx': 0, 'app/Bar.tsx': 0 },
      changedFiles: ['pages/Foo.tsx'],
      dashboardSha: VALID.sourceDashboardSha,
      baseline: VALID,
    });
    assert.equal(r.verdict, 'pass');
    assert.equal(r.reason, 'improvement');
    assert.equal(r.delta, -3);
  });

  it('fails changed-file regression while total is unchanged', () => {
    const r = evaluateI18nNoNewDebt({
      count: 2553,
      fileCounts: { 'pages/Foo.tsx': 5, 'app/Bar.tsx': 0 },
      changedFiles: ['pages/Foo.tsx'],
      dashboardSha: VALID.sourceDashboardSha,
      baseline: VALID,
    });
    assert.equal(r.verdict, 'fail');
    assert.equal(r.reason, 'changed_file_regression');
    assert.deepEqual(r.changedFileFindings, [{ file: 'pages/Foo.tsx', was: 2, now: 5, added: 3 }]);
  });

  it('records unknown dashboard SHA without skipping the numeric gate', () => {
    const r = evaluateI18nNoNewDebt({
      count: 2553,
      fileCounts: VALID.fileGapCounts,
      changedFiles: [],
      dashboardSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      baseline: VALID,
    });
    assert.equal(r.verdict, 'pass');
    assert.equal(r.shaKnown, false);
  });
});
