# CARDBEY_GUEST_INTENT_PREVIEW_CONVERGENCE_REPORT

**Date:** 2026-09-08  
**Verdict:** `GUEST_INTENT_PREVIEW_BEFORE_AUTH_READY_WITH_LIMITATIONS`

A guest can open the same Performer, describe a Grow/HAS-WANT goal in natural language, see a bounded understanding preview, and authenticate only when they choose **Continue with Cardbey**. Public Create Your Business entries now open Performer with a CREATE_BUSINESS hint instead of auto-dispatching `newStore=1`. Live browser/auth round-trip was not executed in this environment.

---

## 1. CURRENT STATE FOUND

- Canonical Performer: `/app` → `ConsoleCentreColumn` → `PerformerHomeIdle`.
- Create / Grow / Profile / desktop + Create already converged into that composer.
- Entry context was a hint; user text was already authoritative in `classifyOnboardingUserIntent`.
- HAS/WANT analyze was a single authenticated pipeline: semantic parse **and** graph matching in `analyzeGrowYourBusinessIntent`.
- Guests were blocked in `ConsoleCentreColumn` before any analysis (`stash` + login).
- Public header, Explore, home CTA, My Stores empty, Catalog empty, first-run role clarity, and PIL “create space” still used `createStoreEntryRoute` (`newStore=1` auto-dispatch).

---

## 2. ROOT CAUSE OF AUTH-BEFORE-VALUE FLOW

`POST /api/growth/opportunities/analyze` applied `requireAuth` to the whole router and mixed:

1. semantic HAS/WANT understanding (`ingestMarketSignal` + `projectGrowUnderstanding`)
2. account store enrichment
3. persistent graph matching

The dashboard grow branch therefore sent guests to login before showing any understanding.

---

## 3. ARCHITECTURE USED

```
Guest natural language
        ↓
same Performer composer
        ↓
classifyOnboardingUserIntent (user text wins)
        ↓
POST /api/growth/opportunities/preview   (no auth, rate-limited, flag-gated)
        ↓
ingestMarketSignal + projectGrowUnderstanding
        ↓
bounded preview in Performer thread (no companies, no persist)
        ↓
Continue with Cardbey → stash original intent + understanding → /login?returnTo=/app
        ↓
same Performer restores preview (autoSubmit: false)
        ↓
authenticated Find Opportunities → existing /analyze matching
```

No second composer, Grow form, or duplicated semantic engine.

---

## 4. FILES CHANGED

**Core**

- `src/lib/growYourBusiness/growYourBusinessService.ts` — `previewGrowYourBusinessIntent`
- `src/lib/growYourBusiness/growYourBusinessTypes.ts`
- `src/routes/growth/growYourBusinessRoutes.js` — public `/preview`; authed `/analyze`
- `src/middleware/latencyGuard.js`

**Dashboard**

- `ConsoleCentreColumn.tsx` — guest preview, Continue chip, restore after login
- `growYourBusinessApi.ts`, `formatGrowPerformerPreview.ts`
- `performerOnboardingEntry.ts` — continue stash `autoSubmit: false` + `guestHasWantPreview`
- `performerIntake/types.ts`, `normalize.ts`
- `classifyOnboardingUserIntent.ts` — buyers/export language
- i18n `growYourBusinessResources.js`

**Public entry convergence**

- `PublicHeader.tsx`, `HomeCreateEntryCard.tsx`, `useGlobalStoreCreationCTA.ts`
- `launchExploreCapability.ts` (`create_store` / `launcher_create`)
- `FirstRunRoleClarity.tsx`, `roleIntent.ts`
- `MyStoresPage.tsx`, `CatalogPage.tsx`
- `usePILAssistantHost.ts`, `executeSuggestion.ts` (`create_space`)

---

## 5. GUEST-SAFE BOUNDARY

Allowed:

- natural-language input
- HAS/WANT classification
- structured YOU HAVE / YOU WANT
- inferred opportunity label (from WANT, not a company match)
- “Cardbey can help” next-step explanation
- Continue chip

Server DTO always returns `opportunities: []`, `guestPreview: true`, and drops `save_request` / `improve_profile`. Client `previewGrowOpportunities` strips opportunities again.

---

## 6. AUTHENTICATED BOUNDARY

Unchanged and still `requireAuth`:

- `POST /api/growth/opportunities/analyze`
- store context enrichment
- persistent graph matching
- named counterparties
- save / contact / campaign / mutations

Guests clicking Continue are sent to login. Authenticated “Find Opportunities” re-runs **analyze** on the **original** intent text, never the chip label.

---

## 7. AUTH CONTINUATION

- Existing session stash `cardbey.performerIntent.v1`
- `stashPerformerOnboardingContinue(..., { autoSubmit: false, guestHasWantPreview })`
- `/login?returnTo=` current `/app` URL
- After login, Performer restores original text + understanding
- Does **not** auto-run matching or irreversible missions

---

## 8. LEGACY ENTRY ROUTES CONVERGED

Converged to `launchPerformerOnboardingEntry('CREATE_BUSINESS')`:

- Public header Create Your Business
- Homepage create-entry / global store CTA
- Explore create_store / launcher_create **launch**
- First-run “I’m setting up my business”
- My Stores / Catalog empty states
- PIL assistant create-space

**Left in place (intentional):**

- `createStoreEntryRoute` / `newStore=1` runtime consumer in Performer (legacy deep links)
- `pendingBusinessOnboarding` return-path plumbing
- Admin account-menu “Create Store”
- Space switcher `createNewBusinessHref` (authenticated add-another-store)
- Explore capability **href metadata** still contains `newStore=1` (clicks no longer follow it)

Mobile Create sheet remains exactly three items. Desktop + Create remains GENERAL with no dropdown.

---

## 9. CROSS-INTENT TEST RESULTS

| Case | Result |
|------|--------|
| CREATE_BUSINESS + “Seabrook Cellars” | `store` |
| CREATE_BUSINESS + “We need distributors in Sydney.” | `grow` |
| GROW_BUSINESS + ice / Australia distributors | guest preview path + HAS/WANT |
| GROW_BUSINESS + “Create a promotion…” | `promotion` |
| CREATE_PROFILE + “Create a website for my plumbing company.” | `store` (not forced profile) |
| GENERAL + packaging export / Australian buyers | `grow` |

**Guest/auth**

| Case | Result |
|------|--------|
| A Guest can submit HAS/WANT for preview | `/preview` unauthenticated |
| B Does not persist an opportunity | preview service has no graph/DB write |
| C No privileged matching | `opportunities` forced `[]` |
| D No private company names | route + formatter strip |
| E Continue requires authentication | guest chip → login |
| F Original intent survives auth | stash `intentText` + understanding |
| G Return to same Performer | `returnTo=/app` |
| H No duplicate auto-execution | `autoSubmit: false` |
| I Authenticated analyze still works | existing service tests |
| J Create-store pipeline still exists | `startCreateStore` / launcher tests |

Targeted results: dashboard **353 passed** / core grow+latency **21 passed**.

---

## 10. I18N RESULTS

New EN/VI keys: `weUnderstandOpportunity`, `opportunity`, `cardbeyCanHelp`, `help.*`.  
`continueWithCardbey` already existed. Contract test includes the new keys. Guest preview copy is translated; chips use `t()`.

---

## 11. BROWSER VERIFICATION

Not completed in this pass. No dashboard + core pair was running, and this environment has no browser tool.

Manual URLs when servers are up:

- `/` → + Create → `/app` GENERAL
- `/grow-your-business` → Performer GROW → ice/distributor text → guest preview → Continue → login → `/app` with restored understanding
- Mobile Create → three choices → same `/app` composer
- Public header **Create Your Business** → Performer CREATE_BUSINESS (not `newStore=1`)

---

## 12. PRE-EXISTING FAILURES

- `performerHomeIdle.i18n.test.tsx` still hits duplicate React (`cardbey-kimi-integration`). Not repaired.
- Repository-wide vitest was not run.

---

## 13. REMAINING LIMITATIONS

1. Live browser / full login round-trip not verified here.
2. Guest preview quality depends on the existing semantic engine (LLM or rule-assisted). Clarification is returned when HAS or WANT is missing.
3. A few internal/admin/space hrefs still use `createStoreEntryRoute`.
4. Explore registry `href` strings still mention `newStore=1`; launch no longer navigates them for create_store.
5. After login, matching still requires the user to tap **Find Opportunities** (by design: no auto-run).

---

## 14. FINAL VERDICT

`GUEST_INTENT_PREVIEW_BEFORE_AUTH_READY_WITH_LIMITATIONS`

The architectural invariant holds in code and targeted tests:

**ONE PERFORMER. MANY INTENTS. ENTRY CONTEXT IS ONLY A HINT. USER INPUT IS AUTHORITATIVE. SHOW VALUE BEFORE AUTH WHERE SAFE. AUTHENTICATE BEFORE PRIVILEGED ACTIONS.**

READY (unqualified) is withheld until a live guest preview → Continue → login → same Performer restore is confirmed in the browser.
