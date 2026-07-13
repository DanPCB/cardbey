import type { DevelopmentMissionState } from '../types/DevelopmentMission.js';

export interface StateTransition {
  from: DevelopmentMissionState;
  to: DevelopmentMissionState;
}

export class DevelopmentStateMachine {
  private transitions: StateTransition[] = [
    { from: 'REQUESTED', to: 'EVIDENCE_REQUIRED' },
    { from: 'REQUESTED', to: 'ANALYSING' },
    { from: 'REQUESTED', to: 'CANCELLED' },

    { from: 'EVIDENCE_REQUIRED', to: 'ANALYSING' },
    { from: 'EVIDENCE_REQUIRED', to: 'CANCELLED' },

    { from: 'ANALYSING', to: 'IMPACT_ANALYSED' },
    { from: 'ANALYSING', to: 'FAILED' },
    { from: 'ANALYSING', to: 'CANCELLED' },

    { from: 'IMPACT_ANALYSED', to: 'DESIGN_PROPOSED' },
    { from: 'IMPACT_ANALYSED', to: 'ANALYSING' },
    { from: 'IMPACT_ANALYSED', to: 'CANCELLED' },

    { from: 'DESIGN_PROPOSED', to: 'AWAITING_DESIGN_APPROVAL' },
    { from: 'DESIGN_PROPOSED', to: 'CANCELLED' },

    { from: 'AWAITING_DESIGN_APPROVAL', to: 'WORKSPACE_PREPARING' },
    { from: 'AWAITING_DESIGN_APPROVAL', to: 'IMPACT_ANALYSED' },
    { from: 'AWAITING_DESIGN_APPROVAL', to: 'CANCELLED' },

    { from: 'WORKSPACE_PREPARING', to: 'IMPLEMENTING' },
    { from: 'WORKSPACE_PREPARING', to: 'FAILED' },
    { from: 'WORKSPACE_PREPARING', to: 'CANCELLED' },

    { from: 'IMPLEMENTING', to: 'PATCH_READY' },
    { from: 'IMPLEMENTING', to: 'FAILED' },
    { from: 'IMPLEMENTING', to: 'CANCELLED' },

    { from: 'PATCH_READY', to: 'TESTING' },

    { from: 'TESTING', to: 'TEST_FAILED' },
    { from: 'TESTING', to: 'AWAITING_CODE_REVIEW' },

    { from: 'TEST_FAILED', to: 'PATCH_READY' },
    { from: 'TEST_FAILED', to: 'IMPLEMENTING' },
    { from: 'TEST_FAILED', to: 'CANCELLED' },

    { from: 'AWAITING_CODE_REVIEW', to: 'READY_FOR_PR' },
    { from: 'AWAITING_CODE_REVIEW', to: 'PATCH_READY' },
    { from: 'AWAITING_CODE_REVIEW', to: 'CANCELLED' },

    { from: 'READY_FOR_PR', to: 'PR_CREATED' },
    { from: 'READY_FOR_PR', to: 'CANCELLED' },

    { from: 'PR_CREATED', to: 'CI_RUNNING' },
    { from: 'PR_CREATED', to: 'CANCELLED' },

    { from: 'CI_RUNNING', to: 'CI_FAILED' },
    { from: 'CI_RUNNING', to: 'READY_FOR_STAGING' },

    { from: 'CI_FAILED', to: 'PR_CREATED' },
    { from: 'CI_FAILED', to: 'CANCELLED' },

    { from: 'READY_FOR_STAGING', to: 'STAGING_DEPLOYING' },
    { from: 'STAGING_DEPLOYING', to: 'STAGING_VERIFYING' },
    { from: 'STAGING_DEPLOYING', to: 'STAGING_FAILED' },
    { from: 'STAGING_VERIFYING', to: 'AWAITING_RELEASE_APPROVAL' },
    { from: 'STAGING_VERIFYING', to: 'STAGING_FAILED' },
    { from: 'STAGING_FAILED', to: 'READY_FOR_STAGING' },
    { from: 'STAGING_FAILED', to: 'CANCELLED' },
    { from: 'AWAITING_RELEASE_APPROVAL', to: 'PRODUCTION_DEPLOYING' },
    { from: 'AWAITING_RELEASE_APPROVAL', to: 'ROLLED_BACK' },
    { from: 'AWAITING_RELEASE_APPROVAL', to: 'CANCELLED' },
    { from: 'PRODUCTION_DEPLOYING', to: 'PRODUCTION_VERIFYING' },
    { from: 'PRODUCTION_DEPLOYING', to: 'ROLLED_BACK' },
    { from: 'PRODUCTION_VERIFYING', to: 'COMPLETED' },
    { from: 'PRODUCTION_VERIFYING', to: 'ROLLED_BACK' },
    { from: 'ROLLED_BACK', to: 'CANCELLED' },
  ];

  validateTransition(from: DevelopmentMissionState, to: DevelopmentMissionState): boolean {
    return this.transitions.some((t) => t.from === from && t.to === to);
  }

  getNextStates(current: DevelopmentMissionState): DevelopmentMissionState[] {
    return this.transitions.filter((t) => t.from === current).map((t) => t.to);
  }

  getStateDescription(state: DevelopmentMissionState): string {
    const descriptions: Partial<Record<DevelopmentMissionState, string>> = {
      REQUESTED: 'Mission requested, awaiting evidence',
      EVIDENCE_REQUIRED: 'Evidence needs to be collected and frozen',
      ANALYSING: 'Analysing evidence and impact',
      IMPACT_ANALYSED: 'Impact analysis complete — review before design',
      DESIGN_PROPOSED: 'Design proposal generated',
      AWAITING_DESIGN_APPROVAL: 'Waiting for design approval',
      WORKSPACE_PREPARING: 'Preparing isolated workspace',
      IMPLEMENTING: 'Implementation in progress',
      PATCH_READY: 'Patch ready for testing',
      TESTING: 'Running tests and checks',
      TEST_FAILED: 'Tests failed, need to fix',
      AWAITING_CODE_REVIEW: 'Awaiting code review',
      READY_FOR_PR: 'Patch approved — ready for pull request',
      PR_CREATED: 'Pull request created',
      FAILED: 'Mission failed',
      CANCELLED: 'Cancelled',
    };
    return descriptions[state] || state;
  }
}

export const stateMachine = new DevelopmentStateMachine();
