/**
 * Provider-neutral coding engine interface for the Cardbey Development Runtime.
 *
 * A CodingProvider is responsible only for turning an approved design into a
 * proposed set of file changes inside an isolated mission worktree. It must not
 * manage mission state, approvals, persistence, git commits, or pull requests.
 */

import type { DevelopmentMission } from '../../types/DevelopmentMission.js';
import type { DevelopmentDesign } from '../../types/DevelopmentDesign.js';
import type { DevelopmentImpactReport } from '../../types/DevelopmentImpactReport.js';
import type { DevelopmentCheckRun } from '../../types/DevelopmentCheckRun.js';

export type CodingProviderFileChangeType = 'MODIFY' | 'CREATE' | 'DELETE';

export interface CodingProviderFileChange {
  /** Relative path inside the workspace root. */
  path: string;
  /** Previous file content. Empty string for CREATE. */
  before: string;
  /** New file content. Empty string for DELETE. */
  after: string;
  changeType: CodingProviderFileChangeType;
}

export interface CodingProviderContext {
  mission: DevelopmentMission;
  design: DevelopmentDesign;
  workspaceRoot: string;
  workspaceId: string;
  author: string;
  /** Impact report produced by RepositoryImpactReasoner, including the selected change surface. */
  impactReport?: DevelopmentImpactReport;
  /** Check failures from a previous attempt, when re-entering implementation. */
  priorFailures?: DevelopmentCheckRun[];
}

export interface CodingProvider {
  readonly id: string;

  /**
   * Return true if this provider can implement the approved design for the
   * given mission. The resolver tests providers in order; the first match wins.
   */
  canImplement(context: Pick<CodingProviderContext, 'mission' | 'design'>): boolean;

  /**
   * Produce a diagnosis and a set of bounded file changes. The provider must
   * not write files itself; Cardbey validates and applies each change.
   */
  implement(context: CodingProviderContext): Promise<{
    diagnosis: string;
    fileChanges: CodingProviderFileChange[];
  }>;
}
