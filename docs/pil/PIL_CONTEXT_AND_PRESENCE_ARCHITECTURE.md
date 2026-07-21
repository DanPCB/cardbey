# PIL Context and Presence Architecture

**Status:** LOCKED product invariant for visitor-facing PIL  
**Invariant:** `PIL visible context = current verified route context`  
Never: `PIL visible context = last store retained in memory`

---

## Ownership

PIL belongs to **Cardbey**.

| Mode | Meaning |
|------|---------|
| **Platform** | Default. Cardbey system assistant on feed, explore, creators, and general routes. |
| **Store** | Temporary. Cardbey assistant operating with one **verified** active store. |

The store does **not** own PIL. Store context is acquired, validated against the route, and released immediately on leave.

---

## Context model

```ts
PILContext =
  | { scope: 'platform'; source: 'marketplace' | 'explore' | 'creators' | 'general_route'; storeId: null }
  | { scope: 'store'; source: 'public_store' | 'qr_scan' | 'store_deep_link'; storeId: string; storeSlug?: string }
```

Canonical resolver: `src/lib/pil/context/resolvePILContext.ts`  
Controller (generation + active): `src/lib/pil/context/pilContextController.ts`  
Route sync: `src/hooks/pil/usePilResolvedContextSync.ts` (from `PilAssistant`)

Store scope requires:

1. Allow-listed storefront route (`/s|store|space/:slug`)
2. **Verified** store id from authoritative load (public store / activity snapshot for that path) — not slug alone, not memory

---

## Placement ownership

| Concern | Owner |
|---------|--------|
| Orchestration (single) | AppShell → `PilAssistant` → headless `ConciergeHost` |
| Public dock UI | `SharedPILAssistantHost` on `/`, `/frontscreen`, `/creators` |
| Storefront dock UI | `StorefrontPILDockHost` on published `/s/:slug` |
| Context resolution | `resolvePILContext` + `usePilResolvedContextSync` |
| Message composition (store greetings) | `lib/assistant/contextResolver` |

Only one visual corner control is active per route (`shouldHidePilAssistantChrome`).

### Hidden routes (deterministic)

| Route | Reason |
|-------|--------|
| `/login`, `/signup` | Auth flow |
| `/player` | Signage player |
| `/backoffice` | Admin |
| `/device`, `/pair` | Device pair |

---

## Release rules

On **store → platform** or **Store A → Store B**:

- Clear concierge suggestion store
- Clear proactive offer store
- Clear pending concierge delivery
- Bump context generation (late async discarded)

Platform ConciergeHost props **never** re-inject `snap.storeId` from memory.

---

## Async stale protection

Every scheduled activity offer captures `generationAtSchedule`.  
Before UI mutation: `assertActivePilContext(generation)`.  
Mismatch → `pil_stale_response_discarded`, no state write.

---

## Welcome / suggestion priority

**Platform:** general help → feed/discovery → platform events → neutral fallback.  
No store name, campaign, loyalty, or prior `recentActivity`.

**Store:** verified lifecycle / campaign / catalog / store help → neutral store welcome.  
Suggestions carry `storeId`; display requires scope match.

---

## Public data boundary

Store mode: public store DTO / approved campaigns / public `recentActivity` only.  
No drafts, private notes, Studio, or other tenants.

---

## Events

`pil_mounted`, `pil_context_changed`, `pil_store_context_acquired`, `pil_store_context_released`, `pil_stale_response_discarded`, `pil_hidden_by_route`, … (see `eventTypes.ts`).

---

## Persistence

Assistant chrome may persist across compatible routes.  
**Store-scoped content must not** survive incompatible transitions.
