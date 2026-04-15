import type {
  LLMGatewayLike,
  MissionPlan,
  PlannedStep,
  ReActTrace,
  RuntimePlannedStep,
  StepReporterLike,
  MissionReactBlackboardLike,
} from '../../types/react.types.js';
import { observeStep, recordObservationOnBlackboard } from './stepObserver.js';
import { reflectOnStep } from './stepReflector.js';
import { validateMissionOutput } from './outputValidator.js';
import { planMission } from './missionPlanner.js';
import { BUILD_STORE_REACT_TOOLS } from './buildStoreReactTools.js';

const MAX_REPLANS = 1;
const MAX_RETRIES_PER_STEP = 1;

export function getExpectedOutputKeys(tool: string): string[] {
  const m: Record<string, string[]> = {
    research: ['react_step_research'],
    catalog: ['generatedProducts'],
    web_scrape_store_images: ['react_step_web_scrape_store_images'],
    business_image_enrich: ['react_step_business_image_enrich'],
    media: ['react_step_media'],
    copy: ['react_step_copy'],
  };
  return m[tool] ?? [];
}

function cloneSteps(steps: PlannedStep[]): RuntimePlannedStep[] {
  return steps.map((s) => ({ ...s }));
}

function staticFallbackPlan(staticSteps: PlannedStep[]): MissionPlan {
  return {
    missionId: `static_${Date.now()}`,
    reasoning: 'Static registry plan (no LLM planner result).',
    steps: staticSteps,
    estimatedSteps: staticSteps.length,
    createdAt: Date.now(),
  };
}

/**
 * ReAct loop around discrete executeStep(tool) calls.
 */
export async function executeWithReAct(
  missionPlan: MissionPlan | null,
  staticSteps: PlannedStep[],
  blackboard: MissionReactBlackboardLike,
  businessContext: Record<string, unknown>,
  executeStep: (tool: string, hint?: string) => Promise<void>,
  llmGateway: LLMGatewayLike,
  reporter: StepReporterLike
): Promise<ReActTrace> {
  const useReflection = process.env.USE_REACT_REFLECTION === 'true';

  let steps: RuntimePlannedStep[] = cloneSteps(missionPlan?.steps?.length ? missionPlan.steps : staticSteps);
  const trace: ReActTrace = {
    plan: missionPlan ?? staticFallbackPlan(staticSteps),
    observations: [],
    reflections: [],
    validation: null,
    reasoningLog: [],
  };

  if (!useReflection) {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      await Promise.resolve(reporter.emit(`${step.label}...`));
      await executeStep(step.tool, step.contextHint);
    }
    trace.validation = await validateMissionOutput(businessContext, blackboard.snapshot(), llmGateway, {
      blackboardWriter: blackboard,
      reasoningLog: trace.reasoningLog,
    });
    await blackboard.flushReasoningEmits?.().catch(() => {});
    blackboard.write('react_trace', trace);
    mergeTraceReasoningOntoBlackboard(blackboard, trace.reasoningLog);
    return trace;
  }

  let stepIndex = 0;
  let replanCount = 0;

  while (stepIndex < steps.length) {
    const step = steps[stepIndex];
    const blackboardBefore = blackboard.snapshot();
    const startTime = Date.now();

    await Promise.resolve(reporter.emit(`${step.label}...`));
    let error: Error | undefined;
    try {
      const hint = step.contextHint;
      await executeStep(step.tool, hint);
    } catch (e) {
      error = e as Error;
    }

    const observation = observeStep(
      stepIndex,
      step.tool,
      blackboardBefore,
      blackboard.snapshot(),
      getExpectedOutputKeys(step.tool),
      startTime,
      error
    );
    trace.observations.push(observation);
    recordObservationOnBlackboard(blackboard, observation, trace.reasoningLog);

    const nextStep = steps[stepIndex + 1] ?? null;
    const reflection = await reflectOnStep(observation, nextStep, blackboard.snapshot(), businessContext, llmGateway, {
      blackboard,
      reasoningLog: trace.reasoningLog,
    });
    trace.reflections.push(reflection);

    switch (reflection.action) {
      case 'proceed':
        stepIndex++;
        break;

      case 'retry': {
        const retries = step._retryCount ?? 0;
        if (retries >= MAX_RETRIES_PER_STEP) {
          await Promise.resolve(reporter.emit(`⚠ ${step.tool} incomplete, continuing`));
          stepIndex++;
        } else {
          step._retryCount = retries + 1;
          step.contextHint = reflection.hint;
          await Promise.resolve(reporter.emit(`↻ Retrying: ${reflection.hint ?? 'adjusting approach'}`));
        }
        break;
      }

      case 'skip':
        await Promise.resolve(reporter.emit(`⏭ Skipped: ${reflection.reasoning}`));
        stepIndex += 2;
        break;

      case 'replan':
        if (replanCount >= MAX_REPLANS) {
          stepIndex++;
        } else {
          replanCount++;
          const newPlan = await planMission(
            'continue mission',
            { ...businessContext, ...blackboard.snapshot() },
            [...BUILD_STORE_REACT_TOOLS],
            llmGateway
          );
          if (newPlan?.steps?.length) {
            steps = cloneSteps(newPlan.steps);
            stepIndex = 0;
            await Promise.resolve(reporter.emit('♻ Replanned mission'));
            trace.plan = newPlan;
          } else {
            stepIndex++;
          }
        }
        break;

      default:
        stepIndex++;
    }
  }

  trace.validation = await validateMissionOutput(businessContext, blackboard.snapshot(), llmGateway, {
    blackboardWriter: blackboard,
    reasoningLog: trace.reasoningLog,
  });

  await blackboard.flushReasoningEmits?.().catch(() => {});
  blackboard.write('react_trace', trace);
  mergeTraceReasoningOntoBlackboard(blackboard, trace.reasoningLog);
  return trace;
}

/** Keeps appendReasoningLog lines; only writes when trace has lines, merged without dupes. */
function mergeTraceReasoningOntoBlackboard(blackboard: MissionReactBlackboardLike, traceLog: string[] | undefined): void {
  const fromTrace = Array.isArray(traceLog) ? traceLog.map(String) : [];
  if (fromTrace.length === 0) return;
  const snap = blackboard.snapshot();
  const raw = snap.reasoning_log;
  const existing = Array.isArray(raw) ? raw.map((x) => String(x)) : [];
  const seen = new Set(existing);
  const next = [...existing];
  for (const line of fromTrace) {
    if (!seen.has(line)) {
      seen.add(line);
      next.push(line);
    }
  }
  blackboard.write('reasoning_log', next);
}
