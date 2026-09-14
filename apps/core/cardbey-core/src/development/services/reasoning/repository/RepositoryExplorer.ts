import type { DevelopmentMission } from '../../../types/DevelopmentMission.js';
import type { DevelopmentEvidence } from '../../../types/DevelopmentEvidence.js';

export type RepositoryRelationship =
  | 'SUSPECTED_FILE'
  | 'ROUTE_OWNER'
  | 'IMPORTED_BY_ROUTE_OWNER'
  | 'IMPORTS_RELEVANT_FILE'
  | 'FILENAME_MATCH'
  | 'DIRECTORY_PROXIMITY'
  | 'KEYWORD_MATCH'
  | 'TEST_FOR_CANDIDATE'
  | 'ROUTE_DEFINITION_UNRESOLVED';

export interface RepositoryCandidate {
  path: string;
  score: number;
  reasons: string[];
  matchedTerms: string[];
  relationship: RepositoryRelationship;
}

export interface RepositoryExplorerResult {
  candidates: RepositoryCandidate[];
  routeOwners: Record<string, string | null>;
  lowConfidence: boolean;
  findings: string[];
}

export interface RepositoryExplorerInput {
  mission: DevelopmentMission;
  evidence: DevelopmentEvidence;
  repoRoot: string;
}

export interface RepositoryExplorer {
  explore(input: RepositoryExplorerInput): Promise<RepositoryExplorerResult>;
}
