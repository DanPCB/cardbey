# Cardbey Performer Multi-Agent DeepSeek Integration

Mission-based multi-agent pipeline using DeepSeek V4 Flash for intent classification, planning, critique, refinement, and specialist responses.

## Quick Start

```bash
cd apps/core/cardbey-core

# Ensure DEEPSEEK_API_KEY is set in .env
npm run test:multi-agent

# Run a live mission (requires API key)
npx tsx src/multiAgent/examples/basic_mission.ts
```

## Architecture

```
User Message
    │
    ▼
IntentClassifier ──► STORE_SETUP / MISSION_PLANNING / GENERAL_QUERY / ...
    │
    ├── Setup intents ──► Planner ──► Critic ──► [HITL?] ──► Execute ──► Refiner
    │
    └── Query intents ──► Specialist (domain-specific)
```

## Module Layout

| Path | Purpose |
|------|---------|
| `src/multiAgent/agents/` | Agent classes (classifier, planner, critic, refiner, specialist) |
| `src/multiAgent/orchestrator/` | Pipeline orchestration and parallel execution |
| `src/multiAgent/config/` | DeepSeek and per-agent configuration |
| `src/multiAgent/telemetry/` | Structured logging and metrics |
| `src/multiAgent/tests/` | Unit and integration tests |
| `src/multiAgent/examples/` | Usage examples |

## Environment Variables

See `.env.example` section **Multi-Agent DeepSeek Integration** for full configuration.

Key variables:
- `DEEPSEEK_API_KEY` — DeepSeek API key
- `MULTI_AGENT_ENABLED` — Enable/disable pipeline
- `MULTI_AGENT_SHADOW` — Run shadow comparison with OpenAI
- `HITL_REVIEW_ENABLED` — Pause for human review when critic rejects plan
- `DEEPSEEK_AB_TRAFFIC_PERCENT` — A/B traffic routing (0-100)

## Integration

### Performer Intake V2 (wired)

After intent classification, intake calls `integrateDeepSeekMultiAgentIntake` when `MULTI_AGENT_ENABLED=true`:

- **Shadow mode** (`MULTI_AGENT_SHADOW=true`, current default): enriches classification with `_deepSeekMultiAgent` metadata; existing intake flow unchanged
- **Primary mode** (`MULTI_AGENT_SHADOW=false`): short-circuits eligible requests with DeepSeek responses (`show_execution_plan`, `chat`, or `approval_required`)

Wired in `performerIntakeV2Routes.js` after `normalizeClassificationForKernel`.

### Unified dispatch

`multi_agent` orchestration missions are enriched with DeepSeek plans via `enrichMultiAgentDispatchMetadata` in `unifiedDispatch.js`.

### Programmatic use

```typescript
import { Orchestrator } from './multiAgent/orchestrator/orchestrator.js';

const orchestrator = new Orchestrator();
const result = await orchestrator.processMission(userMessage);
```

## Documentation

- [Installation Guide](../../docs/multiAgent/INSTALL.md)
- [Troubleshooting](../../docs/multiAgent/TROUBLESHOOTING.md)
- [API Reference](../../docs/multiAgent/API_REFERENCE.md)
