/**
 * Single intent-first pipeline: Classify → Context → Execute.
 * No branching guards, no default runways.
 */

import { IntentClassifier } from '../classifier/IntentClassifier.js';
import { ContextEvaluator } from '../context/ContextEvaluator.js';
import { IntentExecutor } from '../executor/IntentExecutor.js';
import type { IntentEngineInput, IntentResult } from '../intent.types.js';

export class IntentOrchestrator {
  private readonly classifier: IntentClassifier;
  private readonly contextEvaluator: ContextEvaluator;
  private readonly executor: IntentExecutor;

  constructor(deps?: {
    classifier?: IntentClassifier;
    contextEvaluator?: ContextEvaluator;
    executor?: IntentExecutor;
  }) {
    this.classifier = deps?.classifier ?? new IntentClassifier();
    this.contextEvaluator = deps?.contextEvaluator ?? new ContextEvaluator();
    this.executor = deps?.executor ?? new IntentExecutor();
  }

  /**
   * Run the full intent-first pipeline.
   */
  async process(input: IntentEngineInput): Promise<IntentResult> {
    const pipelineStart = Date.now();

    const classifyStart = Date.now();
    const intent = this.classifier.classify(input);
    const classificationTime = Date.now() - classifyStart;

    const contextStart = Date.now();
    const context = await this.contextEvaluator.evaluate(intent, input);
    const contextTime = Date.now() - contextStart;

    const executeStart = Date.now();
    const useToolCalling =
      String(process.env.DEEPSEEK_TOOL_CALLING_ENABLED ?? 'true').trim().toLowerCase() !== 'false';
    const execution = useToolCalling
      ? await this.executor.executeWithToolCalling(intent, context, input.message, {
          userId: input.ownerUserId ?? input.userId ?? null,
          storeId: context.storeId ?? input.activeStoreId ?? null,
          sessionId: input.sessionId ?? null,
        })
      : this.executor.execute(intent, context, input.message);
    const executionTime = Date.now() - executeStart;

    const totalTime = Date.now() - pipelineStart;

    return {
      intent,
      context,
      execution,
      metrics: {
        classificationTime,
        contextTime,
        executionTime,
        totalTime,
        confidence: intent.confidence,
      },
    };
  }
}

let orchestratorSingleton: IntentOrchestrator | null = null;

export function getIntentOrchestrator(): IntentOrchestrator {
  if (!orchestratorSingleton) {
    orchestratorSingleton = new IntentOrchestrator();
  }
  return orchestratorSingleton;
}

/** @internal tests */
export function resetIntentOrchestratorForTests(): void {
  orchestratorSingleton = null;
}
