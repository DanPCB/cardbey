import type {
  LLMGatewayLike,
  PlannedStep,
  StepObservation,
  StepReflection,
  ReActAction,
  MissionReactBlackboardLike,
} from '../../types/react.types.js';

function pickBlackboardSlice(blackboard: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(blackboard, k)) out[k] = blackboard[k];
  }
  return out;
}

function tryParseReflectionJson(text: string): Partial<StepReflection> | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as Partial<StepReflection>;
  } catch {
    return null;
  }
}

function isReActAction(x: unknown): x is ReActAction {
  return x === 'proceed' || x === 'retry' || x === 'skip' || x === 'replan';
}

/**
 * Fast path avoids LLM; slow path asks the gateway for a structured decision.
 */
export async function reflectOnStep(
  observation: StepObservation,
  nextStep: PlannedStep | null,
  blackboard: Record<string, unknown>,
  businessContext: Record<string, unknown>,
  llmGateway: LLMGatewayLike,
  options?: {
    emitConsole?: (message: string) => void | Promise<void>;
    blackboard?: MissionReactBlackboardLike;
    reasoningLog?: string[];
  }
): Promise<StepReflection> {
  const emitConsole = options?.emitConsole;
  const bb = options?.blackboard;
  const reasoningLog = options?.reasoningLog;

  // FAST: explicit error
  if (observation.error) {
    const action: ReActAction = nextStep?.priority === 'optional' ? 'skip' : 'retry';
    const reflection: StepReflection = {
      observation,
      action,
      reasoning:
        action === 'skip'
          ? 'Optional step failed; skipping downstream dependency risk is accepted for optional work.'
          : 'Required step failed; retry with adjusted hint.',
      ...(action === 'retry'
        ? {
            hint: `Previous attempt failed with: ${observation.error}. Try alternative approach.`,
          }
        : {}),
    };
    await persistReflection(reflection, bb, reasoningLog, emitConsole);
    return reflection;
  }

  // FAST: success with no empty keys
  if (observation.emptyKeys.length === 0) {
    const reflection: StepReflection = {
      observation,
      action: 'proceed',
      reasoning: 'Outputs look complete for expected keys.',
    };
    await persistReflection(reflection, bb, reasoningLog, emitConsole);
    return reflection;
  }

  // FAST: last step
  if (!nextStep) {
    const reflection: StepReflection = {
      observation,
      action: 'proceed',
      reasoning: 'Last step in plan; defer deeper critique to output validation.',
    };
    await persistReflection(reflection, bb, reasoningLog, emitConsole);
    return reflection;
  }

  // FAST: known blackboard-driven skips (heuristic; no LLM)
  const productsVisible = blackboard.products_visible ?? blackboard.enriched_products;
  const enrichedCount = Array.isArray(blackboard.enriched_products)
    ? (blackboard.enriched_products as unknown[]).length
    : 0;
  if (productsVisible && nextStep.tool.includes('product')) {
    const reflection: StepReflection = {
      observation,
      action: 'skip',
      reasoning: 'Real products available',
      skipTarget: nextStep.tool,
    };
    await persistReflection(reflection, bb, reasoningLog, emitConsole);
    return reflection;
  }
  if (blackboard.website_fetched && /web|site|url/i.test(nextStep.tool)) {
    const reflection: StepReflection = {
      observation,
      action: 'skip',
      reasoning: 'Already fetched',
      skipTarget: nextStep.tool,
    };
    await persistReflection(reflection, bb, reasoningLog, emitConsole);
    return reflection;
  }
  if (enrichedCount >= 8 && nextStep.tool.includes('enrich')) {
    const reflection: StepReflection = {
      observation,
      action: 'skip',
      reasoning: 'Sufficient products found',
      skipTarget: nextStep.tool,
    };
    await persistReflection(reflection, bb, reasoningLog, emitConsole);
    return reflection;
  }

  // LLM path
  const relevantKeys = [
    'generatedProducts',
    'draftProducts',
    'selectedImages',
    'generatedProfile',
    'businessVertical',
    'subcategory',
    'contentManifest',
    'products_visible',
    'enriched_products',
    'website_fetched',
  ];
  const slice = pickBlackboardSlice(blackboard, relevantKeys);

  const system =
    "You are Cardbey's step reflector.\nEvaluate mission step output and decide next action.\n\nActions:\nproceed - output is good, continue\nretry - output has issues, re-run with hint\nskip - next step is unnecessary given results\nreplan - fundamental approach needs to change\n\nBe decisive. Default to proceed unless there is a clear reason not to.\nReturn valid JSON only.";

  const user = `Completed step: ${observation.tool}
Success: ${observation.success}
Keys written: ${JSON.stringify(observation.outputKeys)}
Empty keys: ${JSON.stringify(observation.emptyKeys)}

Blackboard state (relevant keys):
${JSON.stringify(slice, null, 2)}

Next planned step: ${nextStep.tool}
Next step condition: ${nextStep.skipIf ?? '(none)'}

Business context:
${JSON.stringify(businessContext, null, 2)}

What action? Return:
{
  "action": "proceed" | "retry" | "skip" | "replan",
  "reasoning": string,
  "hint"?: string,
  "skipTarget"?: string
}`;

  let action: ReActAction = 'proceed';
  let reasoning = 'Default proceed after LLM parse failure.';
  let hint: string | undefined;
  let skipTarget: string | undefined;

  try {
    const { text } = await llmGateway.generate({
      purpose: 'react:step_reflector',
      prompt: `${system}\n\n${user}`,
      tenantKey: 'react-reflector',
      maxTokens: 500,
      temperature: 0.2,
      responseFormat: 'json',
    });
    const parsed = tryParseReflectionJson(text);
    if (parsed && isReActAction(parsed.action)) {
      action = parsed.action;
      reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : reasoning;
      hint = typeof parsed.hint === 'string' ? parsed.hint : hint;
      skipTarget = typeof parsed.skipTarget === 'string' ? parsed.skipTarget : skipTarget;
    }
  } catch {
    action = 'proceed';
    reasoning = 'Reflector LLM error; defaulting to proceed.';
  }

  const reflection: StepReflection = {
    observation,
    action,
    reasoning,
    ...(hint ? { hint } : {}),
    ...(skipTarget ? { skipTarget } : {}),
  };

  await persistReflection(reflection, bb, reasoningLog, emitConsole);
  return reflection;
}

async function persistReflection(
  reflection: StepReflection,
  blackboard: MissionReactBlackboardLike | undefined,
  reasoningLog: string[] | undefined,
  emitConsole?: (message: string) => void | Promise<void>
): Promise<void> {
  if (blackboard) {
    const snap = blackboard.snapshot();
    const prev = Array.isArray(snap.react_reflections) ? (snap.react_reflections as StepReflection[]) : [];
    blackboard.write('react_reflections', [...prev, reflection]);
  }
  const line = `[${reflection.observation.tool}] ${reflection.action}: ${reflection.reasoning}`;
  reasoningLog?.push(line);
  blackboard?.appendReasoningLog(line);

  if (reflection.action !== 'proceed' && emitConsole) {
    if (reflection.action === 'retry' && reflection.hint) {
      await Promise.resolve(emitConsole(`↻ Retrying ${reflection.observation.tool}: ${reflection.hint}`));
    }
    if (reflection.action === 'skip') {
      const target = reflection.skipTarget || '(next)';
      await Promise.resolve(emitConsole(`⏭ Skipping ${target}: ${reflection.reasoning}`));
    }
  }
  await blackboard?.flushReasoningEmits?.().catch(() => {});
}
