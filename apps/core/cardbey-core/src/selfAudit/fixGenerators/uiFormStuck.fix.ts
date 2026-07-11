/**
 * Fix proposal for UI form stuck — route DeepSeek responses before static form.
 */

import type { AuditIssue } from '../detectors/base.detector.js';
import { BaseFixGenerator, PATH_A_GUARDRAILS, type FixPlan } from './base.fix.js';

const INTAKE_PATH =
  'apps/dashboard/cardbey-marketing-dashboard/src/app/console/performer/useIntakeV2.ts';

export class UIFormStuckFix extends BaseFixGenerator {
  canFix(issue: AuditIssue): boolean {
    return issue.category === 'ui' && issue.id.includes('ui-form-stuck');
  }

  generate(issue: AuditIssue): FixPlan {
    return {
      issueId: issue.id,
      description:
        'Add early routing in useIntakeV2: handle show_execution_plan, multi_agent_dispatched, and proactive_plan before create_store / store_creation_draft.',
      guardrails: { ...PATH_A_GUARDRAILS },
      status: 'proposed',
      files: [
        {
          path: INTAKE_PATH,
          content: '',
          patch: `@@ useIntakeV2 response switch
+ // Before create_store case: if executionPlan/pendingTopology/multi_agent metadata present,
+ // route to show_execution_plan or multi_agent_dispatched handler.
+ if (effectiveIntake.executionPlan || effectiveIntake.pendingTopology?.nodes?.length) {
+   effectiveIntake = { ...effectiveIntake, action: 'show_execution_plan' };
+ }`,
        },
        {
          path: 'apps/core/cardbey-core/src/lib/multiAgent/deepseekIntakeBridge.ts',
          content: '',
          patch: 'Ensure multi-store clarification returns proactive_plan, not create_store.',
        },
      ],
      tests: [
        'Multi-store message shows clarification or execution plan, not static form',
        'show_execution_plan renders TopologyReviewCard',
        'create_store form only when no DeepSeek response',
      ],
    };
  }
}
