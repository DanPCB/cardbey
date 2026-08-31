import { createHash } from 'node:crypto';
import type {
  ApprovalState,
  ConnectionMessageDraft,
  ConnectionPlan,
  ConnectionApprovalRecord,
  ConnectionStatus,
} from './connectionTypes.js';

export const G5_GOVERNANCE_VERSION = 'g5.0.0-governed';
export const G5_PROPOSED_ACTION = 'send_customer_message' as const;

const REQUIRES_CONFIRMATION_ACTIONS = new Set(['send_customer_message', 'external_publish', 'publish']);

export function requiresHumanApproval(proposedAction: string = G5_PROPOSED_ACTION): boolean {
  return REQUIRES_CONFIRMATION_ACTIONS.has(proposedAction);
}

export function hashMessageContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 32);
}

export function buildMessageVersionHash(draft: Pick<ConnectionMessageDraft, 'subject' | 'body'>): string {
  return hashMessageContent(`${draft.subject ?? ''}\n${draft.body}`);
}

export function validateExecutionGate(params: {
  plan: ConnectionPlan;
  approval: ConnectionApprovalRecord | null;
  currentMessageHash: string;
  idempotencyKeyUsed: boolean;
  channelAvailable: boolean;
}): { ok: true } | { ok: false; status: ConnectionStatus; reason: string } {
  const { plan, approval, currentMessageHash, idempotencyKeyUsed, channelAvailable } = params;

  if (plan.governanceStatus !== 'APPROVED' || !approval) {
    return { ok: false, status: 'APPROVAL_REQUIRED', reason: 'Human approval required before execution' };
  }

  if (approval.messageVersionHash !== currentMessageHash) {
    return { ok: false, status: 'REAPPROVAL_REQUIRED', reason: 'Message changed after approval — re-approval required' };
  }

  if (plan.connectionStatus === 'BLOCKED' || plan.governanceStatus === 'BLOCKED') {
    return { ok: false, status: 'BLOCKED', reason: 'Connection plan is blocked' };
  }

  if (!channelAvailable && plan.executionMode === 'DIRECT_EXECUTABLE') {
    return { ok: false, status: 'CHANNEL_UNAVAILABLE', reason: 'Channel no longer available for direct execution' };
  }

  if (!plan.recipient.contactTarget) {
    return { ok: false, status: 'CONTACT_TARGET_UNAVAILABLE', reason: 'No verified contact target' };
  }

  if (idempotencyKeyUsed) {
    return { ok: false, status: 'EXECUTED', reason: 'Duplicate execution prevented' };
  }

  return { ok: true };
}

export function transitionToReview(plan: ConnectionPlan): ConnectionPlan {
  return {
    ...plan,
    governanceStatus: 'READY_FOR_REVIEW',
    connectionStatus: 'REVIEW_REQUIRED',
    approvalRequired: true,
  };
}

export function applyApproval(
  plan: ConnectionPlan,
  approval: ConnectionApprovalRecord,
): ConnectionPlan {
  return {
    ...plan,
    governanceStatus: 'APPROVED',
    connectionStatus: 'APPROVED',
    approvalRequired: false,
  };
}

export function applyRejection(plan: ConnectionPlan): ConnectionPlan {
  return {
    ...plan,
    governanceStatus: 'REJECTED',
    connectionStatus: 'REJECTED',
  };
}

export function buildIdempotencyKey(connectionPlanId: string, messageVersionHash: string): string {
  return `g5:${connectionPlanId}:${messageVersionHash}`;
}

export function createExecutionTrace(input: {
  sourceIntent: string;
  connectionPlanId: string;
  signalId: string;
  proposedAction?: string;
  confirmationState: ApprovalState;
  executedBy?: string | null;
}) {
  return {
    sourceIntent: input.sourceIntent,
    missionId: null,
    targetId: input.connectionPlanId,
    proposedAction: input.proposedAction ?? G5_PROPOSED_ACTION,
    confirmationState:
      input.confirmationState === 'APPROVED'
        ? ('confirmed' as const)
        : input.confirmationState === 'REJECTED'
          ? ('rejected' as const)
          : ('pending' as const),
    executedBy: input.executedBy ?? null,
    timestamp: new Date().toISOString(),
    signalId: input.signalId,
    connectionPlanId: input.connectionPlanId,
  };
}
