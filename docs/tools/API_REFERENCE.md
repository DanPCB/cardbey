# Tool Calling API Reference

## ToolRegistry

### `register(tool: Tool): void`

Register a callable tool.

### `execute(toolName, params, context?): Promise<ToolResult>`

Execute a tool by name. Returns `{ ok, data?, error?, summary? }`.

### `getToolDefinitions(): ToolDefinition[]`

Human-readable definitions for prompts.

### `toLlmToolDefinitions(): LLMToolDefinition[]`

JSON-schema definitions for `llmGateway.complete({ tools })`.

## runToolCallingLoop

```typescript
import { runToolCallingLoop } from '../tools/toolCallingService';

const result = await runToolCallingLoop({
  userMessage: 'Show me campaign analytics for last week',
  context: { userId, storeId },
  toolNames: ['fetch_campaign_analytics', 'get_store_metrics'],
  maxIterations: 5,
  cancelled: () => abortSignal.aborted,
});
```

Returns:

```typescript
{
  content: string;        // Final assistant message
  toolCalls: ToolCallTrace[];
  thinkingText?: string;
}
```

## Intake response fields

When tool calling runs via intent engine:

```json
{
  "action": "chat",
  "response": "...",
  "toolCalls": [{ "id": "...", "name": "get_store_metrics", "status": "completed" }],
  "thinkingText": "..."
}
```

## Multi-agent step executor

`deepseekIntakeBridge` wires `Orchestrator` step execution to `ToolRegistry` and `executeMissionAction`.
