# Context Evaluation

Context evaluation runs **only when** `intent.requiresBusiness === true`.

## Flow

```
requiresBusiness === false  →  status: not_required (skip store lookup)
requiresBusiness === true   →  evaluate store context
```

## Store context outcomes

| Stores | Status | Behavior |
|--------|--------|----------|
| Active store in request | `ready` | Use `activeStoreId` |
| 0 stores + create_store | `ready` | Proceed to creation |
| 0 stores + other business intent | `needs_store_creation` | Guide to store creation first |
| 1 store | `ready` | Auto-select store |
| 2+ stores | `needs_store_picker` | Ask which business |

## Examples

| User | Stores | Outcome |
|------|--------|---------|
| "Hi" | 5 | No context evaluation |
| "Create campaign" | 0 | Guide to store creation |
| "Create campaign" | 1 | Auto-select store |
| "Create campaign" | 5 | Store picker |

## Implementation

See `apps/core/cardbey-core/src/intent/context/ContextEvaluator.ts`.

Uses `loadAccountStoreContext` from `lib/intake/accountStoreIntakeGate.js` for store enumeration.
