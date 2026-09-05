# Impact Report — AU/VN SME Discovery Engine (Real Local Pilot Expansion)

**Date:** 2026-09-05  
**Status:** Awaiting acknowledgment before implementation  
**Ontology:** Marketplace ↔ Performer ↔ Resources — discovery feeds **Resources** (BusinessCandidate / seeds); store generation remains under **Performer** with safe-execution governance. Never a fourth top-level product.

---

## Current state (what already exists)

| Layer | Location | Reality |
|-------|----------|---------|
| Melbourne West pilot UI | `GrowthCommandCenterPage.tsx` | Hardcoded 5 suburbs + 8 categories; dry-run default; explicit no auto-store / publish / owner contact |
| Pilot config SoT | `batch001Config.ts` | Same 5 suburbs + 8 categories + OSM/Google keyword maps |
| Candidate pipeline | `realLocalDiscoveryService.ts`, `candidateIngestionPipeline.ts` | Candidates only → `PENDING_QA`; no Store/Draft |
| Enrichment | ABR + web + Pexels (+ broader sources opt-in) | Dry-run default; live HTTP capped |
| QA | `QaReviewPage.tsx` / `candidateQaService.ts` | Approve → **BusinessSeed** only, never Store |
| Multi-market registry | `src/lib/marketRegistry/*` | Partial AU (Melbourne-first) + partial VN (HCM/Hanoi sample) + ~coarse category groups |
| Multi-market service | `multiMarketDiscoveryService.ts` + routes file | Code present; **`Features.multiMarketPrebuilt` missing**; **routes not mounted** in `server.js` |

**Do not** widen `BATCH001_SUBURBS` / `REAL_LOCAL_PILOT_CATEGORIES` to “all AU/VN” — that would break Batch 001 metrics, rate limits, and pilot semantics.

---

## (1) What could break

- Melbourne West **Real local business pilot** fetch/QA/metrics if suburb/category defaults or batch IDs change.
- Growth Command Center UI if dropdowns switch source without API readiness.
- Enrichment / ABR paths if VN candidates are forced through AU ABR.
- Store creation / publish if Phase 4 auto-store is wired without confirmation governance.
- Google/OSM rate limits and cost if “full sweep” expands to nationwide without caps.
- Duplicate BusinessCandidate / seed floods if geography expands without dedupe + batch isolation.
- Feature flag gaps: mounting routes before `Features.multiMarketPrebuilt` exists → boot/runtime errors.

## (2) Why

- Pilot lists are **duplicated** (Core + dashboard) and are intentionally Melbourne-scoped.
- Spec asks for nationwide AU + all VN provinces + hundreds of SME categories + MST + auto-store — far beyond the locked pilot contract.
- Multi-market scaffolding exists but is **incomplete** (flags + mount + UI).
- Safe-execution governance forbids auto-publish / owner outreach without confirm.

## (3) Impact scope

| Area | Impact |
|------|--------|
| Real-local pilot (`/real-local/discover`) | **Must stay unchanged** in Phase 1–3 |
| `marketRegistry` | Expand territories + fine-grained categories |
| Multi-market HTTP | Wire flags (default OFF) + mount routes |
| Growth UI | Add **separate** AU/VN panel (or progressive disclosure), keep Melbourne pilot panel intact |
| Enrichment | ABR = AU only; MST stub/adapter for VN (new) |
| Store generation (Phase 4) | Performer + confirmation only; out of Phase 1 |

## (4) Smallest safe patch (recommended Phase 1A — foundation only)

**Goal:** Enable expandable AU/VN discovery **without** changing Melbourne pilot behavior.

1. Add `Features.multiMarketPrebuilt.*` (all **default OFF**).
2. Mount `multiMarketPrebuiltRoutes.js` behind those flags.
3. Expand `marketRegistry`:
   - AU: all 8 states/territories + priority cities/suburbs from the spec (phased; not “every street”).
   - VN: major cities + province list (priority groups).
   - Categories: expand from coarse groups → fine SME taxonomy (product + service + VN-specific), with `providerSearchTerms` AU/VN.
4. Growth UI: new **“Multi-market discovery”** section (country → territory → category), calling `/api/markets` + multi-market discover; **leave** “Real local business pilot” as-is.
5. Keep safety: dry-run default, no auto-store, no publish, no owner contact; separate `batchId`s (`MM_AU_*` / `MM_VN_*`).
6. CLI (optional in 1A): `discover:au` / `discover:vn` wrappers calling the same service.

**Explicitly deferred (not in 1A):**

- MST live integration (Phase 2)
- Social / Zalo / Yellow Pages / LinkedIn (Phase 2–3)
- Confidence scoring + duplicate engine hardening (Phase 3)
- Auto-store generation / owner contact / publish (Phase 4 — **governance required**)

---

## Phased roadmap (aligned to your phases)

| Phase | Deliverable | Gate |
|-------|-------------|------|
| **1A** | Flags + mount + registry expansion + separate UI | Pilot unchanged; flags OFF in prod until soak |
| **1B** | AU discover via Google/OSM using registry; ABR enrich remains AU | Rate limits + dry-run |
| **2** | VN provinces/cities + VN categories + MST adapter (P0 stub → live) | No ABR on VN |
| **3** | Confidence, dedupe, freshness, QA polish | Confidence ≥70% before any auto path |
| **4** | Store generate from seed via Performer + confirm | `autoSubmit: false`; no owner outreach silent |

---

## Acceptance criteria mapping (honest)

| Spec criterion | Near-term reality |
|----------------|-------------------|
| All 8 AU states | Achievable via registry + multi-market jobs |
| Top 50 suburbs nationally | Achievable as curated priority list (not OSM completeness) |
| 25+ categories | Achievable; full hundreds need taxonomy IDs + search terms |
| All 63 VN provinces | Achievable as registry entries; discovery quality varies by Places coverage |
| MST verified | **Not built** — needs Phase 2 adapter |
| Auto-publish | **Forbidden** without Phase 4 governance |

---

## Recommendation

Proceed with **Phase 1A only** after acknowledgment. Do **not** replace the Melbourne pilot dropdowns with the full AU/VN lists in one shot.
