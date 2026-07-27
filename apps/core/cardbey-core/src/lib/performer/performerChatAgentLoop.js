import { llmGateway } from '../llm/llmGateway.ts';
import {
  fastPathGreetingResponse,
  isSimpleGreetingText,
  normalizeIntakeMessageText,
} from '../intent/intentFastPath.js';

function clean(x) {
  return typeof x === 'string' ? x.trim() : '';
}

function safeJsonParse(text) {
  const t = clean(text);
  if (!t) return null;
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Pre-intake conversational gate. Single LLM call decides whether to answer directly (direct_chat)
 * or pass through to the normal intake pipeline (pass_through).
 */
export async function runPerformerPreIntakeAgentLoop({
  userMessage,
  baseEnrichedMessage,
  locale,
  conversationHistory,
  storeId,
  draftId,
  missionId,
  req,
}) {
  try {
    void req;
    const msg = clean(userMessage);
    if (!msg) {
      return { mode: 'pass_through', response: null, reasoning: null, trace: [] };
    }

    const normalized = normalizeIntakeMessageText(msg);
    if (
      isSimpleGreetingText(normalized) &&
      !clean(missionId) &&
      !clean(draftId) &&
      String(process.env.DISABLE_LLM_REASONER_FAST_PATH ?? '').trim().toLowerCase() !== 'true'
    ) {
      const response = fastPathGreetingResponse(locale === 'vi' ? 'vi' : 'en');
      return {
        mode: 'direct_chat',
        response,
        reasoning: 'fast_path_greeting',
        trace: [{ step: 1, action: 'fast_path_greeting', tool: 'none' }],
      };
    }

    const hist = Array.isArray(conversationHistory) ? conversationHistory : [];
    const histBlob = hist
      .slice(-8)
      .map((m) => {
        const role = clean(m?.role) || 'unknown';
        const content = clean(m?.content);
        return content ? `${role}: ${content}` : '';
      })
      .filter(Boolean)
      .join('\n');

    const system = `You are Cardbey's pre-intake chat gate.
Decide whether to:
1) ANSWER directly as a conversational reply (no mission/tools), or
2) PASS_THROUGH to the normal intent pipeline (missions/actions/store/website/etc).

Rules:
- If the user request implies any action, mission, store/website build, editing, publishing, running a campaign, generating assets, or anything that should change data: choose PASS_THROUGH.
- If it's purely informational / clarification / casual chat that can be answered safely without any action: choose ANSWER.
- Be conservative: when unsure, choose PASS_THROUGH.

Return valid JSON only:
{
  "decision": "ANSWER" | "PASS_THROUGH",
  "response": string | null,
  "reasoning": string
}`;

    const user = `Locale: ${locale === 'vi' ? 'vi' : 'en'}
Context:
- storeId: ${clean(storeId) || '(none)'}
- draftId: ${clean(draftId) || '(none)'}
- missionId: ${clean(missionId) || '(none)'}

Recent conversation:
${histBlob || '(none)'}

User message:
${msg}

Enriched message:
${clean(baseEnrichedMessage) || '(none)'}`;

    const prompt = `${system}\n\n${user}`;
    const out = await llmGateway.generate({
      purpose: 'performer:pre_intake_agent_loop',
      prompt,
      tenantKey: 'performer-pre-intake',
      maxTokens: 420,
      temperature: 0.2,
      responseFormat: 'json',
    });

    const parsed = safeJsonParse(out?.text) || {};
    const decision = clean(parsed.decision).toUpperCase();
    const reasoning = clean(parsed.reasoning) || null;
    const response = clean(parsed.response);

    /** @type {Array<any>} */
    const trace = [
      { step: 1, action: 'llm_gate', tool: 'llmGateway.generate', thought: reasoning || undefined, raw: out?.text || '' },
      { step: 2, action: 'decision', raw: JSON.stringify({ decision, hasResponse: Boolean(response) }) },
    ];

    if (decision === 'ANSWER' && response) {
      return { mode: 'direct_chat', response, reasoning, trace };
    }
    return { mode: 'pass_through', response: null, reasoning, trace };
  } catch (e) {
    console.warn('[performerChatAgentLoop] error; falling back to pass_through:', e?.message || e);
    return { mode: 'pass_through', response: null, reasoning: null, trace: [] };
  }
}

