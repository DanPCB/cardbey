import { MissionTypes, OrchestratorTaskTypes } from '../lib/systemMissionTypes.js';

export const CODE_TASK_MODE = 'proposal_only';

export const forbiddenStatusWrites = Object.freeze([
  'DraftStore.status',
  'OrchestratorTask.status',
  'committedStoreId',
]);

export const forbiddenConcepts = Object.freeze([
  'direct status mutation',
  'bypass transitionDraftStoreStatus',
  'bypass transitionOrchestratorTaskStatus',
]);

export const dangerousAllowedPathRoots = Object.freeze([
  'apps/core/cardbey-core/src/auth',
  'apps/core/cardbey-core/src/billing',
  'apps/core/cardbey-core/src/kernel',
  'prisma',
  'deployment',
  'deploy',
  'render',
  'infra',
  'infrastructure',
]);

export class CodeTaskPolicyError extends Error {
  constructor(message, { code = 'invalid_payload', status = 400, details } = {}) {
    super(message);
    this.name = 'CodeTaskPolicyError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function normalizeString(value, fieldName, { required = false } = {}) {
  if (value == null || value === '') {
    if (required) {
      throw new CodeTaskPolicyError(`${fieldName} is required`, { details: { field: fieldName } });
    }
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new CodeTaskPolicyError(`${fieldName} must be a string`, { details: { field: fieldName } });
  }

  const trimmed = value.trim();
  if (!trimmed) {
    if (required) {
      throw new CodeTaskPolicyError(`${fieldName} is required`, { details: { field: fieldName } });
    }
    return undefined;
  }

  return trimmed;
}

function normalizePath(pathValue, fieldName) {
  const normalized = normalizeString(pathValue, fieldName, { required: true })
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/')
    .replace(/\/+$/, '');

  if (!normalized) {
    throw new CodeTaskPolicyError(`${fieldName} must not be empty`, { details: { field: fieldName } });
  }

  if (normalized.includes('*')) {
    throw new CodeTaskPolicyError(`${fieldName} cannot include wildcard scopes`, {
      code: 'invalid_scope',
      details: { field: fieldName, path: normalized },
    });
  }

  if (['.', '..', '/', 'src', 'apps', 'apps/core', 'apps/core/cardbey-core', 'apps/core/cardbey-core/src'].includes(normalized)) {
    throw new CodeTaskPolicyError(`${fieldName} is too broad for V1`, {
      code: 'invalid_scope',
      details: { field: fieldName, path: normalized },
    });
  }

  return normalized;
}

function normalizeStringArray(values, fieldName, { required = false } = {}) {
  if (values == null) {
    if (required) {
      throw new CodeTaskPolicyError(`${fieldName} is required`, { details: { field: fieldName } });
    }
    return [];
  }

  if (!Array.isArray(values)) {
    throw new CodeTaskPolicyError(`${fieldName} must be an array`, { details: { field: fieldName } });
  }

  const normalized = values.map((value, index) => normalizeString(value, `${fieldName}[${index}]`, { required: true }));
  if (required && normalized.length === 0) {
    throw new CodeTaskPolicyError(`${fieldName} must not be empty`, { details: { field: fieldName } });
  }
  return normalized;
}

function normalizePathArray(values, fieldName, { required = false } = {}) {
  if (values == null) {
    if (required) {
      throw new CodeTaskPolicyError(`${fieldName} is required`, { details: { field: fieldName } });
    }
    return [];
  }

  if (!Array.isArray(values)) {
    throw new CodeTaskPolicyError(`${fieldName} must be an array`, { details: { field: fieldName } });
  }

  const normalized = values.map((value, index) => normalizePath(value, `${fieldName}[${index}]`));
  if (required && normalized.length === 0) {
    throw new CodeTaskPolicyError(`${fieldName} must not be empty`, { details: { field: fieldName } });
  }
  return Array.from(new Set(normalized));
}

function overlaps(pathA, pathB) {
  return pathA === pathB || pathA.startsWith(`${pathB}/`) || pathB.startsWith(`${pathA}/`);
}

function assertNoForbiddenOverlap(allowedPaths, forbiddenPaths) {
  for (const allowedPath of allowedPaths) {
    for (const forbiddenPath of forbiddenPaths) {
      if (overlaps(allowedPath, forbiddenPath)) {
        throw new CodeTaskPolicyError('forbiddenPaths cannot overlap allowedPaths', {
          code: 'conflicting_scope',
          details: { allowedPath, forbiddenPath },
        });
      }
    }
  }
}

function assertAllowedPathsSafe(allowedPaths) {
  for (const allowedPath of allowedPaths) {
    for (const dangerousRoot of dangerousAllowedPathRoots) {
      if (overlaps(allowedPath, dangerousRoot)) {
        throw new CodeTaskPolicyError(`allowed path is blocked in V1: ${allowedPath}`, {
          code: 'forbidden_allowed_path',
          details: { allowedPath, dangerousRoot },
        });
      }
    }
  }
}

export function normalizeCodeTaskPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new CodeTaskPolicyError('payload must be an object');
  }

  const missionType = normalizeString(payload.missionType, 'missionType', { required: true });
  if (missionType !== MissionTypes.SYSTEM) {
    throw new CodeTaskPolicyError('missionType must be system', {
      details: { field: 'missionType', expected: MissionTypes.SYSTEM },
    });
  }

  const taskType = normalizeString(payload.taskType, 'taskType', { required: true });
  if (taskType !== OrchestratorTaskTypes.CODE_TASK) {
    throw new CodeTaskPolicyError('taskType must be code_task', {
      details: { field: 'taskType', expected: OrchestratorTaskTypes.CODE_TASK },
    });
  }

  const title = normalizeString(payload.title, 'title', { required: true });
  const objective = normalizeString(payload.objective, 'objective', { required: true });
  const repo = normalizeString(payload.repo, 'repo');
  const allowedPaths = normalizePathArray(payload.allowedPaths, 'allowedPaths', { required: true });
  const forbiddenPaths = normalizePathArray(payload.forbiddenPaths, 'forbiddenPaths');
  const constraints = normalizeStringArray(payload.constraints, 'constraints');

  const rawValidationPlan =
    payload.validationPlan && typeof payload.validationPlan === 'object' && !Array.isArray(payload.validationPlan)
      ? payload.validationPlan
      : {};

  const mode = payload.mode == null ? CODE_TASK_MODE : normalizeString(payload.mode, 'mode', { required: true });
  if (mode !== CODE_TASK_MODE) {
    throw new CodeTaskPolicyError('mode must be proposal_only in V1', {
      code: 'invalid_mode',
      details: { allowedMode: CODE_TASK_MODE, receivedMode: mode },
    });
  }

  assertNoForbiddenOverlap(allowedPaths, forbiddenPaths);
  assertAllowedPathsSafe(allowedPaths);

  return {
    missionType,
    taskType,
    title,
    objective,
    repo,
    allowedPaths,
    forbiddenPaths,
    constraints,
    validationPlan: {
      runTests: rawValidationPlan.runTests === true,
      runBuild: rawValidationPlan.runBuild === true,
      checkForbiddenPatterns: rawValidationPlan.checkForbiddenPatterns !== false,
      checkWorkflowIntegrity: rawValidationPlan.checkWorkflowIntegrity !== false,
    },
    engine: normalizeString(payload.engine, 'engine'),
    mode,
  };
}
