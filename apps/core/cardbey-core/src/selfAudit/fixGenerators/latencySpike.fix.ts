/**
 * Fix proposal for API latency spikes.
 */

import type { AuditIssue } from '../detectors/base.detector.js';
import { BaseFixGenerator, PATH_A_GUARDRAILS, type FixPlan } from './base.fix.js';

export class LatencySpikeFix extends BaseFixGenerator {
  canFix(issue: AuditIssue): boolean {
    return issue.category === 'performance' && issue.id.includes('latency-spike');
  }

  generate(issue: AuditIssue): FixPlan {
    return {
      issueId: issue.id,
      description:
        'Reduce MULTI_AGENT_PARALLEL_LIMIT, add request timeout, profile slow agent steps via AGENT_TRACE_ENABLED.',
      guardrails: { ...PATH_A_GUARDRAILS },
      status: 'proposed',
      files: [
        {
          path: 'apps/core/cardbey-core/src/multiAgent/config/agent.config.ts',
          content: '',
          patch: 'Review parallelLimit default (5) and DeepSeek timeout settings.',
        },
        {
          path: 'apps/core/cardbey-core/src/multiAgent/orchestrator/pipeline.ts',
          content: '',
          patch: 'Add per-step duration logging for SLO breach diagnosis.',
        },
      ],
      tests: ['P95 latency under 5000ms for intake v2 under load'],
    };
  }
}
