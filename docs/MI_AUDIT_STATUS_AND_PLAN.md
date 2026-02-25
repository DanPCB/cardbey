# MI Audit — Status + Plan (No Feature Changes)

**Scope:** `apps/dashboard/cardbey-marketing-dashboard`. Automation spine and backend unchanged. Dashboard UI + MI libs only.

---

## A) Inventory

### Intents (exact string literals) + where they are set

| Intent (string) | Where defined | Where set (entry point) |
|-----------------|---------------|--------------------------|
| `tags` | `miSuggestions.ts` (preset id `tags`), `CHIP_INTENT_MAP['generate_tags']` | Chips: "Generate tags" → `CHIP_INTENT_MAP[chip.goal]` in `MICommandBar.tsx` (openMI context). Suggestions: preset `tags` in panel. |
| `rewrite` | `miSuggestions.ts` (presets `rewrite`, `product_rewrite`, `category_cleanup`), `CHIP_INTENT_MAP['rewrite_descriptions']` | Chips: "Rewrite descriptions". Suggestions: "Rewrite descriptions", "Improve this product", "Improve category". |
| `hero` | `miSuggestions.ts` (preset `hero`), `CHIP_INTENT_MAP['generate_store_hero']` | Chips: "Generate hero" (when `shouldShowGenerateHero()`). Suggestions: "Generate hero". |
| `add_items` | `miSuggestions.ts` (presets `add_items`, `category_add_items`), `CHIP_INTENT_MAP['add_20_items']` | Chips: "Add 20 items". Suggestions: "Add 20 items", "Add items to this category". Category button: `handleOpenMIForCategory` sets suggestion with `intent: 'add_items'`. |
| `catalog_autofill` | `miSuggestions.ts` (preset `catalog_autofill`), `CHIP_INTENT_MAP['autofill_product_images']` | Chips: "Auto-fill images". Suggestions: "Auto-fill missing images". |
| `smart_promo` | `miSuggestions.ts` (preset `smart_promo`) | Product CTA: `openMI` with `context: { ..., intent: 'smart_promo' }` in StoreDraftReview. Suggestions: "Create smart promotion". |

**Defined in code:**

- **Suggestions (intent on preset):** `src/lib/mi/miSuggestions.ts` — `MI_SUGGESTIONS[].intent` for: `tags`, `rewrite`, `hero`, `add_items`, `catalog_autofill`, `smart_promo`; product_rewrite/category_add_items/category_cleanup use `rewrite`/`add_items`/`rewrite`.
- **Chips (goal → intent):** `src/features/storeDraft/review/MICommandBar.tsx` — `CHIP_INTENT_MAP`: `add_20_items`→`add_items`, `generate_tags`→`tags`, `rewrite_descriptions`→`rewrite`, `generate_store_hero`→`hero`, `create_smart_object_promo`→`smart_promo`, `autofill_product_images`→`catalog_autofill`.
- **Product CTA:** `StoreDraftReview.tsx` — `openMI({ mode: 'product', context: { ..., intent: 'smart_promo' }, suggestion: { ... } })`.
- **Category button:** `StoreDraftReview.tsx` — `handleOpenMIForCategory` → `openMI({ mode: 'category', suggestion: { ..., context: { ..., intent: 'add_items' } } })`.

### Gates + localStorage / env keys

| Gate | Purpose | localStorage (DEV) | Env (optional) |
|------|---------|-------------------|-----------------|
| Executor mode | dry_run vs real | `cardbey.miExecutor` = `'real'` or `'dry_run'` | `VITE_MI_EXECUTOR_MODE`, `VITE_ENABLE_MI_EXECUTOR` |
| Tags write | Allow PATCH for intent `tags` | `cardbey.miExecutorWrites` = `'true'` | `VITE_ENABLE_MI_EXECUTOR_WRITES` |
| Rewrite write | Allow PATCH for intent `rewrite` | `cardbey.miExecutorWrites.rewrite` = `'true'` | `VITE_ENABLE_MI_EXECUTOR_WRITES_REWRITE` |
| Hero write | Allow PATCH for intent `hero` | `cardbey.miExecutorWrites.hero` = `'true'` | `VITE_ENABLE_MI_EXECUTOR_WRITES_HERO` |

**File:** `src/lib/mi/miExecutorWriteGate.ts` — `isMIExecutorWriteEnabled()`, `isMIExecutorWriteEnabledFor(intent)`.

### Executors

| Executor | Where | Behavior |
|----------|--------|----------|
| **dry_run** | `src/lib/mi/miExecutor.ts` — `DryRunExecutor` | No network. Returns ok, status `dry_run`, message "Dry run: command accepted (no network calls).", output: intent, mode, promptLength. |
| **real** | `src/lib/mi/miExecutor.ts` — `RealExecutor` | GET `/api/auth/me`, then one of GET draft-store by id / by-store / stores/temp/draft. If intent in allowlist and gate on: build patch (tags/rewrite/hero), PATCH `/api/draft-store/:draftId` once. Else: read-only or write_blocked. No POST, no /run, no publish. |

**Selection:** `src/lib/mi/miCommands.ts` — `getMIExecutor()` returns `RealExecutor` iff `getMIExecutorMode() === 'real'` (`src/lib/mi/miExecutorMode.ts`).

### Entry points (where openMI / Send are used)

| Entry point | File | Behavior |
|-------------|------|----------|
| **Inline bar** | `MICommandBar.tsx` | Typing syncs `draftPrompt`. Submit opens panel only; no Send here. |
| **Chips** | `MICommandBar.tsx` | Click → `openMI({ prompt: CHIP_SUGGESTION_PROMPTS[goal], context: { ..., intent: CHIP_INTENT_MAP[goal] } })`. Opens panel + prefill. |
| **Floating sparkle** | `StoreDraftReview.tsx` | `data-testid="mi-floating-button"` → `openMI({ context: miHelperContext })`. |
| **Product CTA** | `StoreDraftReview.tsx` | AmbientMIAssistant “Open MI Assistant” → `openMI({ mode: 'product', context: { ..., intent: 'smart_promo' }, suggestion: { ... } })`. |
| **Category button** | `StoreDraftReview.tsx` | “Ask MI about this category” (`mi-category-open`) → `handleOpenMIForCategory` → `openMI({ mode: 'category', suggestion: { ..., context: { ..., intent: 'add_items' } } })`. |
| **Panel Send** | `MIHelperPanel.tsx` | Only place that calls `sendMI()`. Send button + Enter in panel input. |

**Note:** ImproveDropdown and NextMIActions use `handleMIAction` (startOrchestraTask + runOrchestraJob). That is the orchestra path, not the MI panel executor path.

---

## B) Current matrix (table)

| Intent | Open UI? | Prefill prompt? | Dry-run behavior | Real read-only checks | Real write behavior | Gate key | Tests present |
|--------|----------|------------------|------------------|------------------------|----------------------|----------|---------------|
| **tags** | Yes (chips, suggestions) | Yes | Accepted, no network | GET auth/me + draft | PATCH when gate on | `cardbey.miExecutorWrites` | Yes: gate OFF, gate ON, 403, forbidden calls |
| **rewrite** | Yes (chips, suggestions) | Yes | Accepted, no network | GET auth/me + draft | PATCH when gate on | `cardbey.miExecutorWrites.rewrite` | Yes: gate OFF, gate ON, forbidden in rewrite test |
| **hero** | Yes (chips, suggestions) | Yes | Accepted, no network | GET auth/me + draft | PATCH when gate on | `cardbey.miExecutorWrites.hero` | Yes: gate OFF, gate ON, 403 |
| **add_items** | Yes (chips, suggestions, category) | Yes | Accepted, no network | GET auth/me + draft | Read-only; write_blocked if any gate on | — | Yes: write_blocked (intent_not_allowed) |
| **catalog_autofill** | Yes (chips, suggestions) | Yes | Accepted, no network | GET auth/me + draft | Read-only; write_blocked if any gate on | — | Covered by “no forbidden calls” (no add_items PATCH) |
| **smart_promo** | Yes (product CTA, suggestions) | Yes | Accepted, no network | GET auth/me + draft | Read-only; write_blocked if any gate on | — | Same |

- **Open UI:** All intents are set from chips and/or suggestions and/or product/category; all go through `openMI()` and open the panel.
- **Prefill:** Chips and suggestions set prompt (and intent) via `openMI`/`openWithSuggestion`; product/category set suggestion with prompt + intent.
- **Dry-run:** Same for all: `DryRunExecutor` returns success, no network.
- **Real read-only:** All intents get preflight GETs (auth/me + one draft GET). Only tags/rewrite/hero can PATCH when their gate is on.
- **Real write:** Only tags / rewrite / hero; each has its own gate. Others get `write_blocked` (reason `intent_not_allowed`) when any write gate is on.

---

## C) Findings

- **Chip vs suggestion copy:** Chips use `CHIP_SUGGESTION_PROMPTS` in MICommandBar (e.g. "Generate short, useful tags..."); suggestions use `MI_SUGGESTIONS[].prompt` in miSuggestions (e.g. "Generate SEO tags and keywords..."). Same intent, different wording. Acceptable; no intent mismatch.
- **Category “Ask MI”:** Sets `intent: 'add_items'` and prompt about improving category. Suggestion id `category-add-items` in code; miSuggestions has `category_add_items` with intent `add_items`. Consistent.
- **No duplicate Send:** Inline bar has no Send button (removed). Only `MIHelperPanel` calls `sendMI()` (Send button + Enter in panel). Tests enforce no "Send" button in `mi-inline`.
- **No PATCH without gate:** `RealExecutor` only calls `miPatch` after `intentAllowed` and `isMIExecutorWriteEnabledFor(intent)`. Allowlist is `['tags','rewrite','hero']`. No other path calls `miPatch` in MI lib.
- **Progress strip:** Rendered in `StoreDraftReview` when `(!AUTOHIDE_MI_PROGRESS || showMiProgressRow)`. With `AUTOHIDE_MI_PROGRESS = true`, strip shows only while job running or for 8s after completion (one `setTimeout`, cleanup on unmount). When hidden, `mi-progress-row` is not in DOM.
- **Forbidden-call tests:** In `tests/MIUnifiedHelper.test.tsx`: Step 7 asserts no POST; Step 9 “no forbidden calls” asserts: no POST, no URL with `/api/mi/orchestra/job/` and `/run`, no publish URL. Step 10 rewrite test also asserts no POST and no job/run. Step 11 hero tests do not re-assert forbidden calls in the same test; hero gate ON test only checks PATCH count and body. Adding an explicit “hero flow: no POST/run/publish” assertion would close the loop (optional).
- **Where forbidden-call protections are enforced:** `tests/MIUnifiedHelper.test.tsx` — Step 7 (real + 401): no URL matching `/\/run$/`; Step 9: after sendMI (real, add_items), assert postCalls.length === 0, no job/run URL, no publish URL; Step 10 rewrite gate ON test: same post/jobRun filters. Gate off/on: Step 8 (tags), Step 10 (rewrite), Step 11 (hero) each have gate OFF → no PATCH, gate ON → one PATCH with expected body, 403 → status failed.
- **ImproveDropdown / NextMIActions:** Use `handleMIAction` which calls `startOrchestraTask` + `runOrchestraJob` (orchestra backend). That path is separate from the MI panel `sendMI()` → executor pipeline. Not part of the “one panel, one Send” MI executor flow; no change needed for this audit.

---

## D) Plan to finish phase (prioritized)

### P0 (must do)

1. **Confirm write allowlist and docs**
   - **Task:** Ensure docs (e.g. `docs/MI_UNIFIED_HELPER.md`) state write allowlist is tags + rewrite + hero and list gate keys. No code change if already correct.
   - **Files:** `docs/MI_UNIFIED_HELPER.md` (and any Step 8/10/11 doc).
   - **Tests:** None.

2. **Optional: one test that hero flow has no forbidden calls**
   - **Task:** In the existing “Step 11: real + hero gate ON” test, add assertions: `postCalls.length === 0`, no job/run URL, no publish URL (same pattern as Step 9).
   - **Files:** `tests/MIUnifiedHelper.test.tsx`.
   - **Tests:** Extend existing Step 11 hero gate ON test with forbidden-call assertions.

3. **Verification checklist and rollback doc**
   - **Task:** Ensure `docs/MI_UNIFIED_HELPER.md` (or a single MI doc) has: vitest command, localStorage flags for real + each write gate, and a short rollback list (files to revert for Step 8/10/11).
   - **Files:** `docs/MI_UNIFIED_HELPER.md` or `docs/MI_STEP11_HERO_INTENT_DONE.md`.

### P1 (nice)

- **UX:** Progress strip already auto-hides when `AUTOHIDE_MI_PROGRESS = true`. Optional: document the flag and 8s behavior in the doc.
- **UX:** Align chip prompt copy with suggestion copy for “Generate tags” (single source) — optional, low priority.

### Defer (high risk / out of scope)

- **Orchestra path (ImproveDropdown, NextMIActions):** Do not change `handleMIAction` or orchestra start/run in this phase. They are a separate flow from the MI executor.
- **Backend / spine:** No new endpoints, no change to PATCH/GET contract, no POST to job/run, no publish.
- **New intents (e.g. add_items write):** Defer; phase complete is “write allowlist only tags + rewrite + hero”.

---

## E) Verification checklist

### Commands to run (vitest)

```bash
cd apps/dashboard/cardbey-marketing-dashboard

# Minimal MI + gates + hero
npx vitest run tests/miHelperStore.test.ts tests/miExecutorMode.test.ts tests/miExecutorWriteGate.test.ts tests/MIUnifiedHelper.test.tsx tests/miHeroPatch.test.ts

# Full MI suite (includes tags/rewrite patch tests)
npx vitest run tests/miHelperStore.test.ts tests/miExecutorMode.test.ts tests/miExecutorWriteGate.test.ts tests/miTagsPatch.test.ts tests/miRewritePatch.test.ts tests/miHeroPatch.test.ts tests/MIUnifiedHelper.test.tsx
```

Expected: all tests pass (e.g. 76 for full suite).

### Manual steps (localStorage flags)

- **Real mode:** `localStorage.setItem('cardbey.miExecutor', 'real')`
- **Tags write:** `localStorage.setItem('cardbey.miExecutorWrites', 'true')`
- **Rewrite write:** `localStorage.setItem('cardbey.miExecutorWrites.rewrite', 'true')`
- **Hero write:** `localStorage.setItem('cardbey.miExecutorWrites.hero', 'true')`
- **Debug console:** `localStorage.setItem('cardbey.debug', '1')`

Manual checks: panel is only Send; chips/suggestions open panel and prefill; real + gate off → no PATCH; real + gate on for tags/rewrite/hero → one PATCH; network tab shows no POST, no job/run, no publish.

---

## F) Rollback strategy

- **Revert by feature (recommended):** One commit per “step” so each can be reverted independently.
- **Step 8 (tags write):** Revert `miExecutorWriteGate.ts`, `miTagsPatch.ts`, `miExecutor.ts` (tags branch only), `miHttp.ts` (miPatch if only used for tags), `MIHelperPanel.tsx` (tags status), tests for tags gate, docs for Step 8.
- **Step 10 (rewrite):** Revert `miExecutorWriteGate.ts` (rewrite key + `isMIExecutorWriteEnabledFor` rewrite), `miRewritePatch.ts`, `miExecutor.ts` (rewrite branch + allowlist/anyWriteGateOn), `miHelperStore`/`miCommands` (patch_preview), `MIHelperPanel` (rewrite status), `StoreDraftReview` (refresh-after-patch if only for rewrite), tests for rewrite, docs.
- **Step 11 (hero):** Revert `miExecutorWriteGate.ts` (hero key + hero branch), `miHeroPatch.ts`, `miExecutor.ts` (hero branch), `MIHelperPanel` (hero status), tests for hero, docs.
- **Progress auto-hide:** Revert `StoreDraftReview.tsx` (AUTOHIDE_MI_PROGRESS, showMiProgressRow, effect, conditional render of progress row).
- **Inline bar (no Send):** Revert `MICommandBar.tsx` (add Send button back, remove title), `StoreDraftReview.tsx` (order of MICreationTimeline vs MICommandBar if changed), tests that assert no inline Send and progress order.

**Single “revert all MI executor writes” commit:** Revert files from Step 8 + 10 + 11 + progress auto-hide in one commit; leaves dry-run and real read-only only.
