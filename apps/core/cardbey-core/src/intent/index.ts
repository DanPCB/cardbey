/**
 * Intent-First Engine — public exports.
 */

export type {
  Intent,
  IntentType,
  IntentResult,
  IntentEngineInput,
  ContextResult,
  ContextStatus,
  ExecutionResult,
  ExecutionAction,
  IntentShadowComparison,
} from './intent.types.js';

export { IntentClassifier, classifyIntent } from './classifier/IntentClassifier.js';
export { ContextEvaluator, evaluateContext, resolveStoreOwnerUserId } from './context/ContextEvaluator.js';
export { IntentExecutor, executeIntent } from './executor/IntentExecutor.js';
export {
  IntentOrchestrator,
  getIntentOrchestrator,
  resetIntentOrchestratorForTests,
} from './orchestrator/IntentOrchestrator.js';

export {
  intentResultToIntakeResponse,
  intentResultToClassification,
  isIntentEngineEarlyReturn,
  isIntentEngineTerminalResult,
  compareIntentEngineShadow,
} from './bridge/intentEngineBridge.js';
