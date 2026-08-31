import type {
  ConnectionApprovalRecord,
  ConnectionExecutionAdapter,
  ConnectionPlan,
  ConnectionResult,
  G5Outcome,
} from './connectionTypes.js';
import {
  applyApproval,
  buildIdempotencyKey,
  buildMessageVersionHash,
  createExecutionTrace,
  validateExecutionGate,
} from './connectionGovernance.js';
import { composeConnectionMessageHtml } from './composeConnectionMessage.js';
import {
  getConnectionRecord,
  getExecutionResult,
  hasIdempotencyKey,
  markIdempotencyKey,
  saveApproval,
  saveExecutionResult,
  saveRejection,
  updateConnectionPlan,
} from './connectionStore.js';

export function approveConnection(input: {
  connectionPlanId: string;
  approvedBy: string;
  messageVersionHash?: string;
}): { ok: true; approval: ConnectionApprovalRecord; plan: ConnectionPlan } | { ok: false; outcome: G5Outcome; reason: string } {
  const record = getConnectionRecord(input.connectionPlanId);
  if (!record) {
    return { ok: false, outcome: 'APPROVAL_INVALID', reason: 'Connection plan not found' };
  }

  const plan = record.plan;
  if (!plan.messageDraft) {
    return { ok: false, outcome: 'APPROVAL_INVALID', reason: 'No message draft to approve' };
  }

  const hash = input.messageVersionHash ?? plan.messageDraft.versionHash;
  if (hash !== plan.messageDraft.versionHash) {
    return { ok: false, outcome: 'APPROVAL_INVALID', reason: 'Message version hash mismatch at approval' };
  }

  const approval: ConnectionApprovalRecord = {
    connectionPlanId: input.connectionPlanId,
    approvedBy: input.approvedBy,
    approvedAt: new Date().toISOString(),
    messageVersionHash: hash,
    channel: plan.recommendedChannel,
    recipientValue: plan.recipient.contactTarget?.value ?? '',
    approvalState: 'APPROVED',
  };

  saveApproval(approval);
  const updatedPlan = applyApproval(plan, approval);
  updateConnectionPlan(updatedPlan);

  return { ok: true, approval, plan: updatedPlan };
}

export function rejectConnection(connectionPlanId: string, rejectedBy: string): boolean {
  const record = saveRejection(connectionPlanId, rejectedBy);
  return Boolean(record);
}

/**
 * Execute an approved connection through injectable adapter — never auto-executes without approval.
 */
export async function executeApprovedConnection(input: {
  connectionPlanId: string;
  executedBy: string;
  adapter: ConnectionExecutionAdapter;
  messageOverride?: string | null;
}): Promise<ConnectionResult> {
  const record = getConnectionRecord(input.connectionPlanId);
  if (!record) {
    return failedResult(input.connectionPlanId, '', 'APPROVAL_INVALID', 'Connection plan not found');
  }

  const existing = getExecutionResult(input.connectionPlanId);
  if (existing?.outcome === 'EXECUTED' || existing?.outcome === 'MANUAL_HANDOFF_REQUIRED') {
    return { ...existing, duplicatePrevented: true, outcome: 'DUPLICATE_EXECUTION_PREVENTED' };
  }

  const plan = record.plan;
  const approval = record.approval;
  const messageBody = input.messageOverride ?? plan.messageDraft?.body ?? '';
  const currentHash = buildMessageVersionHash({
    subject: plan.messageDraft?.subject ?? '',
    body: messageBody,
  });
  const idempotencyKey = buildIdempotencyKey(input.connectionPlanId, approval?.messageVersionHash ?? currentHash);

  if (hasIdempotencyKey(idempotencyKey)) {
    const prior = getExecutionResult(input.connectionPlanId);
    if (prior) {
      return { ...prior, duplicatePrevented: true, outcome: 'DUPLICATE_EXECUTION_PREVENTED' };
    }
  }

  const gate = validateExecutionGate({
    plan,
    approval,
    currentMessageHash: currentHash,
    idempotencyKeyUsed: false,
    channelAvailable:
      plan.executionMode === 'DIRECT_EXECUTABLE' && input.adapter.isEmailChannelAvailable(),
  });

  if (!gate.ok) {
    if (gate.status === 'REAPPROVAL_REQUIRED') {
      return failedResult(
        input.connectionPlanId,
        plan.signalId,
        'REAPPROVAL_REQUIRED',
        gate.reason,
        idempotencyKey,
        plan.recommendedChannel,
        plan.executionMode,
      );
    }
    if (gate.status === 'APPROVAL_REQUIRED') {
      return failedResult(
        input.connectionPlanId,
        plan.signalId,
        'APPROVAL_REQUIRED',
        gate.reason,
        idempotencyKey,
        plan.recommendedChannel,
        plan.executionMode,
      );
    }
  }

  createExecutionTrace({
    sourceIntent: plan.objective,
    connectionPlanId: plan.connectionPlanId,
    signalId: plan.signalId,
    confirmationState: 'APPROVED',
    executedBy: input.executedBy,
  });

  if (plan.executionMode === 'MANUAL_HANDOFF' || plan.executionMode === 'PUBLISH_AND_SHARE') {
    const result: ConnectionResult = {
      connectionPlanId: plan.connectionPlanId,
      signalId: plan.signalId,
      status: 'MANUAL_HANDOFF_REQUIRED',
      outcome: 'MANUAL_HANDOFF_REQUIRED',
      executionMode: plan.executionMode,
      channel: plan.recommendedChannel,
      recipient: plan.recipient.contactTarget?.value ?? null,
      executedAt: new Date().toISOString(),
      executedBy: input.executedBy,
      idempotencyKey,
      manualHandoff: {
        message: plan.messageDraft!,
        contactTarget: plan.recipient.contactTarget,
        trackedDestination: plan.trackedDestination,
        instructions:
          plan.recommendedChannel === 'ORIGINAL_SOCIAL_CONTEXT'
            ? 'Copy the prepared message and send manually via the original social platform. Cardbey cannot auto-DM.'
            : 'Copy the prepared message and send via the recommended channel manually.',
      },
      attributionContext: plan.trackedDestination?.attribution ?? null,
    };
    markIdempotencyKey(idempotencyKey, plan.connectionPlanId);
    saveExecutionResult(result);
    return result;
  }

  if (plan.executionMode === 'DIRECT_EXECUTABLE' && plan.recommendedChannel === 'EMAIL') {
    const contact = plan.recipient.contactTarget;
    if (!contact || contact.type !== 'email') {
      return failedResult(
        input.connectionPlanId,
        plan.signalId,
        'CONTACT_TARGET_UNAVAILABLE',
        'Email contact required for direct execution',
        idempotencyKey,
        plan.recommendedChannel,
        plan.executionMode,
      );
    }

    if (!input.adapter.isEmailChannelAvailable()) {
      return failedResult(
        input.connectionPlanId,
        plan.signalId,
        'CHANNEL_UNAVAILABLE',
        'Email channel not available',
        idempotencyKey,
        plan.recommendedChannel,
        plan.executionMode,
      );
    }

    const html = composeConnectionMessageHtml(plan.messageDraft!, plan.trackedDestination?.url);
    const sendResult = await input.adapter.sendEmail({
      to: contact.value,
      subject: plan.messageDraft?.subject ?? 'Cardbey — prepared for your review',
      html,
      text: messageBody,
      idempotencyKey,
      attributionContext: plan.trackedDestination!.attribution,
    });

    if (sendResult.duplicatePrevented) {
      const prior = getExecutionResult(input.connectionPlanId);
      if (prior) return { ...prior, duplicatePrevented: true, outcome: 'DUPLICATE_EXECUTION_PREVENTED' };
    }

    if (!sendResult.ok) {
      const result = failedResult(
        input.connectionPlanId,
        plan.signalId,
        'EXECUTION_FAILED',
        sendResult.error ?? 'Email send failed',
        idempotencyKey,
        plan.recommendedChannel,
        plan.executionMode,
      );
      saveExecutionResult(result);
      return result;
    }

    const result: ConnectionResult = {
      connectionPlanId: plan.connectionPlanId,
      signalId: plan.signalId,
      status: 'EXECUTED',
      outcome: 'EXECUTED',
      executionMode: plan.executionMode,
      channel: plan.recommendedChannel,
      recipient: contact.value,
      externalReference: sendResult.externalReference ?? null,
      executedAt: new Date().toISOString(),
      executedBy: input.executedBy,
      idempotencyKey,
      attributionContext: plan.trackedDestination?.attribution ?? null,
    };
    markIdempotencyKey(idempotencyKey, plan.connectionPlanId);
    saveExecutionResult(result);
    return result;
  }

  return failedResult(
    input.connectionPlanId,
    plan.signalId,
    'CHANNEL_UNAVAILABLE',
    `Execution not supported for mode ${plan.executionMode}`,
    idempotencyKey,
    plan.recommendedChannel,
    plan.executionMode,
  );
}

function failedResult(
  connectionPlanId: string,
  signalId: string,
  outcome: G5Outcome,
  reason: string,
  idempotencyKey = '',
  channel: ConnectionResult['channel'] = 'MANUAL_CONTACT',
  executionMode: ConnectionResult['executionMode'] = 'UNAVAILABLE',
): ConnectionResult {
  return {
    connectionPlanId,
    signalId,
    status: outcome === 'REAPPROVAL_REQUIRED' ? 'REAPPROVAL_REQUIRED' : 'FAILED',
    outcome,
    executionMode,
    channel,
    idempotencyKey,
    failureReason: reason,
  };
}

/** Dry-run adapter for tests — never sends real email. */
export function createDryRunConnectionAdapter(): ConnectionExecutionAdapter {
  const sent = new Map<string, { to: string; subject: string }>();
  return {
    name: 'dry_run',
    isEmailChannelAvailable: () => true,
    async sendEmail(input) {
      if (sent.has(input.idempotencyKey)) {
        return { ok: false, duplicatePrevented: true, error: 'Duplicate prevented' };
      }
      sent.set(input.idempotencyKey, { to: input.to, subject: input.subject });
      return { ok: true, externalReference: `dry_run_${input.idempotencyKey.slice(0, 8)}` };
    },
  };
}

/** Records sends in-memory for test assertions. */
export function createRecordingConnectionAdapter(): ConnectionExecutionAdapter & {
  getSent(): Array<{ to: string; subject: string; idempotencyKey: string }>;
} {
  const sent: Array<{ to: string; subject: string; idempotencyKey: string }> = [];
  return {
    name: 'recording',
    isEmailChannelAvailable: () => true,
    async sendEmail(input) {
      const dup = sent.some((s) => s.idempotencyKey === input.idempotencyKey);
      if (dup) return { ok: false, duplicatePrevented: true };
      sent.push({ to: input.to, subject: input.subject, idempotencyKey: input.idempotencyKey });
      return { ok: true, externalReference: `rec_${sent.length}` };
    },
    getSent: () => [...sent],
  };
}
