/**
 * LLM PIL concierge interpretation — structured JSON from trusted context only.
 * Returns null when OpenAI is unavailable or response is invalid.
 */
import OpenAI from 'openai';
import { record as recordFoundationMetric } from '../metrics/foundationMetrics.js';

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const ALLOWED_ACTION_IDS = new Set([
  'explore',
  'ask_performer',
  'create_space',
  'open_space',
  'view_offers',
  'review_briefing',
  'create_offer',
  'open_suitcase',
  'prepare_action',
  'remind_later',
  'dismiss',
  'show_briefing',
]);

const SYSTEM_PROMPT = `You are Cardbey PIL, a contextual business concierge.
You receive structured facts only. You must NOT invent metrics, outcomes, or store details.
You must NOT mention: detected, signal, scoring, backend, PIL, pipeline, instrumentation, or rules.
Write like a helpful human cooperator — short, clear, action-oriented.
Return strict JSON only with keys:
title, message, primaryAction {id, label}, secondaryActions [{id, label}], keyFacts (optional string array), tone (optional), confidenceNote (optional).
primaryAction.id and secondaryActions[].id MUST be chosen from the provided availableActions list only.
message: max 3 short sentences. For owners, synthesize situation + recommended focus.
Include at most one suitcase memory reference if provided.
Never promise guaranteed results.`;

function pickAllowedAction(action, availableActions) {
  if (!action || typeof action !== 'object') return null;
  const id = String(action.id ?? '').trim();
  const label = String(action.label ?? '').trim();
  if (!ALLOWED_ACTION_IDS.has(id)) return null;
  const allowed = (availableActions ?? []).find((a) => a.id === id);
  if (!allowed) return null;
  return { id, label: label || allowed.label };
}

function isDiagnostic(text) {
  return /\b(detected|detection|signal|scoring|backend|pil\b|pipeline|instrumentation)\b/i.test(
    String(text ?? ''),
  );
}

/**
 * @param {object} context - PILContext from dashboard
 * @returns {Promise<object|null>}
 */
function recordConciergeFallback(reason, ms, surface) {
  recordFoundationMetric(
    'pil_concierge_interpret_total',
    { source: 'fallback', reason },
    {
      log: {
        evt: 'pil_concierge_interpret_fallback',
        surface: surface ?? 'unknown',
        reason,
        ms,
      },
    },
  );
}

export async function interpretPilConciergeWithLlm(context) {
  const started = Date.now();
  const surface = context?.surface ?? 'unknown';

  if (!openai) {
    recordConciergeFallback('no_key', Date.now() - started, surface);
    return null;
  }
  if (!context || typeof context !== 'object') {
    recordConciergeFallback('invalid_context', Date.now() - started, surface);
    return null;
  }

  const availableActions = Array.isArray(context.availableActions) ? context.availableActions : [];
  if (availableActions.length === 0) {
    recordConciergeFallback('no_actions', Date.now() - started, surface);
    return null;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.PIL_CONCIERGE_MODEL || 'gpt-4o-mini',
      temperature: 0.4,
      max_tokens: 400,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            actorType: context.actorType,
            surface: context.surface,
            activeEntity: context.activeEntity,
            recentContext: context.recentContext,
            memoryContext: context.memoryContext,
            briefingFacts: context.briefingFacts,
            availableActions,
            constraints: context.constraints,
          }),
        },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) {
      recordConciergeFallback('llm_error', Date.now() - started, surface);
      return null;
    }

    const parsed = JSON.parse(raw);
    const title = String(parsed.title ?? '').trim();
    const message = String(parsed.message ?? '').trim();
    if (!title || !message || isDiagnostic(title) || isDiagnostic(message)) {
      recordConciergeFallback('validation_failed', Date.now() - started, surface);
      return null;
    }

    const primaryAction = pickAllowedAction(parsed.primaryAction, availableActions);
    if (!primaryAction) {
      recordConciergeFallback('validation_failed', Date.now() - started, surface);
      return null;
    }

    const secondaryActions = (Array.isArray(parsed.secondaryActions) ? parsed.secondaryActions : [])
      .map((a) => pickAllowedAction(a, availableActions))
      .filter(Boolean)
      .filter((a) => a.id !== primaryAction.id)
      .slice(0, 2);

    const keyFacts = Array.isArray(parsed.keyFacts)
      ? parsed.keyFacts
          .map((f) => String(f ?? '').trim())
          .filter((f) => f && !isDiagnostic(f))
          .slice(0, 6)
      : undefined;

    const latencyMs = Date.now() - started;
    recordFoundationMetric('pil_concierge_interpret_total', { source: 'llm' });
    return {
      title: title.slice(0, 120),
      message: message.slice(0, 600),
      primaryAction,
      secondaryActions,
      keyFacts,
      tone: parsed.tone ? String(parsed.tone).slice(0, 40) : undefined,
      confidenceNote: parsed.confidenceNote ? String(parsed.confidenceNote).slice(0, 120) : undefined,
    };
  } catch (err) {
    console.warn('[PIL Concierge] LLM interpret failed:', err?.message);
    recordConciergeFallback('llm_error', Date.now() - started, surface);
    return null;
  }
}
