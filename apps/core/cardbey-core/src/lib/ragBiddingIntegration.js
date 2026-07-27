/**
 * RAG integration for bidding layer: index task outcomes and retrieve similar tasks.
 * Stub implementation; when RAG is unavailable, functions no-op or return empty.
 * Use for: few-shot examples, refining bidding by task type, context injection into agents.
 */

import { buildRagContext } from '../services/ragService.js';

let indexingEnabled = false;

/**
 * Enable/disable indexing (e.g. when vector store is configured).
 */
export function setRagBiddingIndexingEnabled(enabled) {
  indexingEnabled = !!enabled;
}

/**
 * Index a task outcome for later retrieval (missionId, task.type, payload, answer, agentKey, reward).
 * Metadata: agentKey, taskType, success, rewardBucket (high/medium/low).
 */
export async function indexTaskOutcome({
  missionId,
  taskType,
  payload,
  finalAnswer,
  agentKey,
  reward,
  success,
}) {
  if (!indexingEnabled) return;
  try {
    // If you have a dedicated indexer (e.g. addDocument with metadata), call it here.
    // Example: await ragService.addDocument({ text: `${taskType}: ${finalAnswer}`, metadata: { missionId, taskType, agentKey, reward, success } });
    if (typeof globalThis.__cardbeyRagIndexTaskOutcome === 'function') {
      await globalThis.__cardbeyRagIndexTaskOutcome({
        missionId,
        taskType,
        payload,
        finalAnswer,
        agentKey,
        reward,
        success,
      });
    }
  } catch (err) {
    console.warn('[ragBiddingIntegration] indexTaskOutcome failed:', err?.message || err);
  }
}

/**
 * Retrieve similar past tasks and high-reward answers for a new task (taskType, payload summary).
 * Returns array of { taskType, agentKey, snippet, reward } for prompt context and bidding hints.
 */
export async function retrieveSimilarTasks({ missionId, taskType, queryText, limit = 5 }) {
  try {
    const question = (queryText || taskType || '').trim() || 'marketing and research context';
    const result = await buildRagContext(question, undefined, undefined);
    const sources = result?.sources || result?.chunks || [];
    return sources.slice(0, limit).map((s) => ({
      taskType: s.taskType || taskType,
      agentKey: s.agentKey,
      snippet: s.snippet || s.text,
      reward: s.reward,
    }));
  } catch (err) {
    console.warn('[ragBiddingIntegration] retrieveSimilarTasks failed:', err?.message || err);
    return [];
  }
}
