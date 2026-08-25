/**
 * Shared helpers for live specialist agents (Claude via llmGateway + withAgentRetry).
 */

import { llmGateway } from '../../llm/llmGateway.ts';
import { withAgentRetry } from '../agentRetry.js';
import { getEvents as getBlackboardEvents } from '../../missionBlackboard.js';

/**
 * @param {object} params
 * @returns {Promise<object | null>}
 */
export async function callAgentJson(params = {}) {
  const {
    system = '',
    user = '',
    purpose = 'orchestration:agent',
    tenantKey = 'default',
    agentName = 'Agent',
    missionId = null,
    sseEmitter = null,
    maxTokens = 900,
    temperature = 0.2,
  } = params;

  const prompt = `${String(system).trim()}\n\n${String(user).trim()}`.trim();
  const out = await withAgentRetry(
    () =>
      llmGateway.generate({
        purpose,
        prompt,
        provider: 'anthropic',
        responseFormat: 'json',
        tenantKey: tenantKey || 'default',
        maxTokens,
        temperature,
      }),
    { agentName, missionId, sseEmitter },
  );

  const text = String(out?.text ?? '').trim();
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/**
 * @param {object} storeKnowledge
 * @returns {string}
 */
export function formatStoreSection(storeKnowledge) {
  if (!storeKnowledge) {
    return 'Store context not available — provide general recommendations.';
  }
  const enrichment = storeKnowledge.enrichmentStatus ?? 'UNKNOWN';
  return `
Business: ${storeKnowledge.name ?? 'Unknown'}
Category: ${storeKnowledge.category ?? 'Unknown'}${
    storeKnowledge.subCategory ? ` / ${storeKnowledge.subCategory}` : ''
  }
Location: ${storeKnowledge.suburb ?? 'Unknown'}${
    storeKnowledge.state ? `, ${storeKnowledge.state}` : ''
  }
Description: ${storeKnowledge.description ?? 'Not available'}
Opening hours: ${storeKnowledge.openingHours ?? 'Not specified'}
Data quality: ${enrichment}
${
  enrichment !== 'ENRICHED'
    ? '⚠ Store data is incomplete — base recommendations on category and location signals only'
    : ''
}
`.trim();
}

/**
 * @param {object} context
 * @param {object} task
 * @param {string} agentType
 * @returns {Promise<object | null>}
 */
export async function findPriorAgentResult(context, task, agentType) {
  const want = String(agentType || '').trim().toLowerCase();
  const prior = Array.isArray(task?.priorWork) ? task.priorWork : [];
  for (let i = prior.length - 1; i >= 0; i -= 1) {
    const p = prior[i];
    if (String(p?.agentType ?? '').toLowerCase() === want) {
      return p?.result ?? null;
    }
  }

  const missionId = String(context?.missionId ?? '').trim();
  if (!missionId) return null;

  try {
    const getEvents = context?.blackboard?.getEvents ?? getBlackboardEvents;
    const bag = await getEvents(missionId, { limit: 200 });
    const events = Array.isArray(bag?.events) ? bag.events : Array.isArray(bag) ? bag : [];
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const ev = events[i];
      const type = String(ev?.eventType ?? ev?.type ?? '');
      const payload = ev?.payload ?? ev?.data ?? {};
      if (type === `${want}:complete` || type === 'agent_completed') {
        if (type === 'agent_completed' && String(payload?.agentType ?? '').toLowerCase() !== want) {
          continue;
        }
        return payload?.output ?? payload?.result ?? null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * @param {object} context
 * @param {string} eventType
 * @param {object} payload
 */
export async function emitAgentEvent(context, eventType, payload) {
  const missionId = String(context?.missionId ?? '').trim();
  if (!missionId || typeof context?.blackboard?.appendEvent !== 'function') return;
  try {
    await context.blackboard.appendEvent(missionId, eventType, payload);
  } catch (err) {
    console.warn(`[${eventType}] appendEvent failed:`, err?.message ?? err);
  }
}

export function emitSse(context, payload) {
  try {
    context?.sseEmitter?.emit?.('agent_status', payload);
  } catch {
    // non-fatal
  }
}
