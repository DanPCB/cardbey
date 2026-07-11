/**
 * Fix proposal for frontend infinite request loops.
 */

import type { AuditIssue } from '../detectors/base.detector.js';
import { BaseFixGenerator, PATH_A_GUARDRAILS, type FixPlan } from './base.fix.js';

export class FrontendLoopFix extends BaseFixGenerator {
  canFix(issue: AuditIssue): boolean {
    return issue.category === 'ui' && issue.id.includes('frontend-loop');
  }

  generate(issue: AuditIssue): FixPlan {
    return {
      issueId: issue.id,
      description:
        'Add request deduplication, in-flight guard, and debounce for intake POST and stream-token calls in useIntakeV2.',
      guardrails: { ...PATH_A_GUARDRAILS },
      status: 'proposed',
      files: [
        {
          path:
            'apps/dashboard/cardbey-marketing-dashboard/src/app/console/performer/useIntakeV2.ts',
          content: '',
          patch: `@@ handleSend
+ const inFlightRef = useRef(false);
+ if (inFlightRef.current) return;
+ inFlightRef.current = true;
+ try { ... } finally { inFlightRef.current = false; }`,
        },
      ],
      tests: [
        'Repeated stream-token calls are deduplicated',
        'No Maximum update depth exceeded in useEffect',
      ],
    };
  }
}
