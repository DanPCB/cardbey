/**
 * LangChain.js agent on top of existing RAG (runRagForMission) + mission step memory.
 */

import { runRagForMission } from '../../orchestrator/lib/ragForMission.js';

function isLangChainEnabled() {
  return String(process.env.LANGCHAIN_ENABLED ?? '').toLowerCase() === 'true';
}

export async function executeLangChain(input = {}, context = {}) {
  if (!isLangChainEnabled()) {
    return {
      status: 'failed',
      error: {
        code: 'LANGCHAIN_DISABLED',
        message: 'Set LANGCHAIN_ENABLED=true to enable LangChain executor',
      },
    };
  }

  if (!process.env.OPENAI_API_KEY) {
    return {
      status: 'failed',
      error: {
        code: 'LANGCHAIN_NO_API_KEY',
        message: 'OPENAI_API_KEY required for LangChain executor',
      },
    };
  }

  try {
    // Step 1: RAG via existing pipeline (no vector rebuild)
    const query =
      input.goal ?? input.userPrompt ?? input.campaignContext ?? input.prompt ?? '';
    const missionId = String(context.missionId ?? '').trim();
    const tenantId = String(context.tenantId ?? '').trim();

    const ragResult = await runRagForMission({
      query,
      missionId,
      tenantId,
      scope: input.toolName ?? 'general',
    });

    const stepOutputs = context.stepOutputs && typeof context.stepOutputs === 'object' ? context.stepOutputs : {};
    const memory = Object.entries(stepOutputs)
      .map(([key, val]) => {
        const preview = JSON.stringify(val ?? {}).slice(0, 400);
        return `[${key}]: ${preview}`;
      })
      .join('\n');

    // Step 3: LangChain (dynamic import — avoid cold-start cost when disabled)
    const { ChatOpenAI } = await import('@langchain/openai');
    const { ChatPromptTemplate } = await import('@langchain/core/prompts');
    const { StringOutputParser } = await import('@langchain/core/output_parsers');

    const modelName = process.env.AGENT_LLM_MODEL?.trim() || 'gpt-4o-mini';
    const model = new ChatOpenAI({
      model: modelName,
      temperature: 0.2,
      openAIApiKey: process.env.OPENAI_API_KEY,
      maxTokens: 1500,
    });

    const prompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        `You are a Cardbey marketing agent helping an SME owner.

Store context retrieved via RAG:
{ragContext}

Memory from prior steps in this mission:
{memory}

Respond with a JSON object only. No markdown. No explanation.
Include a "summary" field (1-2 sentences) and a "data" field 
with the relevant output for the task.`,
      ],
      ['human', '{task}'],
    ]);

    const chain = prompt.pipe(model).pipe(new StringOutputParser());

    const taskDescription = JSON.stringify({
      toolName: input.toolName ?? 'unknown',
      goal: query,
      parameters: input,
    });

    const ragContext =
      ragResult?.context ?? ragResult?.summary ?? 'No RAG context available';

    const raw = await chain.invoke({
      ragContext,
      memory: memory || 'No prior steps completed',
      task: taskDescription,
    });

    // Step 4: parse JSON output
    let parsed;
    try {
      const cleaned = String(raw)
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { summary: String(raw).slice(0, 200), data: { text: raw } };
    }

    return {
      status: 'ok',
      output: {
        langchain: true,
        toolName: input.toolName,
        ragDocsRetrieved: ragResult?.retrievedDocs?.length ?? 0,
        summary: parsed.summary ?? String(raw).slice(0, 200),
        data: parsed.data ?? parsed,
      },
    };
  } catch (e) {
    const message = e?.message || String(e);
    return {
      status: 'failed',
      error: { code: 'LANGCHAIN_ERROR', message },
    };
  }
}

// Keep stub export for backward compat
export { executeLangChain as executeLangChainStub };
