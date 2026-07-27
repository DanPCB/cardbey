/**
 * Unified workflow blueprint read model.
 * Merges structured MissionPipelineStep rows, proactive plan metadata, and intent registry labels.
 */

import { getPrismaClient } from '../prisma.js';
import { getStructuredMissionSteps } from '../missionPipelineStructured.js';
import { loadBlueprint } from './blueprintLoader.js';
import { getPipelineForIntent } from '../missionPlan/intentPipelineRegistry.js';
import { readProactivePlanSteps } from '../runtime/runtimeOrchestrationState.js';

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

/**
 * @param {Array<import('./executionTypes.js').BlueprintStep>} steps
 * @returns {object[]}
 */
function deriveCheckpointsFromSteps(steps) {
  return steps
    .filter((s) => s.kind === 'checkpoint')
    .map((s) => ({
      step_id: s.id,
      type: 'input',
      prompt: typeof s.config?.prompt === 'string' ? s.config.prompt : s.label ?? s.name,
      options: Array.isArray(s.config?.options) ? s.config.options : undefined,
      outputKey: typeof s.config?.outputKey === 'string' ? s.config.outputKey : undefined,
      required: false,
    }));
}

/**
 * @param {Array<{ orderIndex?: number }>} steps
 * @returns {object[]}
 */
function deriveDependencies(steps) {
  const sorted = [...steps].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  const deps = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (prev?.id && cur?.id) {
      deps.push({ step_id: cur.id, depends_on: [prev.id] });
    }
  }
  return deps;
}

/**
 * @param {object} stepRow
 * @returns {import('./executionTypes.js').BlueprintStep}
 */
function blueprintStepFromDbRow(stepRow) {
  const cfg = asObject(stepRow.configJson);
  return {
    id: stepRow.id,
    name: stepRow.toolName ?? stepRow.label ?? stepRow.id,
    kind: stepRow.stepKind ?? 'action',
    toolName: stepRow.toolName ?? undefined,
    label: stepRow.label ?? undefined,
    orderIndex: typeof stepRow.orderIndex === 'number' ? stepRow.orderIndex : undefined,
    source: 'structured',
    ...(Object.keys(cfg).length > 0 ? { config: cfg } : {}),
    requiresConfirmation: stepRow.stepKind === 'checkpoint',
  };
}

/**
 * @param {ReturnType<typeof readProactivePlanSteps>[number]} planStep
 * @param {number} index
 * @returns {import('./executionTypes.js').BlueprintStep}
 */
function blueprintStepFromProactivePlan(planStep, index) {
  const stepNum = typeof planStep.step === 'number' ? planStep.step : index + 1;
  const tool = planStep.recommendedTool ?? 'proactive_step';
  return {
    id: `proactive_step_${stepNum}`,
    name: tool,
    kind: 'action',
    toolName: tool,
    label: planStep.title ?? `Step ${stepNum}`,
    orderIndex: stepNum - 1,
    source: 'proactive',
    config: {
      description: planStep.description ?? '',
      ...(planStep.parameters ? { parameters: planStep.parameters } : {}),
    },
    requiresConfirmation: false,
  };
}

/**
 * @param {Array<ReturnType<typeof getStructuredMissionSteps>>} templateSteps
 * @param {string} [locale]
 * @returns {import('./executionTypes.js').BlueprintStep[]}
 */
export function blueprintStepsFromTemplate(templateSteps, locale = 'en') {
  return templateSteps.map((s, i) => ({
    id: `template_${i}`,
    name: s.toolName ?? s.label ?? `step_${i}`,
    kind: s.stepKind ?? 'action',
    toolName: s.toolName,
    label: s.label,
    orderIndex: s.orderIndex ?? i,
    source: 'registry',
    ...(s.configJson ? { config: s.configJson } : {}),
    requiresConfirmation: s.stepKind === 'checkpoint',
  }));
}

/**
 * @param {object} mission - MissionPipeline row with optional steps[]
 * @param {{ locale?: string }} [options]
 * @returns {import('./executionTypes.js').WorkflowBlueprintView}
 */
export function buildMissionBlueprintView(mission, options = {}) {
  const locale = options.locale ?? 'en';
  const meta = asObject(mission.metadataJson);
  const missionType = String(mission.type ?? '').trim().toLowerCase() || 'generic';
  const dbSteps = Array.isArray(mission.steps) ? mission.steps : [];
  const executionMode = String(mission.executionMode ?? 'AUTO_RUN').trim();

  /** @type {import('./executionTypes.js').BlueprintStep[]} */
  let steps = [];

  if (dbSteps.length > 0) {
    steps = dbSteps.map(blueprintStepFromDbRow);
  } else if (executionMode === 'GUIDED_RUN') {
    const planSteps = readProactivePlanSteps(meta);
    steps = planSteps.map(blueprintStepFromProactivePlan);
  } else {
    const template = getStructuredMissionSteps(missionType, locale);
    steps = blueprintStepsFromTemplate(template, locale);
  }

  const registry = getPipelineForIntent(missionType);
  const registryCheckpoints = Array.isArray(registry?.checkpoints) ? registry.checkpoints : [];
  const derivedCheckpoints = deriveCheckpointsFromSteps(steps);
  const declarativeBlueprint = loadBlueprint(missionType, locale);

  return {
    id: mission.id,
    name: declarativeBlueprint?.name ?? missionType,
    version: declarativeBlueprint?.version ?? '1.0',
    steps,
    checkpoints: derivedCheckpoints.length > 0 ? derivedCheckpoints : registryCheckpoints,
    dependencies: deriveDependencies(steps),
    metadata: {
      title: mission.title,
      executionMode,
      ...meta,
    },
  };
}

/**
 * @param {string} missionId
 * @param {{ locale?: string, persistSnapshot?: boolean }} [options]
 * @returns {Promise<import('./executionTypes.js').WorkflowBlueprintView | null>}
 */
export async function resolveMissionBlueprint(missionId, options = {}) {
  const id = String(missionId ?? '').trim();
  if (!id) return null;

  const prisma = getPrismaClient();
  const mission = await prisma.missionPipeline.findUnique({
    where: { id },
    include: { steps: { orderBy: { orderIndex: 'asc' } } },
  });
  if (!mission) return null;

  const view = buildMissionBlueprintView(mission, options);

  if (options.persistSnapshot === true) {
    const existing = asObject(mission.pipelineConfig);
    if (!existing.version) {
      try {
        await prisma.missionPipeline.update({
          where: { id },
          data: {
            pipelineConfig: {
              version: view.version,
              name: view.name,
              steps: view.steps,
              checkpoints: view.checkpoints,
              dependencies: view.dependencies,
              persistedAt: new Date().toISOString(),
            },
          },
        });
      } catch {
        /* best-effort snapshot */
      }
    }
  }

  return view;
}
