# Tool Development Guide

## Adding a new DeepSeek tool

1. Implement handler in `coreTools.ts` or register dynamically:

```typescript
registry.register({
  name: 'my_tool',
  description: 'What the tool does',
  parameters: [
    { name: 'storeId', type: 'string', description: 'Store ID', required: true },
  ],
  execute: async (params, context) => {
    // Prefer dispatchTool for state-changing operations
    return dispatchCoreTool('existing_executor_name', params, context);
  },
});
```

2. Add unit test in `src/tools/__tests__/`.
3. If the tool should appear in intent enrichment, add to `IntentExecutor.executeWithToolCalling` tool name list.

## Error handling

- Return `{ ok: false, error: 'message' }` — never throw from `execute`
- Blocked tools (approval required) surface as `ok: false` with blocker message

## External APIs

For CRM/ERP/marketing connectors (Step 4), implement a `BaseConnector` and register tools that delegate to it. See `docs/connectors/` (planned).

## Testing

```powershell
cd apps/core/cardbey-core
$env:NODE_ENV='test'
npx vitest run src/tools/__tests__
```
