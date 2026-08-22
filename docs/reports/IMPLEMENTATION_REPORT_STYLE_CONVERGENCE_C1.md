# IMPLEMENTATION REPORT — Style Convergence C1 (Read-only Design adapter)

**Authorization:** `ACK OVERVIEW_ROUTE_CLOSURE_THEN_STYLE_CONVERGENCE_C1` (Step 2)  
**Date:** 2026-08-21  
**Prerequisite:** `BUSINESS_OVERVIEW_ROUTE_AND_ENTRY_VERIFIED` ([Overview route report](./IMPACT_REPORT_BUSINESS_OVERVIEW_ROUTE_CLOSURE.md))

## Verdict

`STYLE_CONVERGENCE_C1_READ_ONLY_CONTRACT_READY`

C1 cannot mutate design or public state. Commands are typed but unconfigured. Flags default OFF.

---

## Flag contract

| Layer | Flag | Default |
| ----- | ---- | ------- |
| Core | `ENABLE_WEBSITE_EDITING_DESIGN_ADAPTER_V1` | `false` (`Features.websiteEditingDesignAdapter.v1`) |
| Dashboard | `VITE_ENABLE_WEBSITE_EDITING_DESIGN_ADAPTER_V1` | `false` (`isWebsiteEditingDesignAdapterEnabled`) |

**Decision:** New twin flags (not overlapping Performer content-bridge). Design adapter is a separate capability from Catalog/Shows content editing.

Both server and client enforce: Core returns `NOT_ENABLED` when OFF; Dashboard short-circuits client fetch and hides Design tab unless ON.

---

## Adapter contract

- **Section:** `design` (aliases: `presentation`, `style` for resolve only)
- **Id:** `design`
- **Commands (typed, not configured in C1):** `setTemplate`, `setHero`, `setDraftSections`, `setDesignTokens`, `setLayoutVariant`
- **Resolve context:** Existing Website Editing context (store, draft revision, actor/role, entry, returnTo)
- **URL:** `section=design` allowed in `buildWebsiteEditingReviewUrl`

---

## Design projection

Version: `design_presentation_projection.v1`  
Builder: `buildDesignPresentationProjection.js`  
Endpoint: `GET /api/stores/:storeId/website-editing/design-projection` (owner auth; no auto draft init)

Fields with provenance: template, designTokens, colours, typography, hero, layoutVariant, sectionOrder, sectionVisibility, brandProfile, websiteDirection, compositionAdoption, publicReleaseRef.

Provenance enum: DraftStore, Business style preferences, miniWebsite, Brand Profile, Website direction, Composition adoption, local/legacy, missing, conflict.

Conflicts are reported; no silent winner selection.

---

## Source precedence (C2 persistence contract)

1. Explicit approved canonical draft design  
2. Current DraftStore representation  
3. Adopted composition/design decision  
4. Business public style preferences (bootstrap/reference)  
5. miniWebsite legacy  
6. Defaults  

Local React state is never canonical. Brand/composition exceptions are surfaced via composition readiness `BLOCKED_BY_COMPOSITION_STATE` when adoption meta is `stale`.

---

## Drift diagnostics (read-only)

Hints include: missing draft, template/hero/section mismatches, miniWebsite-without-draft-preview, multiple sources claiming authority, live writer risk (documented). **No repair, mutate, or publish.**

---

## Parallel writer inventory

Encoded in `designParallelWriters.js` (miniWebsite sections PATCH, Business profile PATCH, Shows settings, hero draft PATCH, style chip local state, commitDraft legacy, publishDraft canonical). Classifications: draft-safe / public-direct / legacy / unsafe. Quarantine targets C5/C8 noted. **C1 does not disable writers.**

---

## Readiness values

`NOT_ENABLED` · `READ_ONLY_CONTRACT_READY` · `SOURCE_CONFLICT` · `BLOCKED_BY_MISSING_DRAFT` · `BLOCKED_BY_COMPOSITION_STATE`

---

## UI (minimal)

When flag ON and `section=design`: `DesignPresentationReadOnlyPanel` shows readiness + diagnostics. No style controls. Catalog/Shows adapters unchanged. Style & preview route unchanged. Republish unchanged.

---

## Tests

| Suite | Coverage |
| ----- | -------- |
| Core `designAdapterContract.test.js` | Flag-off projection, conflict provenance, commands unconfigured, writers inventory |
| Dashboard `designAdapterC1.test.ts` | Flag default OFF, section=design kind + URL |

---

## createApp mount

`websiteEditingRoutes` mounted before `stores.js` in `createApp.js` so Phase 0 context + C1 projection resolve under createApp entry (same as `server.js`).

---

## C2 prerequisites

1. Flags remain OFF in committed defaults until C2 intentionally enables mutation path.  
2. Implement configured command handlers writing **only** DraftStore preview/theme (never live miniWebsite).  
3. Persist style chips from Style & preview into draft; stop local-only authority.  
4. Keep diagnostics conflict reporting; do not auto-merge conflicts.  
5. Composition/Brand gates before any public projection publish (still via `publishDraft`).  
6. Overview + Phase B entry paths remain the only owner WE entry.

---

## Explicit non-goals (honored)

No C2 persistence · no Style & preview UI move · no preview redirects · no publishing changes · no push/deploy · BB Flowers/live data untouched.
