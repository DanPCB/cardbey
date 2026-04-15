/**
 * Research Agent – posts into the mission chat with senderId 'research-agent'.
 * Can call real research later; for now simulates research from the user/planner input.
 */

import { getPrismaClient } from '../../lib/prisma.js';
import { broadcastAgentMessage } from '../../realtime/simpleSse.js';

/**
 * Mock research: transform the input into a short summary and optional citations.
 * Replace with a real research function (e.g. search, RAG) when available.
 *
 * @param {string} input - User message or planner request
 * @returns {{ text: string, data?: { citations?: string[] } }}
 */
function doResearch(input) {
  const q = (input || '').trim().slice(0, 200);
  const summary =
    q.length > 0
      ? `Researched: "${q}". Summary: relevant context gathered for planning. (Mock research — replace with real search/RAG.)`
      : 'No query provided. Ready for planner.';
  return {
    text: summary,
    data: {
      citations: [],
      query: q || null,
    },
  };
}

/**
 * Run the Research Agent and post one message to the mission chat.
 * Message has senderType='agent', senderId='research-agent', channel='research', visibleToUser=true.
 *
 * @param {string} missionId - Mission/chat id (same as in AgentMessage)
 * @param {string} input - User message or planner request to research
 * @returns {Promise<object|null>} Created AgentMessage row or null on error
 */
export async function runResearchAgent(missionId, input) {
  if (!missionId || typeof missionId !== 'string' || !missionId.trim()) {
    return null;
  }
  const missionIdTrimmed = missionId.trim();
  const { text, data } = doResearch(input);
  const prisma = getPrismaClient();
  const payload = {
    summary: text,
    citations: data?.citations ?? [],
    query: data?.query ?? null,
  };
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
        content: { text, data: data || undefined },
        payload,
      },
    });
    broadcastAgentMessage(missionIdTrimmed, { missionId: missionIdTrimmed, message });
    return message;
  } catch (err) {
    console.warn('[researchAgent] Failed to persist:', err?.message || err);
    return null;
  }
}
