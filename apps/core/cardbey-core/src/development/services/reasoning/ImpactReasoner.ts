/**
 * Generic impact reasoner interface for the Development Runtime.
 *
 * An ImpactReasoner turns frozen mission evidence + repository context into a
 * mission-specific DevelopmentImpactReport without hard-coded mission classes.
 */

import type { DevelopmentMission } from '../../types/DevelopmentMission.js';
import type { DevelopmentEvidence } from '../../types/DevelopmentEvidence.js';
import type { DevelopmentImpactReport } from '../../types/DevelopmentImpactReport.js';

export interface ImpactReasoningInput {
  mission: DevelopmentMission;
  evidence: DevelopmentEvidence;
  repoRoot: string;
  /** Canonical commit SHA that the workspace must later be checked out at. */
  repoRevision?: string;
}

export interface ImpactReasoner {
  analyse(input: ImpactReasoningInput): Promise<DevelopmentImpactReport>;
}
