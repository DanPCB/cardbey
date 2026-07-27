/**
 * Base fix generator types for governed self-audit proposals.
 */

import type { AuditIssue } from '../detectors/base.detector.js';

export interface FixFile {
  path: string;
  content: string;
  patch: string;
}

export interface FixPlan {
  issueId: string;
  files: FixFile[];
  description: string;
  tests: string[];
  guardrails: {
    proposalOnly: boolean;
    noFileWrites: boolean;
    noAutoApply: boolean;
    humanApprovalRequired: boolean;
  };
  status: 'proposed' | 'applied' | 'rejected' | 'dismissed';
  playbookId?: string;
}

export abstract class BaseFixGenerator {
  abstract canFix(issue: AuditIssue): boolean;
  abstract generate(issue: AuditIssue): FixPlan;
}

export const PATH_A_GUARDRAILS = {
  proposalOnly: true,
  noFileWrites: true,
  noAutoApply: true,
  humanApprovalRequired: true,
} as const;
