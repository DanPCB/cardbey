/**
 * Fix proposal for multi-store incomplete planning.
 */

import type { AuditIssue } from '../detectors/base.detector.js';
import { BaseFixGenerator, PATH_A_GUARDRAILS, type FixPlan } from './base.fix.js';

export class MultiStoreFix extends BaseFixGenerator {
  canFix(issue: AuditIssue): boolean {
    return issue.category === 'agent' && issue.id.includes('multi-store-incomplete');
  }

  generate(issue: AuditIssue): FixPlan {
    return {
      issueId: issue.id,
      description:
        'Wire generateMultiStoreClarificationResponse in deepseekIntakeBridge before static form fallback. Reuse multiStorePlanHelpers (already in planner).',
      guardrails: { ...PATH_A_GUARDRAILS },
      status: 'proposed',
      files: [
        {
          path: 'apps/core/cardbey-core/src/lib/multiAgent/deepseekIntakeBridge.ts',
          content: '',
          patch: `@@ integrateDeepSeekMultiAgentIntake
+ if (isMultiStoreRequest(message)) {
+   const info = extractMultiStoreInfo(message);
+   if (info.missingFields.length > 0) {
+     return { handled: true, response: generateMultiStoreClarificationResponse(info, message) };
+   }
+ }`,
        },
        {
          path: 'apps/core/cardbey-core/src/lib/multiAgent/multiStorePlanHelpers.ts',
          content: '',
          patch: 'Verify extractMultiStoreInfo and generateClarificationPlan cover store_names, categories, specific_locations.',
        },
      ],
      tests: [
        '"Set up 3 stores in different cities" triggers clarification for missing names/categories/locations',
        'Planner returns clarification plan when missingFields non-empty',
      ],
    };
  }
}
