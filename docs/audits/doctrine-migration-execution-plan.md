# Doctrine Migration Execution Plan

**Derived from:** [cardbey-doctrine-violations.md](./cardbey-doctrine-violations.md)  
**Constraint:** Protect Phase-0 French Baguette flow (café store → coffee product → Smart Object promo via QR → loyalty).

---

## Core Doctrinal Truth

The audit proves a single core truth:

> **MI currently behaves like a controller that writes directly to state (routes + orchestration + workers), instead of being a policy layer that calls a deterministic kernel.**

- **Old MI** = "doer" (mutates DB, mixes concerns)
- **New MI** = "conductor" (calls capabilities only, never touches DB directly)

The report is a map of where MI still "does" instead of "conducts."

---

## Prioritized Foundation Direction (Low-Risk)

### Priority 0: Introduce the Kernel Boundary (No Refactor)

**Safest first cut.**

Create `src/capabilities/` (or `src/kernel/`). Add thin wrappers around the most dangerous writes:

- `orchestratorTask.setStatus()`
- `draftStore.setStatus()`
- `draftStore.publish()`

Route MI/orchestra writes through those wrappers. **Boundary insertion, not rewrite.**

**Why first:** Immediately stops doctrine drift (MI bypassing infra) even if internals stay messy.

---

### Priority 1: Add Transition Event Logging (Top Transitions Only)

Do not boil the ocean. Start with:

- DraftStore status transitions
- OrchestratorTask status transitions
- Publish transitions

Event record shape:

- `beforeStatus` / `afterStatus`
- `actor` (human | automation | worker)
- `correlationId` (job/run id)
- `timestamp`
- `reason`

**Enables:** Operator/Observer mode later; debugging + trust now.

---

### Priority 2: Move Readiness Rules Server-Side

UI determines publish readiness today. Add:

- `GET /api/draft-store/:draftId/readiness` → `{ ready, blocks: [{ code, message }] }`
- `POST /api/store/publish` refuses with structured errors when not ready

Frontend calls readiness endpoint and displays reasons. Backend is single source of truth. Preserves AI ↔ Infra determinism.

---

### Priority 3: Consolidate Auth Gating into Policy Map

Single `Action → AuthRequirement` table (JS object at first):

- `draftStore.publish` → requires real auth
- `public.feed` → no auth
- `promo.create` → requires auth

Backend middleware and frontend gatekeeper consult the same policy.

---

### Priority 4: Integration Boundary via Events (Not Workflow Builder)

After transitions exist:

- Outbox table for important transition events
- Webhook delivery (HMAC signing)
- Idempotency enforcement on risky creates

Prevents feature creep; keeps Cardbey simple.

---

## Top 5 Fix Sequence (Reframed)

| # | Issue | Fix |
|---|-------|-----|
| 1 | MI routes writing DB directly (V2) | Insert capability boundary; forbid prisma writes from MI layer going forward |
| 2 | orchestraBuildStore job runner writes directly (V2/V8) | Route all writes through capability wrappers; add idempotency keys |
| 3 | StoreDraftReview owning publish readiness (V3/V10) | Backend readiness endpoint + publish enforcement |
| 4 | draftStoreService scattered state writes (V1) | Centralized transition function; refactor internals later |
| 5 | No transition audit trail (V7) | Event logging for status changes; minimal, high value |

Correct sequence for "AI ↔ Infra first" while protecting French Baguette flow.
