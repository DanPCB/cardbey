# CARDBEY_SINGLE_PERFORMER_ONBOARDING_CONVERGENCE_REPORT

**Date:** 2026-09-08  
**Verdict:** `SINGLE_PERFORMER_ONBOARDING_READY_WITH_LIMITATIONS`

Primary onboarding (Create Your Business, Grow Your Business, Create Profile) now opens the **same canonical Performer** at `/app`. Entry choice is a **hint** (placeholder, chips, mission classification prior). The user’s typed intent remains authoritative.

---

## Canonical Performer

| Item | Location |
|------|----------|
| Route | `/app` (`RequireAuthOrGuest` → `GuestPerformerEntryGuard` → `ConsoleShell` → `ConsoleHomeWorkspace` → `ConsoleCentreColumn`) |
| Idle UI | `PerformerHomeIdle` (`src/app/console/performer/PerformerHomeIdle.tsx`) |
| Composer | Existing `MissionInput` hero composer (attach / voice / vision unchanged) |
| Handoff | `openPerformerIntent` → session stash `cardbey.performerIntent.v1` |

No second general-purpose mission composer was added.

---

## Duplicate mission UIs found

| Surface | Status |
|---------|--------|
| `/grow-your-business` form (“Tell Cardbey…”, textarea, Find Opportunities) | **Bypassed.** Route remains; page redirects into Performer with `GROW_BUSINESS`. |
| `GrowYourBusinessView` | **Kept** (HAS/WANT copy + engine tests). Not rendered by the public route. |
| Create Your Business launcher → `createStoreEntryRoute` (`newStore=1` auto-dispatch) | **Launcher no longer uses this.** Helper remains for other CTAs. |
| `/create-profile` | Already an entry; now uses the shared onboarding handoff (`CREATE_PROFILE`). |
| Desktop `+ Create` | GENERAL Performer (not Store/Grow/Profile-forced). |
| Launchpad / operator tooling | Unchanged. |

---

## Duplicate UIs removed / bypassed

- Grow public page no longer renders a mission textarea or Find Opportunities submit.
- Mobile Create’s three choices and desktop `+ Create` all call `launchPerformerOnboardingEntry` → `/app`.
- Onboarding stashes set `prefillComposer: false` so placeholder copy is **not** stuffed into the composer and is **not** auto-submitted.

---

## Entry context mechanism

Reuse of existing Performer intent stash + `sourceContext` (no parallel store).

```
PerformerEntryContext ≈ {
  source: "create_launcher",
  onboardingEntry: CREATE_BUSINESS | GROW_BUSINESS | CREATE_PROFILE | GENERAL,
  prefillComposer: false,
  placeholderKey,
  mission
}
```

Module: `src/lib/performer/performerOnboardingEntry.ts`  
Classifier (hint ≠ hard route): `src/lib/performer/classifyOnboardingUserIntent.ts`

| Entry | Placeholder | Suggestion chips |
|-------|-------------|------------------|
| CREATE_BUSINESS | Enter your business name to create your store. | Enter business name / Use my website / Describe my business |
| GROW_BUSINESS | Tell me what your business has and what you're looking for. | Find customers / Find distributors / Find partners |
| CREATE_PROFILE | Tell me about yourself or the profile you'd like to create. | Personal / Creator / Professional |
| GENERAL | What would you like Cardbey to help you do? | Existing home quick actions (Create store / Launch campaign / Create video) |

Chips **prefill or focus only**. They do not auto-run a fake mission.

---

## Create Business handoff

Launcher `create_store` → Performer `CREATE_BUSINESS`.  
User text is classified; a business name (e.g. “Seabrook Cellars”) calls existing `startCreateStore`. Explicit “create a store…” still matches `matchCreateStoreIntent` first. Draft-store pipeline is unchanged.

---

## Grow Business handoff

Launcher `grow_your_business` and `/grow-your-business` → Performer `GROW_BUSINESS`.  
Classified grow text → existing `POST /growth/opportunities/analyze` → `formatGrowPerformerPreview` in the Performer thread (HAS / WANT / next actions). Promotion language from this entry is **not** forced into HAS/WANT.

---

## Create Profile handoff

Launcher `create_profile` and `/create-profile` → Performer `CREATE_PROFILE`.  
Profile chips replace the category panel on this shortcut. Other CREATE_PROFILE launches can still show `CreateProfileMissionPanel`. Intake remains the existing profile mission.

---

## General Performer behaviour

Desktop `+ Create` (`create_with_ai`) uses `GENERAL`. Direct `/app` without an onboarding stash keeps rotating home placeholders. Ice/distributor language from GENERAL classifies as grow; “create a promotion…” from Grow classifies as promotion.

---

## HAS/WANT integration

Engine, matching APIs, and `GrowYourBusinessView` are not deleted. Performer is the user input surface. Preview chips include **Find Opportunities** plus existing next actions (research / promotion / profile).

---

## Guest / auth boundary

| Step | Guest | Authenticated |
|------|-------|----------------|
| Open Performer / type | Allowed (`RequireAuthOrGuest`) | Allowed |
| `/grow-your-business` | Allowed (entry redirect; no `RequireAuth` wrapper) | Allowed |
| HAS/WANT analyze API | **Not opened.** Stash user text + sign-in to continue | Runs analyze + preview |
| Store persist / matching / save | Existing auth rules unchanged | Unchanged |

Guests are not granted anonymous analyze/matching. After login, stashed grow text can auto-run as `proposedAction: analysis` (allowed without a publish/billing confirmation).

---

## Routes preserved

- `/app` — canonical Performer  
- `/grow-your-business` — entry into Performer GROW  
- `/create-profile` — entry into Performer PROFILE  
- `createStoreEntryRoute()` (`/app?newStore=1&starter=create_store…`) — other CTAs  
- `/frontscreen` — Discover/templates  
- `/control-center/launchpad` — operator surface  

---

## Files changed (primary)

- `src/lib/performer/performerOnboardingEntry.ts` (+ tests)  
- `src/lib/performer/classifyOnboardingUserIntent.ts` (+ tests)  
- `src/lib/performerIntake/types.ts` / `normalize.ts` (+ onboarding test)  
- `src/lib/createLauncher/createIntentRouter.ts` / `createActionRegistry.ts` / `createLauncher.test.ts`  
- `src/app/console/ConsoleCentreColumn.tsx`  
- `src/app/console/performer/PerformerHomeIdle.tsx`  
- `src/app/console/performer/usePerformerConsole.ts` (`injectHasWantPreview`)  
- `src/pages/growYourBusiness/GrowYourBusinessPage.tsx`  
- `src/pages/business/CreateProfileEntryPage.tsx`  
- `src/lib/growYourBusiness/formatGrowPerformerPreview.ts`  
- `src/i18n/performerOnboardingResources.js` / `growYourBusinessResources.js` / `i18n.js`  
- `src/App.jsx` (`/grow-your-business` guest-openable)  
- Focused tests listed below  

---

## Tests

Targeted (not full-repo):

1. Create Your Business → canonical Performer (`CREATE_BUSINESS`)  
2. Grow Your Business → canonical Performer (`GROW_BUSINESS`)  
3. Create Profile → canonical Performer (`CREATE_PROFILE`)  
4. All four onboarding intents call the same `openPerformerIntent` `/app` surface  
5–7. Store / HAS-WANT / profile initial suggestions (presets + EN/VI packs)  
8. Desktop `+ Create` → GENERAL  
9. `/grow-your-business` source hands off to Performer; no `grow-your-business-input` on the page  
10. Duplicate Grow form not rendered by the route (`GrowYourBusinessView` unused by the page)  
11. Classifier: Grow entry + promotion text → promotion; Create Business + distributors → grow; CREATE_BUSINESS + “Seabrook Cellars” → store  
12. HAS/WANT `analyzeGrowOpportunities` still exported; preview formatter still works  
13. `startCreateStore` still exported; ConsoleCentreColumn still calls it  
14. `PERFORMER_MISSIONS.CREATE_PROFILE` still present; `/create-profile` uses onboarding entry  
15. EN/VI onboarding placeholders do not mix  
16. Guest: `/grow-your-business` is not wrapped in `RequireAuth`; analyze API remains authenticated  

---

## Manual verification URLs

- Mobile Create launcher → Create Your Business / Grow Your Business / Create Profile  
- Desktop `+ Create` → `/app` GENERAL  
- `http://localhost:5174/grow-your-business` → Performer GROW (no Grow form)  
- `http://localhost:5174/create-profile` → Performer PROFILE  
- `http://localhost:5174/app` → general Performer  

Expected copy:

- Create Business: “Enter your business name to create your store.”  
- Grow: “Tell me what your business has and what you're looking for.”  
- Profile: “Tell me about yourself or the profile you'd like to create.”  
- GENERAL: “What would you like Cardbey to help you do?” (when opened via `+ Create`)

Inverse routing:

- GENERAL + flexible ice / Australia distributors → HAS/WANT  
- Grow entry + “Create a promotion for my flexible ice product.” → promotion intake  

---

## Remaining limitations

1. **Guest HAS/WANT preview** still requires sign-in because `/growth/opportunities/analyze` is authenticated. Guests can open Performer and type; analysis/preview runs after identity. The analyze API was **not** opened to anonymous callers.  
2. **Other Create Your Business CTAs** (public header, Explore, My Stores, account menu) still use `createStoreEntryRoute` (`newStore=1` auto-dispatch). Only the Create **launcher** and onboarding shortcuts were converged. Changing those would auto-start store creation without a name, which this task explicitly left intact.  
3. **`GrowYourBusinessView`** remains in the tree for engine/copy tests; it is not the public UX.  
4. Classification is **regex + entry prior**, not a full NLU model. Ambiguous GENERAL text falls through to existing Performer intake.  
5. Browser end-to-end of the mobile Create sheet was not run in this pass; verification is via targeted tests plus the URLs above.  
6. `performerHomeIdle.i18n.test.tsx` still hits a pre-existing duplicate React / react-dom copy (`cardbey-kimi-integration`). It was not repaired; onboarding placeholder/chip wiring is covered by hook-free tests instead.

---

## Future onboarding

Add a preset to `PERFORMER_ONBOARDING_PRESETS` (intent + placeholder + chips) and a launcher action that calls `launchPerformerOnboardingEntry`. Do not add another mission composer.
