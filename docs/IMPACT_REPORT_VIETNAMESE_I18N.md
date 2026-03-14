# Impact Report: Vietnamese Language Support (i18n) Audit and Implementation

## 1. Does Cardbey already have a global i18n system?

**Yes.** Cardbey has a **global i18n system** in place:

- **Location:** `apps/dashboard/cardbey-marketing-dashboard/src/i18n.js`
- **Stack:** i18next + react-i18next
- **Provider:** `I18nextProvider` wraps the app in `src/main.jsx` (line 205); `import i18n from "./i18n"` ensures init runs.
- **Storage:** Language persisted in `localStorage` under `cardbey.lang` (key: `STORAGE_KEY = 'cardbey.lang'`).
- **Languages:** `en` (default/fallback) and `vi` (Vietnamese). `fallbackLng: "en"`, `supportedLngs: ["en", "vi"]`.
- **Detection:** URL param `?lang=vi` or `?lang=en`, then localStorage, then browser language (vi if `navigator.language` starts with `vi`).
- **API:** `setLanguage(lng)`, `STORAGE_KEY` exported; `document.documentElement.setAttribute('lang', lng)` kept in sync; cross-tab sync via `storage` event.
- **Index HTML:** `index.html` sets `<html lang="...">` from url/localStorage before first paint.

The translation file is large (~4k+ lines) with domain-based keys: `app`, `nav`, `actions`, `campaign`, `common`, `auth`, `sidebar`, `publicStore`, `signup`, `businessBuilder`, `alerts`, `templates`, `features`, etc. Vietnamese (`vi`) has matching structure and translations for these namespaces.

---

## 2. Root cause of missing Vietnamese coverage

**Components do not use the translation layer.** No `useTranslation()` or `t()` calls were found in the dashboard app:

- All user-facing strings are **hardcoded in English** in TSX/JSX (e.g. "Mission summary", "View report", "Sign in", "Confirm & Run").
- The i18n dictionary already contains many Vietnamese translations (auth, businessBuilder, common, nav, etc.), but **no component reads from it**.
- So the app always shows English regardless of `cardbey.lang` or browser language.

**Conclusion:** Vietnamese is “missing” because the UI was never wired to the existing i18n; adding more vi keys alone does not help until components use `t('key')`.

---

## 3. Recommended localization architecture

- **Reuse the current global system:** Keep a single `i18n.js` and one `I18nextProvider` in `main.jsx`. No new provider or per-page language hacks.
- **Use react-i18next in components:** `import { useTranslation } from 'react-i18next'; const { t } = useTranslation();` then `t('missionConsole.summary')`. Fallback is automatic (missing key → fallbackLng `en`).
- **Domain-based keys (already in use):**
  - `auth.*` – login, signup, validation, toasts
  - `common.*` – buttons, loading, cancel, back, search, etc.
  - `businessBuilder.*` – onboarding, store setup, overview
  - `missionConsole.*` – **new** for Mission Console: summary, View report, Confirm & Run, Execution, Report, status labels, etc.
  - `execution.*` or under `missionConsole.execution` – Execution drawer: Report, Back to mission, Validating, Running, Completed, Failed, Cancel, Retry, links, checkpoints.
- **Safe fallback:** i18next is configured with `fallbackLng: "en"`. If a vi key is missing, the en key is used; avoid rendering empty strings by using a key that exists in en.
- **No localization of:** Internal IDs, API field names, database enums, or status codes unless explicitly mapped for display. Backend-generated **business content** (e.g. product names, campaign titles) stays as-is; only **UI labels, buttons, placeholders, toasts, validation messages** are localized in the frontend.

---

## 4. Risks to current workflows

| Area | Risk | Mitigation |
|------|------|------------|
| **Onboarding / store creation** | Changing string keys or namespaces could break components that expect specific copy. | Add new keys only; replace hardcoded strings with `t('key')`; keep keys stable. |
| **Mission execution** | Execution drawer and plan block depend on clear labels for status and actions. | Use existing status values; map to display labels via i18n (e.g. `t('missionConsole.statusCompleted')`). No change to execution logic or API. |
| **Draft review / publish** | Buttons and toasts (e.g. "Publish My Store", "Publishing...") must remain clear. | Localize with keys like `publicStore.preview.publishButton` (already in i18n); ensure vi present. |
| **Promotion / campaign** | Campaign and promotion UI strings. | Reuse existing `campaign.*` and add promotion-specific keys under a single namespace; no change to campaign run or API. |
| **Auth / email verification** | Login, signup, and verification pages must show correct messages. | `auth.*` and signup already exist in i18n; wire those pages to `t()`. No change to auth flow or endpoints. |

**Overall:** Risk is **low** if we only (1) add new keys and vi entries, (2) replace literal strings with `t('key')`, and (3) do not change routing, auth logic, or API contracts. No backend or schema changes required.

---

## 5. Files changed (minimal patch) — APPLIED

| File | Change |
|------|--------|
| **`apps/dashboard/cardbey-marketing-dashboard/src/i18n.js`** | Added `missionConsole` namespace (en + vi) with: missionSummary, viewReport, startNewMission, confirmAndRun, modify, cancel, retryValidation, provideStoreInputFirst, useChatToRefine, somethingDidNotComplete, viewTechnicalDetails, hideTechnicalDetails, confidence, objective, steps, validation, risk, missionNotFound, execution, report, backToMission, statusCompleted/Running/Validating/Failed/Cancelled/Idle, cancelButton, retryButton, runMissionPlaceholder, typeNextMission, send, continueNextMissions, clickSuggestionOrType, improveResults, answerQuestions, startFollowUp, whatCanYouDo, newMission, completed, runMissionToSeeExecution. |
| **`apps/dashboard/cardbey-marketing-dashboard/src/app/console/missions/PlanProposalBlock.tsx`** | `useTranslation()`; all button/label copy replaced with `t('missionConsole.*')`. |
| **`apps/dashboard/cardbey-marketing-dashboard/src/app/console/missions/MissionProcessingSummary.tsx`** | `useTranslation()`; View/Hide technical details, Confidence, Objective, Steps, Validation, Risk, Something didn’t complete. |
| **`apps/dashboard/cardbey-marketing-dashboard/src/app/console/missions/MissionDetailView.tsx`** | `useTranslation()`; "Mission not found" → `t('missionConsole.missionNotFound')`. |
| **`apps/dashboard/cardbey-marketing-dashboard/src/app/console/ExecutionDrawer.tsx`** | `useTranslation()`; Execution, Back to mission, Report, Run a mission to see…, Cancel, Retry. |
| **`docs/IMPACT_REPORT_VIETNAMESE_I18N.md`** | This report (audit, root cause, architecture, risks, file list, untranslated list, verification checklist). |

---

## 6. Untranslated pages / components (found)

These are **user-facing** areas with hardcoded English that currently have **no** Vietnamese coverage (no `t()` usage):

- **Mission Console**
  - `PlanProposalBlock.tsx` – Mission summary, View report, Start new mission, Confirm & Run, Modify, Cancel, Retry validation, Provide store input first, Use the chat to refine…
  - `MissionProcessingSummary.tsx` – View/Hide technical details, Confidence, Objective, Steps, Validation, Risk, Something didn’t complete…
  - `MissionDetailView.tsx` – Mission not found (and any other inline copy).
  - `ExecutionDrawer.tsx` – Execution, Report, Back to mission, Completed/Running/Validating/Failed, Cancel, Retry, What’s happening now, checkpoints, Growth opportunities, intents, toasts.
  - `MissionLauncherView.tsx` – Run missions…, launcher placeholder, pills.
  - `NextMissionLauncher.tsx` – Continue next missions, suggestion pills.
  - `ConsoleShell.tsx` / `WorkspaceHeader.tsx` – Header labels if any.
- **Auth**
  - Login/signin page – likely uses some shared auth component; auth.* keys exist but components may not use `t()`.
  - Email verification – verification success/error messages (if rendered in dashboard).
- **Onboarding / Business Builder**
  - businessBuilder.* keys exist in en+vi; components may still be hardcoded (need audit of Business Builder pages).
- **Draft review / Publish**
  - publicStore.preview.* and signup.* exist; components may not use `t()`.
- **Promotion / Campaign**
  - campaign.* and promotion-related copy; may be hardcoded in promotion/campaign pages.
- **Dashboard navigation / forms / toasts**
  - Sidebar, forms, buttons, toasts, empty states, errors – many under common.*, nav.*, alerts.*; need systematic replacement of literals with `t()`.

---

## 7. Manual verification checklist

- [ ] Set `localStorage.setItem('cardbey.lang', 'vi')` and reload; confirm `<html lang="vi">` and that wired pages show Vietnamese.
- [ ] Set `?lang=en` and reload; confirm English and that en persists.
- [ ] Mission Console: Open a mission → Mission summary, View report, Start new mission, Confirm & Run, Modify, Cancel show Vietnamese when lang is vi.
- [ ] Execution drawer: Report, Back to mission, status (Completed/Running/etc.) show Vietnamese when lang is vi.
- [ ] Auth: Sign in page (if wired) shows Vietnamese labels and buttons when lang is vi.
- [ ] Fallback: Remove a vi key (or use a missing key); confirm English is shown, not blank.
- [ ] Onboarding / store creation flow: No regression; buttons and steps still work; when vi, labels in Vietnamese.
- [ ] Draft review / Publish: Publish button and toasts (when wired) show Vietnamese when lang is vi.

---

## 8. Pages covered by this patch

- **Mission Console (mission detail):** PlanProposalBlock (Mission summary, View report, Start new mission, Confirm & Run, Modify, Cancel, Retry validation, store input hint, chat refine text), MissionProcessingSummary (technical details, Confidence, Objective, Steps, Validation, Risk, failure message), MissionDetailView (Mission not found).
- **Execution drawer:** Execution heading, Back to mission link, Report heading, empty state “Run a mission to see execution and results here”, Cancel button, Retry button.

## 9. Summary

| Item | Result |
|------|--------|
| **Global i18n** | Yes – i18next + react-i18next in `i18n.js`, `I18nextProvider` in `main.jsx`, `cardbey.lang` in localStorage. |
| **Root cause of missing Vietnamese** | UI components do not call `t()`; all copy is hardcoded in English. |
| **Recommended approach** | Reuse existing i18n; add `missionConsole.*` (and execution) keys; wire Mission Console (and then auth, onboarding, draft, promotion) to `useTranslation()` and `t()`. |
| **Risks** | Low if only adding keys and replacing literals; no change to auth, mission execution, or publish flows. |
| **Minimal patch** | Add missionConsole (en+vi) to i18n.js; wire PlanProposalBlock and MissionProcessingSummary (and optionally ExecutionDrawer) to `t()`. |
