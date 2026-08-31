/**
 * NL confirm intercept — affirmation routing when a governed plan awaits confirmation.
 */

import { getToolEntry, isRegisteredTool } from './intakeToolRegistry.js';
import { intakeMessage } from './performerIntakeMessageCatalog.js';

const INTAKE_CONFIRM_AFFIRMATIONS = new Set([
  'yes',
  'yep',
  'yeah',
  'ok',
  'okay',
  'sure',
  'proceed',
  'confirm',
  'approve',
  "let's do it",
  'lets do it',
  'go ahead',
  'yes proceed',
  'ok go ahead',
]);

/**
 * @param {string} message
 */
export function isIntakeConfirmAffirmation(message) {
  const normalized = String(message ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return normalized.length > 0 && INTAKE_CONFIRM_AFFIRMATIONS.has(normalized);
}

/**
 * @param {Array<Record<string, unknown>>} history
 */
export function conversationAwaitingIntakeConfirm(history) {
  if (!Array.isArray(history) || history.length < 2) return false;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const msg = history[i];
    if (!msg || typeof msg !== 'object') continue;
    const role = String(msg.role ?? msg.type ?? '').toLowerCase();
    const text = String(msg.content ?? msg.text ?? msg.message ?? '').trim();
    if (role !== 'assistant' && role !== 'agent' && role !== 'mi') continue;
    if (!/please confirm before proceeding/i.test(text)) continue;
    for (let j = i - 1; j >= 0; j -= 1) {
      const prior = history[j];
      if (!prior || typeof prior !== 'object') continue;
      const priorRole = String(prior.role ?? prior.type ?? '').toLowerCase();
      const priorText = String(prior.content ?? prior.text ?? prior.message ?? '').trim();
      if (
        (priorRole === 'user' || priorRole === 'human') &&
        priorText &&
        !isIntakeConfirmAffirmation(priorText)
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * @param {Array<Record<string, unknown>>} history
 * @returns {{ tool: string; originalGoal: string } | null}
 */
export function extractPendingConfirmFromHistory(history) {
  if (!Array.isArray(history)) return null;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const msg = history[i];
    if (!msg || typeof msg !== 'object') continue;
    const role = String(msg.role ?? msg.type ?? '').toLowerCase();
    const text = String(msg.content ?? msg.text ?? msg.message ?? '').trim();
    if (role !== 'assistant' && role !== 'agent' && role !== 'mi') continue;
    if (!/please confirm before proceeding/i.test(text)) continue;
    const proposed = text.match(/please confirm before proceeding:\s*([a-z0-9_.-]+)/i);
    const tool = proposed?.[1] ? String(proposed[1]).trim() : '';
    if (!tool) return null;
    let originalGoal = '';
    for (let j = i - 1; j >= 0; j -= 1) {
      const prior = history[j];
      if (!prior || typeof prior !== 'object') continue;
      const priorRole = String(prior.role ?? prior.type ?? '').toLowerCase();
      const priorText = String(prior.content ?? prior.text ?? prior.message ?? '').trim();
      if (
        (priorRole === 'user' || priorRole === 'human') &&
        priorText &&
        !isIntakeConfirmAffirmation(priorText)
      ) {
        originalGoal = priorText;
        break;
      }
    }
    return { tool, originalGoal };
  }
  return null;
}

/**
 * @param {import('./intakePersistedIntentStore.js').PersistedIntentResolution | null} persistedIntent
 * @param {Array<Record<string, unknown>>} [history]
 */
export function sessionHasPendingIntakePlanConfirm(belief, persistedIntent, history = [], pendingFromStore = null) {
  if (conversationAwaitingIntakeConfirm(history)) return true;
  if (pendingFromStore?.tool && isRegisteredTool(String(pendingFromStore.tool))) return true;

  const hasIntentAnchor =
    Boolean(String(persistedIntent?.family ?? '').trim()) ||
    Boolean(String(persistedIntent?.chosenTool ?? '').trim()) ||
    Boolean(String(persistedIntent?.subtype ?? '').trim()) ||
    Boolean(String(belief?.activeGoal?.intent ?? '').trim());

  const workflowType = String(belief?.workflow?.type ?? '').trim();
  const activeGoalIntent = String(belief?.activeGoal?.intent ?? '').trim();
  if (workflowType && activeGoalIntent && hasIntentAnchor) return true;

  if (hasIntentAnchor && belief?.workflow?.status === 'pending_confirmation') return true;

  return false;
}

/**
 * Align executionPath with the registered tool contract (persisted intent may carry a stale path).
 * @param {Record<string, unknown> | null | undefined} classification
 */
export function normalizeConfirmInterceptClassification(classification) {
  if (!classification || typeof classification !== 'object') return classification;
  const tool = String(classification.tool ?? '').trim();
  if (!tool) return classification;
  const toolEntry = getToolEntry(tool);
  if (!toolEntry?.executionPath) return classification;
  return {
    ...classification,
    executionPath: toolEntry.executionPath,
  };
}

const VALIDATION_FIELD_LABELS = {
  storeId: 'a store',
  campaignContext: 'a campaign description',
  hint: 'more detail about the campaign',
  budget: 'a budget',
  startDate: 'a start date',
  endDate: 'an end date',
};

/**
 * Named missing slots for validation clarify — never the generic "more detail" string on confirm paths.
 * @param {Array<{ field?: string; reason?: string }> | null | undefined} validationErrors
 * @param {string} [locale]
 */
export function formatIntakeValidationClarifyMessage(validationErrors, locale = 'en') {
  if (!Array.isArray(validationErrors) || validationErrors.length === 0) {
    return intakeMessage('needMoreDetail', locale);
  }

  /** @type {string[]} */
  const parts = [];
  for (const err of validationErrors) {
    const reason = String(err?.reason ?? '').trim();
    const field = String(err?.field ?? '').trim();
    // Strict unknown keys are schema rejects — never "I need source type / client request id".
    if (reason === 'unknown_field') continue;
    if (reason === 'requires_store') {
      parts.push('a store');
      continue;
    }
    if (reason === 'required_missing' && field) {
      parts.push(VALIDATION_FIELD_LABELS[field] ?? field.replace(/([A-Z])/g, ' $1').toLowerCase().trim());
      continue;
    }
    if (field === 'executionPath') continue;
    if (field) {
      parts.push(VALIDATION_FIELD_LABELS[field] ?? field.replace(/([A-Z])/g, ' $1').toLowerCase().trim());
    }
  }

  const unique = [...new Set(parts.filter(Boolean))];
  if (unique.length === 0) return intakeMessage('needMoreDetail', locale);
  if (unique.length === 1) return `I need ${unique[0]} to run that safely.`;
  if (unique.length === 2) return `I need ${unique[0]} and ${unique[1]} to run that safely.`;
  return `I need ${unique.slice(0, -1).join(', ')}, and ${unique[unique.length - 1]} to run that safely.`;
}
