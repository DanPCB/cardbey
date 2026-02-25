# MI Step 11 — Intent: hero (DONE Report)

## 1) DONE report — file-by-file diff summary

| File | Change |
|------|--------|
| **src/lib/mi/miExecutorWriteGate.ts** | Added `WRITES_KEY_HERO` (`cardbey.miExecutorWrites.hero`). Extended `isMIExecutorWriteEnabledFor(intent)` with `hero`: reads localStorage and optional `VITE_ENABLE_MI_EXECUTOR_WRITES_HERO`. Default false. |
| **src/lib/mi/miHeroPatch.ts** | **New.** `getHeroFromDraftRaw(draftRaw)`, `buildHeroPatchPreview(draftRaw, context, prompt)`, `buildHeroPatchBody(draftRaw, context, prompt)`. Deterministic headline/subheadline/concept; headline ≤60, subheadline ≤90. PATCH shape: `{ preview: { ...existingPreview, meta: { ...existingMeta, hero: { headline, subheadline, concept } } } }`. Returns null when draft has no preview. |
| **src/lib/mi/miExecutor.ts** | Import `buildHeroPatchBody`. Allowlist extended to `['tags','rewrite','hero']`. `anyWriteGateOn` includes `isMIExecutorWriteEnabledFor('hero')`. Message for hero gate off: "Writes disabled for hero. Real wiring OK (read-only)." New branch for `intent === 'hero'`: gate check, `buildHeroPatchBody`, `miPatch`, success returns `patchPreview: { intent:'hero', draftId, fieldsChanged:['meta.hero'], storeName, headlineLength }`; failure maps 401/403 messages. |
| **src/features/mi/MIHelperPanel.tsx** | Status row: when real + patch done + hero → "Real (draft updated): hero updated." When real + writes disabled + message includes 'hero' → "Real (read-only). Writes disabled for hero." |
| **src/features/storeDraft/StoreDraftReview.tsx** | Comment: refresh after PATCH includes hero. Added `AUTOHIDE_MI_PROGRESS = true`, `showMiProgressRow` state, `miProgressHideTimeoutRef`. Effect: show progress when job running/queued; when completed/failed set show true and `setTimeout(..., 8000)` to hide; cleanup on unmount. Progress row rendered only when `(!AUTOHIDE_MI_PROGRESS || showMiProgressRow)`. |
| **tests/miExecutorWriteGate.test.ts** | `WRITES_KEY_HERO`, clear in beforeEach/afterEach. New test: `isMIExecutorWriteEnabledFor(hero)` uses `cardbey.miExecutorWrites.hero` (true/false/invalid). |
| **tests/miHeroPatch.test.ts** | **New.** getHeroFromDraftRaw, buildHeroPatchPreview (storeName from preview/context/fallback), buildHeroPatchBody (null when no preview, preserves items count, adds meta.hero, length caps). |
| **tests/MIUnifiedHelper.test.tsx** | afterEach clear `cardbey.miExecutorWrites.hero`. Step 11 tests: (A) real + hero gate OFF → no PATCH, message "Writes disabled for hero"; (B) real + hero gate ON → PATCH once, body has `preview.meta.hero` (headline, subheadline, concept), no POST; (C) real + hero gate ON + PATCH 403 → failed, lastError, executor_result http 403. |

No backend routes, request/response shapes, auth, or automation-spine changes. No POST to job/run, no publish, no new polling; one setTimeout only for progress auto-hide (8s), cleared on unmount.

---

## 2) Test command(s) and expected passing count

```bash
cd apps/dashboard/cardbey-marketing-dashboard
npx vitest run tests/miHelperStore.test.ts tests/miExecutorMode.test.ts tests/miExecutorWriteGate.test.ts tests/MIUnifiedHelper.test.tsx tests/miHeroPatch.test.ts
```

Optional (full MI suite):

```bash
npx vitest run tests/miHelperStore.test.ts tests/miExecutorMode.test.ts tests/miExecutorWriteGate.test.ts tests/miTagsPatch.test.ts tests/miRewritePatch.test.ts tests/miHeroPatch.test.ts tests/MIUnifiedHelper.test.tsx
```

**Expected:** All tests pass (e.g. 76 for the full suite: 10 + 4 + 8 + 34 + 8 + 6 + 6).

---

## 3) Manual verification checklist (real mode + hero gate on/off)

- **Hero gate OFF (default)**  
  - Set `localStorage.setItem('cardbey.miExecutor', 'real')`. Do **not** set `cardbey.miExecutorWrites.hero`.  
  - Open MI panel, choose "Generate hero" (intent hero), Send.  
  - **Expect:** Status "Real (read-only). Writes disabled for hero." No PATCH in network tab.

- **Hero gate ON**  
  - Set `localStorage.setItem('cardbey.miExecutorWrites.hero', 'true')`.  
  - Same flow (intent hero, Send).  
  - **Expect:** One GET auth/me, one GET draft-store/:draftId (or by-store), one PATCH draft-store/:draftId with body containing `preview.meta.hero` (headline, subheadline, concept). Status "Real (draft updated): hero updated." Draft preview refreshes once (existing single-shot onRefresh).

- **No forbidden calls**  
  - In network tab: no POST, no `/api/mi/orchestra/job/` + `/run`, no publish.

- **Progress strip (optional)**  
  - With `AUTOHIDE_MI_PROGRESS = true`, "Completed / MI Completed" bar shows while job is running or for 8 seconds after completion, then hides. No intervals; one setTimeout, cleanup on unmount.

---

## 4) Rollback plan (file list, ordered)

1. **src/lib/mi/miExecutorWriteGate.ts** — Remove `WRITES_KEY_HERO` and the `hero` branch in `isMIExecutorWriteEnabledFor`.
2. **src/lib/mi/miHeroPatch.ts** — Delete file.
3. **src/lib/mi/miExecutor.ts** — Remove `buildHeroPatchBody` import and hero branch; revert allowlist to `['tags','rewrite']`; revert `anyWriteGateOn` to exclude hero; remove hero-specific message.
4. **src/features/mi/MIHelperPanel.tsx** — Remove hero status lines (hero updated / writes disabled for hero).
5. **src/features/storeDraft/StoreDraftReview.tsx** — Remove `AUTOHIDE_MI_PROGRESS`, `showMiProgressRow`, `miProgressHideTimeoutRef`, and the effect that sets/show/hide progress; restore unconditional render of the progress row wrapper. Revert comment to "tags/rewrite" only if desired.
6. **tests/miExecutorWriteGate.test.ts** — Remove `WRITES_KEY_HERO` and hero test; remove hero from beforeEach/afterEach.
7. **tests/miHeroPatch.test.ts** — Delete file.
8. **tests/MIUnifiedHelper.test.tsx** — Remove `cardbey.miExecutorWrites.hero` from afterEach; remove the three Step 11 hero tests.
9. **docs/MI_STEP11_HERO_INTENT_DONE.md** — Delete this file (optional).

After rollback, hero intent remains read-only in real mode; tags and rewrite behavior unchanged.
