import { normalizeCodeTaskPayload, CodeTaskPolicyError, CODE_TASK_MODE } from '../../guards/codeTaskPolicy.js';

export class GuardCodeTaskExecutionError extends Error {
  constructor(message, { code = 'guard_failed', status = 400, details } = {}) {
    super(message);
    this.name = 'GuardCodeTaskExecutionError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function isAdminActor(actor) {
  if (!actor || typeof actor !== 'object') return false;

  const role = typeof actor.role === 'string' ? actor.role.trim().toLowerCase() : '';
  if (role === 'admin' || role === 'super_admin') {
    return true;
  }

  if (Array.isArray(actor.roles)) {
    return actor.roles.some((value) => String(value).trim().toLowerCase() === 'admin');
  }

  if (typeof actor.roles === 'string') {
    return actor.roles.toLowerCase().includes('admin');
  }

  return false;
}

export function guardCodeTaskExecution({ actor, payload }) {
  if (!actor) {
    throw new GuardCodeTaskExecutionError('actor is required', {
      code: 'missing_actor',
      status: 401,
    });
  }

  if (!isAdminActor(actor)) {
    throw new GuardCodeTaskExecutionError('admin actor required', {
      code: 'non_admin_actor',
      status: 403,
    });
  }

  let normalizedTask;
  try {
    normalizedTask = normalizeCodeTaskPayload(payload);
  } catch (error) {
    if (error instanceof CodeTaskPolicyError) {
      throw new GuardCodeTaskExecutionError(error.message, {
        code: error.code || 'invalid_payload',
        status: error.status || 400,
        details: error.details,
      });
    }
    throw error;
  }

  return {
    ok: true,
    mode: CODE_TASK_MODE,
    guard: {
      access: 'passed',
      payload: 'passed',
      scope: 'passed',
    },
    normalizedTask,
    execution: {
      status: 'guarded_not_executed',
      reason: 'V1 proposal-only guard layer does not execute code engines yet',
    },
  };
}
