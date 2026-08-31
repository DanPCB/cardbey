import type {
  ConnectionPlan,
  ConnectionApprovalRecord,
  ConnectionResult,
} from './connectionTypes.js';

export type StoredConnectionRecord = {
  plan: ConnectionPlan;
  approval: ConnectionApprovalRecord | null;
  executionResult: ConnectionResult | null;
  idempotencyKeys: Set<string>;
  auditLog: Array<Record<string, unknown>>;
};

const store = new Map<string, StoredConnectionRecord>();

export function saveConnectionPlan(plan: ConnectionPlan): StoredConnectionRecord {
  const record: StoredConnectionRecord = {
    plan,
    approval: null,
    executionResult: null,
    idempotencyKeys: new Set(),
    auditLog: [{ action: 'plan_saved', at: new Date().toISOString(), connectionPlanId: plan.connectionPlanId }],
  };
  store.set(plan.connectionPlanId, record);
  return record;
}

export function getConnectionRecord(connectionPlanId: string): StoredConnectionRecord | undefined {
  return store.get(connectionPlanId);
}

export function updateConnectionPlan(plan: ConnectionPlan): void {
  const existing = store.get(plan.connectionPlanId);
  if (existing) {
    existing.plan = plan;
    existing.auditLog.push({ action: 'plan_updated', at: new Date().toISOString() });
  } else {
    saveConnectionPlan(plan);
  }
}

export function saveApproval(approval: ConnectionApprovalRecord): StoredConnectionRecord | null {
  const record = store.get(approval.connectionPlanId);
  if (!record) return null;
  record.approval = approval;
  record.plan = {
    ...record.plan,
    governanceStatus: 'APPROVED',
    connectionStatus: 'APPROVED',
    approvalRequired: false,
  };
  record.auditLog.push({
    action: 'approved',
    at: approval.approvedAt,
    approvedBy: approval.approvedBy,
    messageVersionHash: approval.messageVersionHash,
  });
  return record;
}

export function saveRejection(connectionPlanId: string, rejectedBy: string): StoredConnectionRecord | null {
  const record = store.get(connectionPlanId);
  if (!record) return null;
  record.plan = {
    ...record.plan,
    governanceStatus: 'REJECTED',
    connectionStatus: 'REJECTED',
  };
  record.auditLog.push({ action: 'rejected', at: new Date().toISOString(), rejectedBy });
  return record;
}

export function hasIdempotencyKey(key: string): boolean {
  for (const record of store.values()) {
    if (record.idempotencyKeys.has(key)) return true;
  }
  return false;
}

export function markIdempotencyKey(key: string, connectionPlanId: string): void {
  const record = store.get(connectionPlanId);
  if (record) record.idempotencyKeys.add(key);
}

export function saveExecutionResult(result: ConnectionResult): void {
  const record = store.get(result.connectionPlanId);
  if (record) {
    record.executionResult = result;
    record.idempotencyKeys.add(result.idempotencyKey);
    record.plan.connectionStatus = result.status;
    record.auditLog.push({
      action: 'executed',
      at: result.executedAt ?? new Date().toISOString(),
      outcome: result.outcome,
      channel: result.channel,
    });
  }
}

export function getExecutionResult(connectionPlanId: string): ConnectionResult | null {
  return store.get(connectionPlanId)?.executionResult ?? null;
}

export function resetConnectionStoreForTests(): void {
  store.clear();
}

export function serializeConnectionRecord(connectionPlanId: string): Record<string, unknown> | null {
  const record = store.get(connectionPlanId);
  if (!record) return null;
  return {
    plan: record.plan,
    approval: record.approval,
    executionResult: record.executionResult,
    idempotencyKeys: [...record.idempotencyKeys],
    auditLog: record.auditLog,
  };
}
