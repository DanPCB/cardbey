# MI Unified Helper — Entry Points & Verification

---

## 🔒 Phase 1 Frozen Scope (internal only)

**Supported (visible):** tags, rewrite, hero (modal only).  
**Hidden (not "coming soon"):** add_items, smart_promo, category improve, Auto-fill images, any future/experimental MI action.  
Future work → Phase 2 only. No backend or automation-spine changes.

---

One MI Assistant panel is the single workspace. All entry points open the same panel (same Zustand store, shared `draftPrompt`). No backend or automation-spine changes.

## Single command pipeline

- **`openMI(input)`** (`src/lib/mi/miCommands.ts`): Single function to open MI with `{ mode, context, prompt?, suggestion? }`. All entry points (inline bar, chips, floating sparkle, product popover CTA, category) call `openMI()` only. Does not run any network request.
- **`sendMI(promptOverride?)`**: Single function to execute the current prompt. **Only the panel** calls this (Send button and Enter in panel input). Step 5: builds a command payload, runs through an **executor** (default: dry-run only, no network), updates execution status and last result; then calls `store.run()`. No API calls; executor is dry-run by default.
- Inline bar Submit no longer runs anything; it only opens the panel so the user can edit and send from the panel.

## Entry points and expected behavior

| Entry point | Location | Behavior |
|------------|----------|----------|
| **Inline “Ask MI what to do…”** | Store draft review, MICommandBar | On focus (when panel closed and text non-empty): opens panel. Typing syncs to store `draftPrompt`. Submit opens panel only; **Send is only in the panel**. |
| **Floating sparkle** | Store draft review, bottom-right | Click opens panel (global). `data-testid="mi-floating-button"`. |
| **Quick action chips** | MICommandBar | “Auto-fill images”, “Generate tags”, “Rewrite descriptions”, “Add 20 items”, “Change hero” (opens hero/avatar modal when onOpenHeroModal provided), “Create Smart Object Promo”. Click opens panel and prefills prompt (except hero when modal used). |
| **Product help popover** | Product card hover → AmbientMIAssistant | “Open MI Assistant” (sublabel: “Create Smart Promotion”). Click opens panel in product mode with smart-promo suggestion, then dismisses popover. |
| **Category** | Next to CategoryNav when a category is selected | “Ask MI about this category” (sparkle). Only when grouping by categories and `selectedCategoryId != null`. Opens panel in category mode with improve-category suggestion. |
| **Panel** | MIHelperPanel (slide-in) | **Only place that sends:** Send button and Enter call `sendMI()`. Header “MI Assistant” + optional pill. Input `draftPrompt`; test ids `mi-panel-input`, `mi-panel-send`, `mi-panel-close`. |

## “Add 20 items” chip

- **Label:** “Add 20 items”
- **Prompt (prefill only):**  
  `Generate 20 additional items for this store. Keep them realistic for the business type, avoid duplicates, and assign sensible categories and prices when possible.`
- **Test id:** `mi-chip-add20`
- No new network calls; prompt is template only; `run()` unchanged.

## Category “Ask MI about this category”

- Shown when: **Group by categories** and a category is selected.
- Click: `openForCategory` + `openWithSuggestion` with prompt  
  `Improve items in category "{label}". Add missing products, refine names, and suggest best-sellers.`
- **Test id:** `mi-category-open`

## Product popover CTA

- CTA: “Open MI Assistant” (sublabel “Create Smart Promotion”).
- On click: `openForProduct` + `openWithSuggestion` (smart promo prompt), then popover dismisses.
- **Test ids:** `mi-ambient-popover`, `mi-ambient-open`, `mi-ambient-dismiss` (header close).

## Manual verification checklist

1. **Inline prompt**  
   Type in inline → panel opens; same text in panel. Type in panel → same text in inline.

2. **Chips**  
   Click “Generate tags” (or “Add 20 items”) → panel opens and prompt is prefilled.

3. **Product sparkle / CTA**  
   Hover product → popover → “Open MI Assistant” → panel opens with product badge and smart-promo prompt; popover closes.

4. **Floating sparkle**  
   Click → console “floating sparkle clicked”; panel opens (global).

5. **Category**  
   Group by categories, select a category → “Ask MI about this category” visible; click → panel opens with category badge and improve-category prompt.

6. **Network**  
   No new endpoints called by opening these entry points; `run()` remains no-op unless wired elsewhere.

## Test IDs

- **Panel:** `mi-panel`, `mi-panel-input`, `mi-panel-send`, `mi-panel-close`, `mi-exec-mode` (when debug on), `mi-exec-status`, `mi-last-result` (when debug on)
- **Chips:** `mi-chip-autofill`, `mi-chip-tags`, `mi-chip-rewrite`, `mi-chip-hero`, `mi-chip-smart-object`, `mi-chip-add20`
- **Hero/avatar modal:** `hero-avatar-modal` (Change hero & avatar modal root)
- **Progress:** `mi-progress-row`
- **Suggestions:** `mi-suggestion-<id>` (e.g. `mi-suggestion-add_items`, `mi-suggestion-smart_promo`, `mi-suggestion-tags`)
- **Ambient:** `mi-ambient-popover`, `mi-ambient-open`, `mi-ambient-dismiss`
- **Floating:** `mi-floating-button`
- **Category:** `mi-category-open`
- **Inline:** `mi-inline`, `mi-inline-prompt`, `mi-inline-send`

## Suggestions Library (local)

- A **local-only** list of ready-to-use prompts shown in the MI panel under a “Suggestions” section (pills). Clicking a suggestion **does not** call `sendMI()` or any network; it only updates store state via `openMI({ open: false, prompt, context: { ...context, intent } })`, so the user can edit and send from the panel.
- **Context-aware:** In product mode, product suggestions (e.g. smart promo, improve product) appear first, then global; in category mode, category suggestions first, then global; otherwise global only.
- **How to add new suggestions:** Edit `apps/dashboard/cardbey-marketing-dashboard/src/lib/mi/miSuggestions.ts`: add an entry to `MI_SUGGESTIONS` with `id`, `title`, `prompt`, optional `intent`, and `scope` (`'global' | 'product' | 'category'`). Use placeholders `{productName}`, `{categoryLabel}`, `{categoryId}` in the prompt for templating; they are replaced by `renderPrompt(preset, context)`.
- **Test ids:** Each suggestion pill has `data-testid="mi-suggestion-<id>"` (e.g. `mi-suggestion-add_items`, `mi-suggestion-smart_promo`).

## Step 5 — Executor (Dry Run)

- **What it does:** When the user hits Send, the panel builds a command payload (prompt, mode, intent, context), pushes a debug event with payload metadata (no prompt text stored beyond length), runs through a single **executor** interface, and shows execution lifecycle in the UI. Default executor is **dry-run only**: no network calls, no spine changes; it returns “Dry run: command accepted (no network calls).”
- **Guarantee:** No backend or automation-spine changes. No new endpoints, no fetch/axios, no polling or timers. All changes are additive and reversible.
- **Debug view:** Enable with `localStorage.setItem('cardbey.debug', '1')`. The panel shows a **Status** row (`mi-exec-status`: Idle / Running / Dry run / Failed) and, when debug is on, a **Last result** block (`mi-last-result`) with truncated executor output (e.g. intent, mode, promptLength). MI Console lists `sendMI` and `payload` events (with `executor=dry_run`).
- **Adding a real executor later:** The executor is selected via `getMIExecutor()` in `src/lib/mi/miCommands.ts` (Step 6: by feature flag). See Step 6 for real mode.

## Step 6 — Executor Mode (feature-flagged)

- **Default:** Executor mode is **dry_run** only. No network calls. Panel shows “Dry Run” and `mi-exec-mode` reflects current mode.
- **Enabling real mode (dev only):** Set `localStorage.setItem('cardbey.miExecutor', 'real')` or use env `VITE_MI_EXECUTOR_MODE=real` with `VITE_ENABLE_MI_EXECUTOR=true`. Panel then shows “Real” and Send uses `RealExecutor`.
- **Real mode today:** Step 7 = read-only GET checks only. Step 8 = optional draft-only write (tags) when write gate is on. See Step 7 and Step 8 below.
- **Flags:** `src/lib/mi/miExecutorMode.ts` — `getMIExecutorMode()`, `isMIExecutorRealEnabled()`. Reads `VITE_MI_EXECUTOR_MODE`, `VITE_ENABLE_MI_EXECUTOR`, and (in DEV) `localStorage.getItem('cardbey.miExecutor')`.
- **Rollback:** Revert Step 6 files: `miExecutorMode.ts`, `miExecutor.ts` (RealExecutor + ExecutorKind), `miCommands.ts` (getMIExecutor + executor_result), `miHelperStore.ts` (MIDebugEvent executor_result), `MIHelperPanel.tsx` (mi-exec-mode), tests, and docs. See `docs/MI_STEP6_EXECUTOR_MODE.md`.

## Step 7 — Real executor read-only GET checks

- **What it does:** When executor mode is **real**, Send runs RealExecutor: GET `/api/auth/me`, then one of GET `/api/draft-store/:draftId`, GET `/api/draft-store/by-store/:storeId`, or GET `/api/stores/temp/draft?generationRunId=...`. No POST, no PATCH (unless Step 8 write gate is on for intent tags). Returns succeeded/failed with `output.checked` and `httpStatus`.
- **Spine unchanged:** Same endpoints as existing automation; read-only. No `/run`, no publish.

## Step 8 — Real executor draft-only writes (tags)

- **Goal:** In real mode, allow a **single** gated write: PATCH `/api/draft-store/:draftId` **only** when intent is `tags` and the **write gate** is enabled. All other behavior remains read-only (Step 7) or dry-run.
- **Gates:** (1) Executor mode must be **real** (Step 6). (2) Write gate must be on: `VITE_ENABLE_MI_EXECUTOR_WRITES=true` or (DEV) `localStorage.setItem('cardbey.miExecutorWrites', 'true')`. Default: writes **disabled**.
- **Endpoints used:** GET auth/me, GET draft-store (by id / by-store / temp), and when gate on + intent tags: PATCH `/api/draft-store/:draftId` with body `{ preview: { items: [ { id?, name?, tags: string[] } ] } }`. Tags are derived from item names (deterministic heuristic).
- **Still forbidden:** POST `/api/mi/orchestra/job/:id/run`, POST `/api/store/publish`, any new polling/timers/routes.
- **Enable in dev:**  
  `localStorage.setItem('cardbey.miExecutor', 'real')`  
  `localStorage.setItem('cardbey.miExecutorWrites', 'true')`
- **Manual verification:** Open draft review → click “Generate tags” chip → open panel → Send. Network tab: GETs then one PATCH to `/api/draft-store/:draftId`. Draft review UI may show tags if the preview displays them; otherwise confirm PATCH response 200.
- **Rollback:** See `docs/MI_STEP8_TAG_WRITE.md`. File list: `miExecutorWriteGate.ts`, `miHttp.ts` (miPatch), `miTagsPatch.ts`, `miExecutor.ts`, `MIHelperPanel.tsx`, tests, docs.

## Step 10 — Real executor draft-only writes (rewrite descriptions)

- **Goal:** In real mode, allow PATCH `/api/draft-store/:draftId` for intent `rewrite` when the **rewrite write gate** is enabled. Deterministic local rewrite (no LLM): empty descriptions get a short line from name/category; existing get trim + optional suffix. Descriptions capped at 140 chars.
- **Gates:** (1) Executor mode **real**. (2) Rewrite gate: (DEV) `localStorage.setItem('cardbey.miExecutorWrites.rewrite', 'true')` or env `VITE_ENABLE_MI_EXECUTOR_WRITES_REWRITE=true`. Default: **disabled**.
- **Endpoints:** Same as Step 8: GET auth/me, GET draft-store; when gate on + intent rewrite: one PATCH with body `{ preview: { items: [ { id?, name?, description, ... } ] } }`.
- **Forbidden:** Same as Step 8: no POST, no `/run`, no publish.

### Write allowlist (Step 8 + 10)

| Intent   | Gate key (localStorage)              | Behavior when gate ON                         |
|----------|--------------------------------------|-----------------------------------------------|
| `tags`   | `cardbey.miExecutorWrites`           | PATCH draft-store (preview.items with tags)  |
| `rewrite`| `cardbey.miExecutorWrites.rewrite`  | PATCH draft-store (preview.items descriptions)|
| All other| —                                    | **Blocked** (read-only; `write_blocked` event)|

### Enable in dev (rewrite)

- `localStorage.setItem('cardbey.miExecutor', 'real')`
- `localStorage.setItem('cardbey.miExecutorWrites.rewrite', 'true')`

### Manual checklist and troubleshooting

- **401 Unauthorized:** Log in; executor GETs `/api/auth/me` first.
- **403 Forbidden:** Draft/store ownership; ensure user owns the draft.

#### Phase 1 non-debug user-facing messages

When debug is off, the panel shows short actionable reasons instead of raw "Failed.":

- **401** → "Failed: Please sign in to use MI actions."
- **Dry run (preview)** → "MI is in preview mode (no changes)."
- **Write blocked (intent not allowed)** → "This action is read-only right now."
- **Writes disabled (gate off)** → "Changes disabled for this action."
- **No draft context** → "Failed: No draft loaded yet." (Send with prompt but no draftId/storeId/generationRunId does not call executor).

#### If you see "Failed" and DevTools shows GET /api/auth/me → 401

- **Meaning:** The real executor calls `/api/auth/me` first; a 401 means the app has no valid session (not signed in, or cookie/token missing).
- **What you’ll see:** The MI panel shows a short message like **"Failed: Please sign in to use MI actions."** (no dev console needed). With `cardbey.debug=1`, the MI Console still shows `httpStatus: 401`.
- **How to fix:**
  1. Sign in (same browser profile you use for the dashboard).
  2. Avoid private/incognito if your auth relies on cookies.
  3. In DevTools → Network, open the request to `/api/auth/me` and confirm it returns 200 when logged in (and that the request sends the same auth the rest of the app uses: e.g. `Authorization: Bearer …` or cookies).
- **Auth alignment:** The MI executor uses the same auth as the rest of the dashboard (`buildAuthHeader` in `miHttp.ts`), so if normal API calls work, MI real mode should too once you’re signed in.
- **Writes disabled for rewrite:** Set `cardbey.miExecutorWrites.rewrite` to `'true'` in dev.
- **UI not updating after PATCH:** Step 11 triggers a single refetch via `onRefresh` after successful tags/rewrite PATCH; if the page provides `onRefresh`, draft preview should update once.

## Step 9 — Manual readiness checklist (real mode + writes)

Before expanding real executor intents (add_items, rewrite, hero, etc.), confirm Step 8 is safe:

1. **How to enable real mode and writes (dev only)**  
   - `localStorage.setItem('cardbey.miExecutor', 'real')`  
   - `localStorage.setItem('cardbey.miExecutorWrites', 'true')`  
   - Or env: `VITE_MI_EXECUTOR_MODE=real`, `VITE_ENABLE_MI_EXECUTOR_WRITES=true`

2. **Network calls that SHOULD appear**  
   - `GET /api/auth/me`  
   - `GET /api/draft-store/:id` (or `GET /api/draft-store/by-store/:storeId` or `GET /api/stores/temp/draft?generationRunId=...`)  
   - When intent is `tags` and tags gate on: **one** `PATCH /api/draft-store/:draftId` with body `{ preview: { items: [ { id?, name?, tags: string[] } ] } }`  
   - When intent is `rewrite` and rewrite gate on: **one** `PATCH /api/draft-store/:draftId` with body `{ preview: { items: [ { id?, name?, description, ... } ] } }`

3. **Network calls that must NOT appear**  
   - `POST` to any URL (no POST from MI executor)  
   - Any URL containing `/api/mi/orchestra/job/` and `/run`  
   - `POST /api/store/publish` (or any publish endpoint)

4. **How to rollback Step 9 changes**  
   - Revert: `miExecutor.ts` (debugEvent + write_blocked guard), `miCommands.ts` (push write_blocked), `miHelperStore.ts` (MIDebugEvent type), `MIHelperPanel.tsx` (write_blocked console line), `MIUnifiedHelper.test.tsx` (Step 9 test), `miTagsPatch.test.ts`, `docs/MI_UNIFIED_HELPER.md` (this section).

## Debug panel (dev only)

- Debug `<pre>` (mode/context) in MIHelperPanel is gated by:  
  `import.meta.env.DEV && localStorage.getItem('cardbey.debug') === '1'`
- Default: hidden. Set `localStorage.setItem('cardbey.debug', '1')` for troubleshooting.

### Debugging — MI Console (dev)

- **Enable:** `localStorage.setItem('cardbey.debug', '1')` (same gate as above). Requires `import.meta.env.DEV === true`.
- **What it shows:** When the panel is open and debug is on, a small “MI Console (dev)” section at the bottom lists the last 10 openMI/sendMI/payload events (metadata only): timestamp, type, mode, intent, prompt length, hasSuggestion; for `payload` events, executor name. No prompt content is ever stored or displayed.
- **Privacy:** Only metadata (timestamp, event type, mode, intent, prompt length as a number, hasSuggestion boolean). No persistence (no localStorage writes for events).

## Tests

- **Store:** `tests/miHelperStore.test.ts` — openGlobal, openForProduct, openWithSuggestion, close, setContext; Step 5: executionStatus, resetExecution, pushRecentPrompt, clearAllComposer, clearIntent.
- **Executor mode:** `tests/miExecutorMode.test.ts` — getMIExecutorMode() default dry_run, localStorage real/dry_run, isMIExecutorRealEnabled().
- **Write gate (Step 8):** `tests/miExecutorWriteGate.test.ts` — default false, env/localStorage override.
- **Integration:** `tests/MIUnifiedHelper.test.tsx` — chip opens panel + prompt prefilled; Add 20 items; product CTA; panel Send; Step 5: dry-run status and lastResult.executor; Step 6: default mi-exec-mode Dry Run; Step 7: real mode GET-only; Step 8: real + tags gate OFF (no PATCH), gate ON (PATCH once), PATCH 403 (failed); Step 9: write_blocked, no forbidden calls; Step 10: rewrite gate OFF/ON, PATCH with descriptions.
- **Rewrite patch:** `tests/miRewritePatch.test.ts` — buildRewritePatchBody item count, descriptions only, capped length.

Run from dashboard app root:

```bash
cd apps/dashboard/cardbey-marketing-dashboard
npx vitest run tests/miHelperStore.test.ts tests/miExecutorMode.test.ts tests/miExecutorWriteGate.test.ts tests/miTagsPatch.test.ts tests/miRewritePatch.test.ts tests/MIUnifiedHelper.test.tsx
```

## ⚠️ Guardrails & Non-Goals

- The MI helper does **not** execute automation. It is a UI command composer only.
- The MI helper does **not** auto-run jobs. All execution requires explicit user action (Send in panel) and future wiring.
- No network calls are made from openMI/sendMI or the store for the MI pipeline. `store.run()` is a no-op until explicitly wired in a reviewed change.
- Adding orchestration or AI execution must be done via explicit, reviewed integration—not by adding calls inside the existing openMI/sendMI/panel flow without approval.

## How to safely extend MI

- **Where to add intent mapping:** In `sendMI()` in `src/lib/mi/miCommands.ts`, the `switch (store.context?.intent)` is the placeholder. Future integration would map intents to orchestration templates or workflows **outside** this file (e.g. a dedicated module that sendMI calls only when execution is explicitly wired).
- **Where NOT to add network calls:** Do not add fetch/axios/orchestration calls inside `openMI`, `sendMI`, or the MI store. Do not add polling, intervals, or auto-calls to `/api/mi/orchestra/job/:id/run` from the UI. Any execution must remain user-confirmed and behind a reviewed integration layer.

## Phase 1 UX rules (MI Assistant)

- **Only panel sends** — Top bar / chips open the panel; Send is only in MIHelperPanel.
- **Top bar is launcher** — Chips + optional text; no duplicate Send; no “step 1 then step 2” flow.
- **Hero action opens image chooser/modal** — “Change hero” chip opens the existing “Change hero & avatar” modal (no Send). Hero suggestion in panel does the same when `onOpenHeroModal` is provided.
- **Debug UI gated** — Executor mode, intent badges, MI Console, last result, payload events only when `import.meta.env.DEV && localStorage.cardbey.debug === '1'`.
- **Progress strip only while running** — “Completed / MI Completed” strip shows only when a job is running or for a short auto-hide window after completion; otherwise hidden. `data-testid="mi-progress-row"`.

## Rollback list (Phase 1 UX)

To revert Phase 1 UI clarity + hero image + hide plumbing:

- `apps/dashboard/cardbey-marketing-dashboard/src/features/mi/MIHelperPanel.tsx` — restore showDebugPre, show all badges/status/console; remove onOpenHeroModal and hero suggestion shortcut.
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/mi/miSuggestions.ts` — restore `getSuggestionsForMode` to return full globalList for global mode.
- `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/MICommandBar.tsx` — remove onOpenHeroModal; hero chip opens panel again; restore label “Generate hero” if desired.
- `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx` — remove openHeroModalRef, onOpenHeroModal from MICommandBar and MIHelperPanel; remove data-testid from branding modal.
- `apps/dashboard/cardbey-marketing-dashboard/tests/MIUnifiedHelper.test.tsx` — revert Phase 1 tests and suggestion test changes (rewrite vs add_items, debug where needed).

## LOCKED RULE (confirmed)

- No backend changes.
- No changes to automation spine:  
  `POST /api/mi/orchestra/start` → `GET /api/stores/temp/draft?generationRunId=...` → `PATCH /api/draft-store/:draftId` → `POST /api/store/publish` → `GET /api/store/:id/preview`
- UI-only: one helper, one store, one panel; no new polling or fetch in `run()`.
