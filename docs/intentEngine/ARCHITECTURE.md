# Intent-First Architecture

Cardbey Performer intake uses a single intent-first pipeline:

```
User Input → Intent Classification → Context Evaluation → Execution
```

## Principles

1. **Classification always comes first** — routing follows intent, not a default runway.
2. **Context is inferred, not forced** — store selection happens only when `intent.requiresBusiness === true`.
3. **One clean pipeline** — no stacked guards (`isCasualChatTurn`, `primaryModeHint` overrides, etc.) before classification.

## Module layout

| Module | Path | Responsibility |
|--------|------|----------------|
| Types | `src/intent/intent.types.ts` | Pipeline contracts |
| Classifier | `src/intent/classifier/IntentClassifier.ts` | Pure message classification |
| Context | `src/intent/context/ContextEvaluator.ts` | Conditional store context |
| Executor | `src/intent/executor/IntentExecutor.ts` | Intent-based execution paths |
| Orchestrator | `src/intent/orchestrator/IntentOrchestrator.ts` | Single pipeline coordinator |
| Bridge | `src/intent/bridge/intentEngineBridge.ts` | Intake V2 response mapping |
| Intake hook | `src/intent/intentEngineIntake.js` | Route integration |

## Feature flags

| Env var | Default | Phase |
|---------|---------|-------|
| `INTENT_ENGINE_SHADOW` | `true` | Phase 1 — compare with legacy, no behavior change |
| `INTENT_ENGINE_PRIMARY` | `false` | Phase 2 — intent engine is primary authority |
| `INTENT_ENGINE_SHADOW_LOG` | `dev only` | Log shadow divergences |

## Governance phases

- **Phase 1 (current):** Engine runs in shadow; legacy pipeline unchanged.
- **Phase 2:** Set `INTENT_ENGINE_PRIMARY=true`; remove legacy guards and shortcuts.
- **Phase 3:** Tune classification, add intent types, enhance context evaluation.

## Legacy code (deprecated)

- `lib/intake/intakeCasualChatTurn.js` — pre-classification chat short-circuit
- `lib/intake/intakeSystemShortcuts.js` — runner-led create-store shortcuts
- `lib/intent/intentReasoner.js` mixed classification/routing — replaced over Phase 2
- `lib/intent/intentIntegration.js` `start_new_workflow` → `create_store` mapping
