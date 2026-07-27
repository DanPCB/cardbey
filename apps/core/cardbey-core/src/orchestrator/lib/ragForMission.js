/**
 * RAG for Mission – run retrieval and optionally post Research Agent message.
 * Uses existing RAG service (buildRagContext). Call before planner tool decisions.
 */

import { buildRagContext } from '../../services/ragService.js';
import { getPrismaClient } from '../../lib/prisma.js';
import { broadcastAgentMessage } from '../../realtime/simpleSse.js';

const RAG_SUMMARY_MAX_LEN = 600;

/**
 * @typedef {Object} RagContext
 * @property {string} query
 * @property {string} missionId
 * @property {string} tenantId
 * @property {string} [scope] - Optional scope filter for retrieval
 */

/**
 * @typedef {Object} RagDoc
 * @property {string} id
 * @property {string} [sourcePath]
 * @property {number} [chunkIndex]
 * @property {string} [snippet]
 */

/**
 * @typedef {Object} RunRagResult
 * @property {RagDoc[]} retrievedDocs
 * @property {string} summary
 * @property {string} [context] - Full context string for planner (truncated if long)
 */

/**
 * Run RAG for a mission: retrieve docs, build summary, and post a Research Agent message.
 * Uses existing buildRagContext (vector store, retriever). On failure returns null and does not post.
 *
 * @param {RagContext} ctx - { query, missionId, tenantId, scope? }
 * @returns {Promise<RunRagResult | null>} { retrievedDocs, summary, context? } or null on error
 */
export async function runRagForMission(ctx) {
  const { query, missionId, tenantId, scope } = ctx ?? {};
  if (!missionId || typeof missionId !== 'string' || !missionId.trim()) {
    return null;
  }
  const missionIdTrimmed = missionId.trim();
  const question = (query ?? '').trim() || 'General context and strategy';
  const tenantIdStr = tenantId ? String(tenantId).trim() : undefined;

  let ragResult;
  try {
    ragResult = await buildRagContext(question, scope || undefined, tenantIdStr);
  } catch (err) {
    console.warn('[ragForMission] buildRagContext failed:', err?.message || err);
    return null;
  }

  const { context = '', sources = [], chunks = [] } = ragResult;

  const retrievedDocs = sources.map((s) => ({
    id: s.id,
    sourcePath: s.sourcePath,
    chunkIndex: s.chunkIndex,
    snippet: s.snippet,
  }));

  const summary =
    context.length > 0
      ? context.slice(0, RAG_SUMMARY_MAX_LEN) + (context.length > RAG_SUMMARY_MAX_LEN ? '…' : '')
      : retrievedDocs.length > 0
        ? `Retrieved ${retrievedDocs.length} relevant document(s). Use them to ground your answer.`
        : 'No relevant documents found for this query.';

  const payload = {
    summary,
    query: question,
    sources: retrievedDocs.map((d) => ({ id: d.id, snippet: d.snippet, sourcePath: d.sourcePath })),
  };
  const prisma = getPrismaClient();
  try {
    const message = await prisma.agentMessage.create({
      data: {
        missionId: missionIdTrimmed,
        senderType: 'agent',
        senderId: 'research-agent',
        visibleToUser: true,
        channel: 'research',
        performative: null,
        messageType: 'research_result',
        content: {
          text: summary,
          data: { docs: retrievedDocs, query: question },
        },
        payload,
      },
    });
    broadcastAgentMessage(missionIdTrimmed, { missionId: missionIdTrimmed, message });
  } catch (err) {
    console.warn('[ragForMission] Failed to post research message:', err?.message || err);
    // Still return result so planner can use it
  }

  return {
    retrievedDocs,
    summary,
    context: context.slice(0, 2000),
  };
}
