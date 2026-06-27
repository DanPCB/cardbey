# Context Engine

Phase A foundation for Performer session memory — persistent, queryable context that informs intent classification and mission execution.

## Why

Without durable context, every intake request starts from client-supplied `currentContext` only. The Context Engine adds server-side memory for:

- Active workflow (`store_creation`, `campaign_creation`, …)
- Active store / campaign / mission IDs
- Interaction history and completed actions
- Pending checkpoints (survives refresh)
- Learned preferences and behavior patterns

## Architecture

```
Context Store (Prisma JSON + TTL cache)
        ↓
Context Provider (singleton API)
        ↓
Context Extractor ← intake / missions / tools / feedback
        ↓
Context Queries ← classifyIntent, routing, guards
```

## Location

- Core: `apps/core/cardbey-core/src/lib/context/`
- Persistence: `PerformerSessionContext` Prisma model (`performer_session_contexts`)

## Rollback

Set `DISABLE_CONTEXT_ENGINE=true` in core `.env`. Intake falls back to client `currentContext` only; stored rows are preserved.

## Related docs

- [CONTEXT_API.md](./CONTEXT_API.md)
- [CONTEXT_INTEGRATION.md](./CONTEXT_INTEGRATION.md)
- [CONTEXT_EXAMPLES.md](./CONTEXT_EXAMPLES.md)
