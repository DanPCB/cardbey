/**
 * Type guards for intent reasoning types.
 */

import type {
  ConfidenceFactor,
  GuestGuidance,
  IntentActionType,
  IntentReasoningResult,
  IntentType,
  ParsedInput,
  ReasoningTrace,
  SuggestedAction,
  UserState,
} from './intentTypes.js';
import { INTENT_ACTION_TYPE_LIST, INTENT_TYPE_LIST } from './constants.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isIntentResult(value: unknown): value is IntentReasoningResult {
  return (
    isRecord(value) &&
    typeof value.intent === 'string' &&
    typeof value.confidence === 'number' &&
    typeof value.action === 'string' &&
    Array.isArray(value.reasoning)
  );
}

export function isGuestGuidance(value: unknown): value is GuestGuidance {
  return (
    isRecord(value) &&
    typeof value.requiresSignIn === 'boolean' &&
    typeof value.message === 'string' &&
    typeof value.alternativeAction === 'string'
  );
}

export function isSuggestedAction(value: unknown): value is SuggestedAction {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.label === 'string' &&
    typeof value.action === 'string'
  );
}

export function isParsedInput(value: unknown): value is ParsedInput {
  return (
    isRecord(value) &&
    typeof value.rawText === 'string' &&
    Array.isArray(value.attachments)
  );
}

export function isUserState(value: unknown): value is UserState {
  return isRecord(value) && typeof value.hasStore === 'boolean';
}

export function isConfidenceFactor(value: unknown): value is ConfidenceFactor {
  return (
    isRecord(value) &&
    typeof value.factor === 'string' &&
    typeof value.contribution === 'number' &&
    typeof value.description === 'string'
  );
}

export function isReasoningTrace(value: unknown): value is ReasoningTrace {
  return (
    isRecord(value) &&
    typeof value.reasoningId === 'string' &&
    Array.isArray(value.steps) &&
    typeof value.decision === 'string'
  );
}

const INTENT_TYPE_SET = new Set<string>(INTENT_TYPE_LIST);
const INTENT_ACTION_TYPE_SET = new Set<string>(INTENT_ACTION_TYPE_LIST);

export function isValidIntentType(value: string): value is IntentType {
  return INTENT_TYPE_SET.has(value);
}

export function isValidIntentActionType(value: string): value is IntentActionType {
  return INTENT_ACTION_TYPE_SET.has(value);
}
