#!/usr/bin/env tsx
/**
 * Generate markdown/JSON audit report from fix history.
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadFixRecords, getLatestAuditReport } from '../src/selfAudit/fixHistory.js';
import { getSelfAuditStatus } from '../src/selfAudit/orchestrator.js';

const HISTORY_DIR = path.resolve(process.cwd(), 'self-audit-reports');

function ensureDir(): void {
  if (!fs.existsSync(HISTORY_DIR)) {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
  }
}

function generateMarkdown(): string {
  const status = getSelfAuditStatus();
  const latest = getLatestAuditReport();
  const records = loadFixRecords();

  const lines = [
    '# Cardbey Self-Audit Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Status',
    '',
    `- Enabled: ${status.enabled}`,
    `- Last run: ${status.lastRunAt ?? 'never'}`,
    `- Open issues: ${status.issueCount}`,
    `- Critical: ${status.criticalCount}`,
    `- High: ${status.highCount}`,
    `- Proposed fixes: ${status.proposedFixes}`,
    '',
  ];

  if (latest) {
    lines.push('## Latest Run', '');
    lines.push(`- Issues found: ${latest.issuesFound}`);
    lines.push(`- Fixes proposed: ${latest.fixesProposed}`);
    lines.push(`- Success: ${latest.success}`);
    lines.push('');
  }

  if (status.openIssues.length > 0) {
    lines.push('## Open Issues', '');
    for (const issue of status.openIssues) {
      lines.push(`### [${issue.severity}] ${issue.title}`);
      lines.push('');
      lines.push(issue.description);
      lines.push('');
      lines.push(`- Location: \`${issue.location}\``);
      lines.push(`- Suggested fix: ${issue.suggestedFix}`);
      lines.push('');
    }
  }

  if (records.length > 0) {
    lines.push('## Fix History', '');
    for (const r of records.slice(-20).reverse()) {
      lines.push(`- **${r.status}** ${r.issueId} — ${r.description.slice(0, 80)}...`);
    }
  }

  return lines.join('\n');
}

function main(): void {
  ensureDir();
  const md = generateMarkdown();
  const timestamp = Date.now();
  const mdPath = path.join(HISTORY_DIR, `report-${timestamp}.md`);
  const jsonPath = path.join(HISTORY_DIR, `report-${timestamp}-summary.json`);

  fs.writeFileSync(mdPath, md);
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        status: getSelfAuditStatus(),
        fixRecords: loadFixRecords().length,
      },
      null,
      2,
    ),
  );

  console.log(`Report written: ${mdPath}`);
  console.log(`Summary: ${jsonPath}`);
}

main();
