# IMPACT REPORT — Store Creation Entry UX V2

**Date:** 2026-09-03  
**Scope:** Dashboard entry UI for Performer Create Store (`store_creation_draft`)  
**Verdict:** `STORE_CREATION_ENTRY_UX_V2_READY`

Acceptance evidence: `docs/reports/evidence/store-creation-entry-ux-v2/`  
Script: `apps/dashboard/cardbey-marketing-dashboard/scripts/store-creation-entry-ux-v2-acceptance.mjs`  
Result: **45/45 checks passed** (`acceptance-report.json`)

---

## Build / runtime under test

| Item | Value |
|------|--------|
| Environment | Local Vite `http://127.0.0.1:5174` + Core `http://127.0.0.1:3001` |
| Dashboard git HEAD | `0d05a3093de12023e759c5e5155884adfa438139` |
| Dashboard V2 | **Working-tree (uncommitted)** — Vite served V2 from disk |
| Monorepo / Core SHA | `ae08b84079823015d6992d47ef4af8f7a994137f` |
| Build timestamp | `2026-09-02T20:51:xxZ` (acceptance run) |

**Ops note:** Remote `origin/staging` dashboard tip does **not** yet include V2 until these working-tree files are committed and the submodule is bumped. Acceptance proved the V2-containing local runtime.

---

## BEFORE

Traditional first step: Store name + Location + Website + 9-category grid + Continue.

## AFTER

AI-first entry: one clue input → Intake V2 → intelligence/research → progressive clarification only if needed. Manual detailed form is fallback only.

---

## Browser matrix

| Viewport | Result | Screenshot |
|----------|--------|------------|
| 390 | PASS — AI-first entry, no category/location, no H-overflow | `viewport-390-entry.png` |
| 412 | PASS | `viewport-412-entry.png` |
| 430 | PASS | `viewport-430-entry.png` |
| 1440 | PASS — compact entry, shell intact | `viewport-1440-entry.png` |

Keyboard focus layout (mobile): PASS (no overflow).

---

## Path proofs

| Path | Result | Evidence |
|------|--------|----------|
| Name-only `HP Services` | PASS — reached intelligence/create (`Analyzing business: HP Services`) | `path-name-only-after-submit.png` |
| URL-only `modernsecuritydoors.com.au` | PASS — clue → Thinking… / Intake (no pre-research category/location form) | `path-url-only-after-submit.png` |
| Description `Coffee shop in Melbourne` | PASS — reached intelligence/create path | `path-description-only-after-submit.png` |
| Manual fallback | PASS — name/location/category available | `path-manual-fallback.png` |
| Upload affordance | PASS — focuses canonical composer attach (OCR not asserted) | `path-upload-affordance.png` |

Name-only first runtime signal during create: catalog retry noise (`Required step failed` / `unwrapPlacesSearchRow`) — **engine/catalog friction, not entry UX failure**. Entry itself did not fall back to the full manual form.

---

## Legacy `create_store` reachability

| Path | Classification |
|------|----------------|
| `formCard.type === 'create_store'` → `CreateStoreCardPlaceholder` | **UNREACHABLE** — no production emitter |
| Intake V2 `action: create_store` | **USER-REACHABLE** → converged to `store_creation_draft` / V2 card |
| Chip / mission “Create a store for my business” | **USER-REACHABLE** → `store_creation_draft` |
| `?newStore=1&starter=create_store` | **USER-REACHABLE** → draft card |
| `showCreateStoreFormForIntakeV2` | **USER-REACHABLE** — already aliases to `showStoreCreationDraftForIntakeV2` |
| `CreateStoreCardPlaceholder` mount | **TEST/LEGACY ONLY** |

No USER-REACHABLE path presents the old first-step registration form. No second creation engine.

---

## Regression (scope of this gate)

- Global Create / other missions: not redesigned; create-store entry converges to draft V2
- Business-card upload affordance remains reachable
- Manual store creation remains via “Enter details manually”
- Store builder / STRICT validation / research pipeline: not modified in this phase
- Result-first reveal: observed on name-only path (automated setup stream)

---

## Reused capabilities

Performer mission runtime, Create Store intent, store creation draft, Intake V2, research/create pipeline, attachment/OCR composer path, i18n, existing validation.
