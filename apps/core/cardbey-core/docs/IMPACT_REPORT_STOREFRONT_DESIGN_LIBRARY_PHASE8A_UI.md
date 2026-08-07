# Impact Report — Storefront Design Library Phase 8A-UI (Thin Owner Surface)

**Date:** 2026-07-22  
**Status:** Implemented (thin dashboard panel; soft-hide when flags off)  
**Depends on:** `docs/IMPACT_REPORT_STOREFRONT_DESIGN_LIBRARY_PHASE8A_PREVIEW_RENDER.md` (8A-Core)

---

## 1. What could break

| Risk | Mitigation |
|------|------------|
| Panel shown when flags off | Soft-hide on 404/`projection_acceptance_disabled` |
| Accidental publish | Accept CTA only calls projection-acceptance; no publish APIs |
| Confusing Contents Studio Design Library | New folder `features/storefrontDesignLibrary/` — not DesignLibrary.tsx |
| ConsoleExecutionPanel bloat | Thin isolated panel component; mount only for website draft preview |
| Cross-tenant leak | Relies on existing Core auth on comparison/preview/acceptance |

---

## 2. Why

8A-Core proved dual packages + honest primary source. Owners need a minimal surface to compare Current vs Recommended and accept/reject for **draft preview only**.

---

## 3. Scope (locked)

**In:** Current / Recommended summaries, Preview Current / Preview Recommended toggle, difference list, Accept / Reject, acceptance status + fallback reason.  
**Out:** Layout editor, drag-drop, publish cutover (8B), public renderer change.

---

## 4. Smallest safe patch

1. API path helpers + thin client for comparison / preview / acceptance.  
2. `ProjectionAcceptancePanel` mounted above create-store inline website preview in `ConsoleExecutionPanel`.  
3. Soft-fail when APIs disabled or forbidden.

---

## 5. Authority

`authoritative: false` always. Accept updates draft controlled preview only (Core contract).
