import { describe, it, expect } from 'vitest';
import { classifyIntent } from '../classifier/IntentClassifier.js';
import { executeIntent } from '../executor/IntentExecutor.js';
import { isIntentEngineEarlyReturn, intentResultToClassification } from '../bridge/intentEngineBridge.js';
import type { IntentResult } from '../intent.types.js';

describe('content_edit intent pipeline', () => {
  it('executes code_fix and does not early-return as chat', () => {
    const message = "change headline 'AWE FINANCIAL' to 'AWE FINANCE'";
    const intent = classifyIntent({ message });
    const execution = executeIntent(
      intent,
      { status: 'ready', storeId: 'store_1', storeCount: 1 },
      message,
    );

    expect(execution.tool).toBe('code_fix');
    expect(execution.action).toBe('proactive_plan');
    expect(execution.parameters?.description).toBe(message);
    expect(execution.parameters?.storeId).toBe('store_1');

    const result: IntentResult = {
      intent,
      context: { status: 'ready', storeId: 'store_1', storeCount: 1 },
      execution,
      metrics: {
        classificationTime: 0,
        contextTime: 0,
        executionTime: 0,
        totalTime: 0,
        confidence: intent.confidence,
      },
    };

    expect(isIntentEngineEarlyReturn(result)).toBe(false);
    const classification = intentResultToClassification(result);
    expect(classification.tool).toBe('code_fix');
    expect(classification.executionPath).toBe('direct_action');
  });
});
