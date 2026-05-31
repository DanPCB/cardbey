/**
 * Mission Graph Runtime — canonical types and constants (Phase C).
 */

export const GRAPH_VERSION = 1;

export const NODE_STATUS = {
  PENDING: 'pending',
  READY: 'ready',
  BLOCKED: 'blocked',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  WAITING_FOR_DEPENDENCY: 'waiting_for_dependency',
  WAITING_FOR_DECISION: 'waiting_for_decision',
};

export const EXECUTION_MODE = {
  SEQUENTIAL: 'sequential',
  PARALLEL: 'parallel',
  BARRIER: 'barrier',
  CONDITIONAL: 'conditional',
  RETRYABLE: 'retryable',
};

export const EDGE_TYPE = {
  DEPENDS_ON: 'depends_on',
  BARRIER_JOIN: 'barrier_join',
  CONDITIONAL: 'conditional',
};

export const NODE_TYPE = {
  TOOL_STEP: 'tool_step',
  BARRIER: 'barrier',
  AGENT: 'agent',
  PACKAGE: 'package',
};

export const TERMINAL_NODE_STATUSES = new Set([
  NODE_STATUS.COMPLETED,
  NODE_STATUS.FAILED,
  NODE_STATUS.CANCELLED,
]);

export const BLOCKING_NODE_STATUSES = new Set([
  NODE_STATUS.FAILED,
  NODE_STATUS.CANCELLED,
]);
