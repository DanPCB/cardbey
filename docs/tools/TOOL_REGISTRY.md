# Tool Registry

The DeepSeek tool registry (`src/tools/ToolRegistry.ts`) registers callable tools for native LLM tool calling.

## Architecture

```
DeepSeek → tool_calls → ToolRegistry.execute() → dispatchTool / custom handler
```

## Core tools

| Tool | Underlying dispatcher | Purpose |
|------|----------------------|---------|
| `fetch_campaign_analytics` | `get_store_analytics` | Campaign performance |
| `get_store_metrics` | `get_store_analytics` | Store KPIs |
| `create_campaign` | `create_campaign` | Launch campaign |
| `update_product_catalog` | `replace_store_catalog` | Catalog updates |
| `send_notification` | `send_notification` / `send_email` | Alerts |

## Registration

```typescript
import { getToolRegistry, registerCoreTools } from './tools';

registerCoreTools();
const registry = getToolRegistry();
await registry.execute('get_store_metrics', { storeId: '...' }, { userId: '...' });
```

## Feature flags

| Env | Default | Effect |
|-----|---------|--------|
| `DEEPSEEK_TOOL_CALLING_ENABLED` | `true` | Intent engine tool enrichment |
| `LLM_TOOL_CALLING_ENABLED` | `true` | Native tool_calls in llmGateway |

## Related systems

- **Intake tool registry** (`lib/intake/intakeToolRegistry.js`) — kernel metadata / validation
- **Tool dispatcher** (`lib/toolDispatcher.js`) — canonical execution
- **Tool adapter** (`tools/registry.ts`) — UAF launchpack adapter (separate layer)
