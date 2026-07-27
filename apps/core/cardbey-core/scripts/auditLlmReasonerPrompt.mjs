#!/usr/bin/env node
/**
 * One-off audit: LLM Reasoner prompt size breakdown.
 */
import { buildLlmReasonerPromptForTest } from '../src/lib/intent/llmReasoner.js';
import { formatToolRegistryForPrompt, INTAKE_TOOL_REGISTRY } from '../src/lib/intake/intakeToolRegistry.js';

function formatToolSchemaAppendix() {
  return INTAKE_TOOL_REGISTRY.map((t) => {
    const required = Array.isArray(t.requiredParams) ? t.requiredParams : [];
    const optional = Array.isArray(t.optionalParams) ? t.optionalParams.slice(0, 6) : [];
    const props = t.parameterSchema?.properties
      ? Object.keys(t.parameterSchema.properties).slice(0, 8).join(', ')
      : '';
    return `- ${t.toolName}: required=[${required.join(', ')}] optional=[${optional.join(', ')}]${
      props ? ` schema_keys=${props}` : ''
    }`;
  }).join('\n');
}

const input = { text: 'help me to create a store, named Golden Restaurant' };
const options = {
  locale: 'en',
  conversationHistory: Array.from({ length: 50 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: 'Previous turn message about store setup and menu items '.repeat(5),
  })),
  currentContext: { activeStoreId: null, activeDraftId: 'draft-123' },
};

const mem0 = process.memoryUsage().heapUsed;
const toolBlock = formatToolRegistryForPrompt();
const schemaAppendix = formatToolSchemaAppendix();
const { system, user, messages } = buildLlmReasonerPromptForTest(input, options);
const mem1 = process.memoryUsage().heapUsed;

const intentListChars = (system.match(/one of: ([^"]+)/)?.[1] ?? '').length;
const systemShell = system.length - toolBlock.length - schemaAppendix.length - intentListChars;
const historyInMessages =
  messages.reduce((s, m) => s + (m.content?.length || 0), 0) - system.length - user.length;
const totalMsgChars = messages.reduce((s, m) => s + (m.content?.length || 0), 0);

const components = [
  { name: 'Tool registry block', chars: toolBlock.length },
  { name: 'Tool schema appendix', chars: schemaAppendix.length },
  { name: 'Intent type list', chars: intentListChars },
  { name: 'System prompt shell', chars: systemShell },
  { name: 'User block (latest turn)', chars: user.length },
  { name: 'Conversation history in messages', chars: historyInMessages },
];

const total = totalMsgChars;

console.log(
  JSON.stringify(
    {
      intakeToolCount: INTAKE_TOOL_REGISTRY.length,
      avgSemanticDescriptionChars: Math.round(
        INTAKE_TOOL_REGISTRY.reduce((s, t) => s + (t.semanticDescription?.length || 0), 0) /
          INTAKE_TOOL_REGISTRY.length,
      ),
      messagesCount: messages.length,
      maxHistoryTurnsEnvDefault: 15,
      heapDeltaPromptBuildKB: Math.round((mem1 - mem0) / 1024),
      estimatedInputTokens: Math.round(total / 4),
      totalChars: total,
      components: components.map((c) => ({
        ...c,
        pctOfTotal: total ? Math.round((c.chars / total) * 1000) / 10 : 0,
      })),
    },
    null,
    2,
  ),
);
