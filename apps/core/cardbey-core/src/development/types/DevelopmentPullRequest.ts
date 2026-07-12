/**
 * Pull request record for a development mission.
 */

export interface DevelopmentPullRequest {
  id: string;
  missionId: string;
  patchId: string;
  branchName: string;
  commitHash?: string;
  prUrl?: string;
  prNumber?: number;
  state: 'PREPARING' | 'READY' | 'CREATED' | 'FAILED';
  manualCommand?: string;
  createdAt: string;
  errorCode?: string;
  errorMessage?: string;
}
