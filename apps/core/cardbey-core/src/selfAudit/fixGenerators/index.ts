/**
 * Self-audit fix generator registry.
 */

export type { FixFile, FixPlan } from './base.fix.js';
export { BaseFixGenerator, PATH_A_GUARDRAILS } from './base.fix.js';

export { UIFormStuckFix } from './uiFormStuck.fix.js';
export { MultiStoreFix } from './multiStore.fix.js';
export { DatabaseConnectionFix } from './databaseConnection.fix.js';
export { LatencySpikeFix } from './latencySpike.fix.js';
export { FrontendLoopFix } from './frontendLoop.fix.js';
export { MemoryLeakFix } from './memoryLeak.fix.js';

import type { AuditIssue } from '../detectors/base.detector.js';
import type { BaseFixGenerator } from './base.fix.js';
import { UIFormStuckFix } from './uiFormStuck.fix.js';
import { MultiStoreFix } from './multiStore.fix.js';
import { DatabaseConnectionFix } from './databaseConnection.fix.js';
import { LatencySpikeFix } from './latencySpike.fix.js';
import { FrontendLoopFix } from './frontendLoop.fix.js';
import { MemoryLeakFix } from './memoryLeak.fix.js';
import { buildPlaybookFixPlan } from '../integration/fixPlaybookBridge.js';

const ALL_GENERATORS: BaseFixGenerator[] = [
  new UIFormStuckFix(),
  new MultiStoreFix(),
  new DatabaseConnectionFix(),
  new LatencySpikeFix(),
  new FrontendLoopFix(),
  new MemoryLeakFix(),
];

/**
 * Generate governed fix plans for detected issues.
 */
export function generateFixPlans(issues: AuditIssue[]) {
  const plans = [];
  for (const issue of issues) {
    if (!issue.autoFixable) continue;

    if (issue.telemetryId) {
      const playbookPlan = buildPlaybookFixPlan(issue);
      if (playbookPlan) {
        plans.push(playbookPlan);
        continue;
      }
    }

    for (const gen of ALL_GENERATORS) {
      if (gen.canFix(issue)) {
        plans.push(gen.generate(issue));
        break;
      }
    }
  }
  return plans;
}
