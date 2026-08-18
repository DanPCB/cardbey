/**
 * Converts structured facts into natural-language explanations via LLM.
 */

import { StructuredFact } from './factTypes.js';
import { llmGateway } from '../llm/llmGateway.ts';
import { projectPerformerStatus } from '../performerTurnBelief/projectPerformerStatus.js';

/**
 * @returns {boolean}
 */
export function isStructuredFactsExplainEnabled() {
  const raw = String(process.env.STRUCTURED_FACTS_EXPLAIN ?? '').trim().toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'off') return false;
  if (raw === 'true' || raw === '1' || raw === 'on') return true;
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
}

/** Maps stable action keys → short CTA labels for legacy `ctaButtons` consumers. */
export const ACTION_CTA_LABELS = {
  open_store: 'Open store',
  open_existing: 'Open existing store',
  edit_details: 'Edit details',
  create_another: 'Create another store',
  add_product: 'Add product',
  create_campaign: 'Create campaign',
  publish_store: 'Publish store',
  add_special_requirements: 'Add special requirements',
  sign_in: 'Sign in',
  continue_as_guest: 'Continue as guest',
  cancel: 'Cancel',
  retry: 'Try again',
  view_details: 'View details',
  continue: 'Continue',
  start_next: 'Start next step',
  edit: 'Edit',
  provide_input: 'Provide input',
  skip: 'Skip',
};

export class PerformerExplainer {
  /**
   * @param {{ context?: Record<string, unknown> }} [opts]
   */
  constructor(opts = {}) {
    this.context = opts.context && typeof opts.context === 'object' ? opts.context : {};
  }

  /**
   * @param {StructuredFact | Record<string, unknown>} factInput
   * @returns {Promise<{ explanation: string | null; actions: string[]; data: Record<string, unknown>; event: string }>}
   */
  async explain(factInput) {
    const fact = factInput instanceof StructuredFact ? factInput : new StructuredFact(factInput);

    if (!isStructuredFactsExplainEnabled()) {
      return {
        explanation: null,
        actions: fact.allowedActions,
        data: fact.data,
        event: fact.event,
      };
    }

    const prompt = this._buildPrompt(fact);
    const tenantKey =
      String(this.context.tenantKey ?? this.context.userId ?? this.context.storeId ?? 'system').trim() ||
      'system';

    try {
      const result = await llmGateway.generate({
        purpose: `structured_fact_${fact.event}`,
        prompt: `${prompt.system}\n\n${prompt.user}`,
        tenantKey,
        maxTokens: 320,
        temperature: 0.65,
        responseFormat: 'text',
      });
      const explanation = String(result.text ?? '').trim() || null;
      return {
        explanation,
        actions: fact.allowedActions,
        data: fact.data,
        event: fact.event,
      };
    } catch {
      return {
        explanation: null,
        actions: fact.allowedActions,
        data: fact.data,
        event: fact.event,
      };
    }
  }

  /**
   * @param {StructuredFact} fact
   */
  _buildPrompt(fact) {
    const systemPrompt = `You are Performer, a friendly AI assistant that helps users manage their stores.

Your job is to explain what happened in natural, human language.
Be conversational, warm, and clear.
Do not use technical terms like "entity conflict" or "validation error."
Explain the situation naturally in 1-3 short sentences.
Do not invent facts that are not in the structured data.`;

    return {
      system: systemPrompt,
      user: this._buildUserPrompt(fact),
    };
  }

  /**
   * @param {StructuredFact} fact
   */
  _buildUserPrompt(fact) {
    const { event, entityType, reason, data, allowedActions } = fact;
    let prompt = `Explain this to the user in natural language:\n\n`;

    switch (event) {
      case 'store_created':
        prompt += `A store was created successfully.
Store name: ${data.storeName}
Store ID: ${data.storeId}
Created at: ${data.createdAt}

Explain that the store is ready and what they can do next.`;
        break;

      case 'entity_conflict':
        if (entityType === 'store' && reason === 'duplicate_name') {
          prompt += `The user tried to create a store but already has one with the same name.
Existing store name: ${data.existingEntity?.name}
Existing store ID: ${data.existingEntity?.id}

Available actions: ${allowedActions.join(', ')}

Explain the situation naturally and offer the available actions.`;
        } else {
          prompt += `Event: ${event}
Entity: ${entityType}
Reason: ${reason}
Data: ${JSON.stringify(data, null, 2)}

Explain what happened naturally.`;
        }
        break;

      case 'validation_error': {
        const fields = Array.isArray(data.fields) ? data.fields : [];
        const fieldLines = fields.map((f) => `${f.field}: ${f.message}`).join('\n');
        prompt += `The user's input has validation errors:
${fieldLines}

Available actions: ${allowedActions.join(', ')}

Explain what needs to be fixed and how they can resolve it.`;
        break;
      }

      case 'permission_denied':
        prompt += `The user tried to perform an action but doesn't have permission.
Reason: ${reason}
Required: ${data.requiredAction}

Available actions: ${allowedActions.join(', ')}

Explain why they can't do this and what they need to do instead.`;
        break;

      case 'action_succeeded':
        if (reason === 'store_mission_started') {
          const projected = projectPerformerStatus(this.context?.turnBelief, {
            missionRunning: true,
            failed: Boolean(this.context?.failed),
            awaitingConfirm: Boolean(this.context?.awaitingConfirm),
          });
          const status = this.context?.performerStatus ?? projected.status;
          const celebratoryOk =
            typeof this.context?.allowsCelebratoryCopy === 'boolean'
              ? this.context.allowsCelebratoryCopy
              : projected.allowsCelebratoryCopy;
          if (!celebratoryOk) {
            prompt += `Store setup cannot celebrate yet.
Store name: ${data.storeName}
Performer status: ${status}
Reason: status does not allow celebratory kickoff copy.

Available actions: ${allowedActions.join(', ')}

Explain calmly that you need a conflict resolved or more evidence before starting — do NOT say automated setup has kicked off.`;
          } else {
            prompt += `A store build mission has started.
Store name: ${data.storeName}
Mission ID: ${data.missionId}
Intent mode: ${data.intentMode}
Location: ${data.location ?? 'not specified'}
Business type: ${data.businessType ?? 'not specified'}

Available actions: ${allowedActions.join(', ')}

Explain that the automated store setup has started and what they can do while it runs.`;
          }
        } else {
          prompt += `Action succeeded.
Reason: ${reason}
Data: ${JSON.stringify(data, null, 2)}

Explain what happened naturally.`;
        }
        break;

      case 'action_failed':
        prompt += `An action failed.
Action: ${data.action}
Reason: ${reason}
Details: ${JSON.stringify(data.details ?? {}, null, 2)}

Available actions: ${allowedActions.join(', ')}

Explain what went wrong and what they can try next.`;
        break;

      default:
        prompt += `Event: ${event}
Entity: ${entityType}
Reason: ${reason ?? 'n/a'}
Data: ${JSON.stringify(data, null, 2)}
Available actions: ${allowedActions.join(', ')}

Explain what happened naturally.`;
    }

    if (this.context.userName) {
      prompt += `\n\nThe user's name is ${this.context.userName}.`;
    }
    if (this.context.activeStoreName) {
      prompt += `\nThey are currently working with their store "${this.context.activeStoreName}".`;
    }

    return prompt;
  }
}

/**
 * @param {string[]} actions
 * @returns {string[]}
 */
export function actionKeysToCtaLabels(actions) {
  return (Array.isArray(actions) ? actions : [])
    .map((key) => ACTION_CTA_LABELS[String(key)] ?? String(key))
    .filter(Boolean);
}
