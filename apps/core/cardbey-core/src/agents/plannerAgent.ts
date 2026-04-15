/**
 * OpenAI-backed Planner Agent.
 * Reasons over user input and optional research context, then replies in text.
 * When the reply contains "Next Steps" (or similar) with a numbered list, those steps are posted as a plan_update
 * so the UI shows executable Run/Skip buttons (execution_suggestions).
 */

import { getPrismaClient } from '../lib/prisma.js';
import { broadcastAgentMessage, broadcastThreadMessage } from '../realtime/simpleSse.js';
import { openaiChatComplete } from '../services/openaiClient.js';
import { createAgentMessage } from '../orchestrator/lib/agentMessage.js';

const PLANNER_SYSTEM_PROMPT = `You are the Cardbey Planner Agent. You help SMEs (small and medium businesses) with plan, store, and marketing workflows.

You receive:
1. The user's message or request.
2. An optional "Research Agent summary" when research was run (sources or findings).

You respond with clear next steps, clarifying questions, or a brief plan. Be concise and actionable. Do not call tools; just reply in plain text.

When you give a list of next steps or follow-up actions, use a heading like "### Next Steps" and a numbered list (1. ... 2. ...). Each line should be one actionable step (e.g. "Prepare marketing assets (graphics, flyers)."). Up to 5 steps. This allows the system to turn them into executable actions.`;

const PLANNER_GROUP_CHAT_SYSTEM_APPEND = `

You are in group_chat mode: the Research Agent has already gathered facts and evidence for this turn. You are the lead strategist and the only one who sends the final answer to the user.
- Ground your answer in the Research Agent summary where possible; cite or summarize key facts.
- If the research is ambiguous or incomplete, note any uncertainty and still give your best recommendation.
- If you disagree with something in the research, briefly explain why in your answer.
- You have the final say on all recommendations and decisions. Keep the reply concise, clear, and actionable.`;

/** Max number of recent messages to include when building context (for future history trimming). */
const MAX_RECENT_MESSAGES = 10;

export interface RunPlannerAgentParams {
  missionId: string;
  tenantId: string;
  userMessage: string;
  researchSummary?: string;
  threadId?: string;
  /** When true (group_chat mode), use synthesis rules: ground in research, note uncertainty, final say. */
  groupChatMode?: boolean;
}

/**
 * Build the user-side content for the planner: user message + optional research summary.
 */
function buildUserContent(userMessage: string, researchSummary?: string): string {
  const user = (userMessage || '').trim() || 'No message.';
  if (!researchSummary?.trim()) {
    return `User message:\n${user}`;
  }
  return `User message:\n${user}\n\nResearch Agent summary:\n${researchSummary.trim()}`;
}

const MAX_STEP_LABEL_LEN = 80;

/**
 * Derive a short step label for execution_suggestions/MissionTask (max 80 chars).
 * Prefers "Title" when line is "**Title**: description" or "Title: description".
 */
function toStepLabel(raw: string): string {
  const s = (raw || '').trim();
  if (!s) return '';
  if (s.length <= MAX_STEP_LABEL_LEN) return s;
  const boldTitle = s.match(/^\*\*(.+?)\*\*\s*:?\s*/);
  if (boldTitle) return boldTitle[1].trim().slice(0, MAX_STEP_LABEL_LEN);
  const colonTitle = s.match(/^(.+?)\s*:\s*/);
  if (colonTitle) return colonTitle[1].trim().slice(0, MAX_STEP_LABEL_LEN);
  return s.slice(0, MAX_STEP_LABEL_LEN);
}

/**
 * Parse "Next Steps" (or similar) numbered list from Planner reply for executable follow-up steps.
 * Looks for ### Next Steps / **Next Steps** / Next Steps followed by lines like "1. ..." or "- ...".
 * Long lines (e.g. "1. **Select Products**: \"Identify...\"") are shortened to the title part so steps are still converted to execution commands.
 * @returns Array of step labels (max 5), each up to 80 chars.
 */
function parseNextStepsFromReply(reply: string): string[] {
  const trimmed = (reply || '').trim();
  if (!trimmed) return [];
  const lines = trimmed.split(/\r?\n/);
  let inSection = false;
  const steps: string[] = [];
  const numberedRe = /^\s*(?:\d+[.)]\s*|[-*]\s*)(.+)$/;
  for (const line of lines) {
    const t = line.trim();
    if (/^#{1,3}\s*Next\s+Steps\s*:?\s*$/i.test(t) || /^\*\*Next\s+Steps\*\*\s*:?\s*$/i.test(t) || /^Next\s+Steps\s*:?\s*$/i.test(t)) {
      inSection = true;
      continue;
    }
    if (inSection) {
      const m = t.match(numberedRe);
      if (m) {
        const label = toStepLabel(m[1].trim());
        if (label.length > 0) {
          steps.push(label);
          if (steps.length >= 5) break;
        }
      } else if (t.length > 0 && steps.length > 0) {
        break;
      }
    }
  }
  return steps;
}

/**
 * Post an AgentMessage from the planner.
 */
async function postPlannerMessage(missionId: string, reply: string, threadId?: string): Promise<void> {
  const prisma = getPrismaClient();
  const message = await prisma.agentMessage.create({
    data: {
      missionId,
      senderType: 'agent',
      senderId: 'planner',
      visibleToUser: true,
      channel: 'main',
      performative: null,
      messageType: 'text',
      content: { text: reply },
      payload: null,
      threadId: threadId ?? undefined,
    },
  });
  broadcastAgentMessage(missionId, { missionId, message });
  if (threadId) broadcastThreadMessage(threadId, { threadId, message });
}

/**
 * Run the Planner Agent: reason over user message and optional research, then post one reply to the mission chat.
 * Long histories are trimmed to the last MAX_RECENT_MESSAGES when loading from the thread (future use).
 */
export async function runPlannerAgent(params: RunPlannerAgentParams): Promise<void> {
  const { missionId, tenantId, userMessage, researchSummary, threadId, groupChatMode } = params;
  const missionIdTrimmed = (missionId || '').trim();
  if (!missionIdTrimmed) {
    console.warn('[plannerAgent] missionId required');
    return;
  }

  const userContent = buildUserContent(userMessage, researchSummary);
  const systemPrompt =
    groupChatMode && researchSummary?.trim()
      ? PLANNER_SYSTEM_PROMPT + PLANNER_GROUP_CHAT_SYSTEM_APPEND
      : PLANNER_SYSTEM_PROMPT;

  let reply: string;
  try {
    reply = await openaiChatComplete({
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[plannerAgent] OpenAI completion failed:', message);
    await postPlannerMessage(
      missionIdTrimmed,
      `I couldn't generate a reply right now: ${message}. Please try again.`,
      threadId
    );
    return;
  }

  if (!reply.trim()) {
    await postPlannerMessage(missionIdTrimmed, 'I don’t have a specific next step yet. Can you tell me more about what you’d like to do?', threadId);
    return;
  }

  await postPlannerMessage(missionIdTrimmed, reply, threadId);

  const nextStepLabels = parseNextStepsFromReply(reply);
  if (nextStepLabels.length > 0) {
    try {
      const steps = nextStepLabels.map((label, i) => ({ id: `s${i}`, label: label.slice(0, 80), status: 'todo' }));
      await createAgentMessage({
        missionId: missionIdTrimmed,
        threadId: threadId ?? undefined,
        senderId: 'planner',
        senderType: 'agent',
        channel: 'main',
        text: 'Next Steps',
        messageType: 'plan_update',
        payload: { title: 'Next Steps', steps },
        visibleToUser: true,
      });
    } catch (err) {
      console.warn('[plannerAgent] Failed to post plan_update for next steps:', err instanceof Error ? err.message : err);
    }
  }
}

export { MAX_RECENT_MESSAGES };
