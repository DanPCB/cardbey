/**
 * Perplexity-backed Research Agent.
 * Answers questions for a mission and posts into Agent Chat as senderId = 'researcher'.
 */

import { getPrismaClient } from '../lib/prisma.js';
import { broadcastAgentMessage, broadcastThreadMessage } from '../realtime/simpleSse.js';
import { perplexityResearch } from '../services/perplexityClient.js';

export interface RunResearchAgentParams {
  missionId: string;
  tenantId: string;
  userMessage: string;
  threadId?: string;
  /** When true (group_chat mode), Research output is marked as supporting; Planner is the main user-visible reply. */
  groupChatMode?: boolean;
}

/**
 * Build query from user message and optional mission context (Mission.context.businessProfile or OrchestratorTask).
 */
async function buildQuery(userMessage: string, missionId: string): Promise<string> {
  const trimmed = (userMessage || '').trim();
  if (!trimmed) return 'What should I research?';

  const prisma = getPrismaClient();
  const ctx: string[] = [];

  const mission = await prisma.mission.findUnique({
    where: { id: missionId },
    select: { context: true },
  }).catch(() => null);

  const businessProfile = mission?.context && typeof mission.context === 'object'
    ? (mission.context as Record<string, unknown>).businessProfile
    : null;
  if (businessProfile && typeof businessProfile === 'object') {
    const p = businessProfile as Record<string, unknown>;
    const name = (p.name || p.businessName || '').toString().trim();
    const address = (p.address || '').toString().trim();
    const website = (p.website || '').toString().trim();
    const parts: string[] = [];
    if (name) parts.push(`Business: ${name}`);
    if (address) parts.push(`Address: ${address}`);
    if (website) parts.push(`Website: ${website}`);
    if (parts.length) ctx.push(parts.join('. '));
  }

  if (ctx.length > 0) return `${trimmed}\n\nContext: ${ctx.join('. ')}`;

  const task = await prisma.orchestratorTask.findUnique({
    where: { id: missionId },
    select: { entryPoint: true, request: true },
  }).catch(() => null);

  if (!task) return trimmed;

  if (task.entryPoint) ctx.push(`Mission type: ${task.entryPoint}`);
  if (task.request && typeof task.request === 'object') {
    const req = task.request as Record<string, unknown>;
    if (typeof req.lastUserMessage === 'string' && req.lastUserMessage.trim()) {
      ctx.push(`User goal: ${(req.lastUserMessage as string).slice(0, 200)}`);
    }
  }
  if (ctx.length === 0) return trimmed;
  return `${trimmed}\n\nContext: ${ctx.join('. ')}`;
}

/**
 * Post an AgentMessage from the researcher (success or failure).
 * When groupChatSupporting is true, UI may show as "Supporting research" (Planner is the main reply).
 */
async function postResearchMessage(
  missionId: string,
  content: { text: string; data?: { sources?: Array<{ title: string; url: string }> } },
  payload: { summary: string; query?: string; sources?: Array<{ title: string; url: string }>; groupChatSupporting?: boolean },
  threadId?: string
): Promise<void> {
  const prisma = getPrismaClient();
  const message = await prisma.agentMessage.create({
    data: {
      missionId,
      senderType: 'agent',
      senderId: 'researcher',
      visibleToUser: true,
      channel: 'main',
      performative: null,
      messageType: 'research_result',
      content,
      payload: payload as Record<string, unknown>,
      threadId: threadId ?? undefined,
    },
  });
  broadcastAgentMessage(missionId, { missionId, message });
  if (threadId) broadcastThreadMessage(threadId, { threadId, message });
}

/**
 * Run the Perplexity-backed Research Agent: research the user message and post one message to the mission chat.
 * On API error, posts a message from researcher explaining that research failed (does not throw).
 * @returns The research answer text for the planner, or null on error.
 */
export async function runResearchAgent(params: RunResearchAgentParams): Promise<{ answer: string } | null> {
  const { missionId, tenantId, userMessage, threadId } = params;
  const missionIdTrimmed = (missionId || '').trim();
  if (!missionIdTrimmed) {
    console.warn('[researchAgent] missionId required');
    return null;
  }

  let result: { answer: string; sources?: Array<{ title: string; url: string }> };
  let query: string;

  try {
    query = await buildQuery(userMessage, missionIdTrimmed);
    result = await perplexityResearch(query);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[researchAgent] Perplexity research failed:', message);
    const failPayload: { summary: string; query?: string; groupChatSupporting?: boolean } = {
      summary: `Research failed: ${message}`,
      query: (userMessage || '').trim().slice(0, 200),
    };
    if (params.groupChatMode) failPayload.groupChatSupporting = true;
    await postResearchMessage(
      missionIdTrimmed,
      {
        text: `Research couldn't be completed: ${message}. You can try rephrasing or try again later.`,
      },
      failPayload,
      threadId
    );
    return null;
  }

  const sources = result.sources ?? [];
  const content = {
    text: result.answer,
    data: sources.length ? { sources } : undefined,
  };
  const payload: { summary: string; query?: string; sources: Array<{ title: string; url: string }>; groupChatSupporting?: boolean } = {
    summary: result.answer,
    query: (userMessage || '').trim().slice(0, 500),
    sources,
  };
  if (params.groupChatMode) payload.groupChatSupporting = true;

  await postResearchMessage(missionIdTrimmed, content, payload, threadId);
  return { answer: result.answer };
}
