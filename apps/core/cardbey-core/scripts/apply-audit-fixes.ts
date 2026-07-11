#!/usr/bin/env tsx
/**
 * Apply confirmed self-audit fix proposals from latest report.
 */

import { SelfAuditOrchestrator } from '../src/selfAudit/orchestrator.js';
import { loadFixRecords } from '../src/selfAudit/fixHistory.js';
import { getLatestAuditReport } from '../src/selfAudit/fixHistory.js';

const args = process.argv.slice(2);
const confirm = args.includes('--confirm');

async function main(): Promise<void> {
  const proposed = loadFixRecords().filter((r) => r.status === 'proposed');
  const latest = getLatestAuditReport();

  if (proposed.length === 0 && !latest?.fixes?.length) {
    console.log('No proposed fixes to apply. Run npm run self-audit first.');
    return;
  }

  if (!confirm) {
    console.log('Governed fix apply requires confirmation.');
    console.log(`Proposed fixes: ${proposed.length}`);
    console.log('Run: npm run self-audit:fix -- --confirm');
    return;
  }

  const orchestrator = new SelfAuditOrchestrator();
  let applied = 0;

  for (const record of proposed) {
    const result = await orchestrator.applyFixByIssueId(record.issueId, {
      confirmed: true,
      executedBy: 'cli',
    });
    if (result) {
      applied += 1;
      console.log(`Applied: ${record.issueId}`);
    }
  }

  console.log(`\nApplied ${applied} fix proposal(s) (governed — no file writes).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
