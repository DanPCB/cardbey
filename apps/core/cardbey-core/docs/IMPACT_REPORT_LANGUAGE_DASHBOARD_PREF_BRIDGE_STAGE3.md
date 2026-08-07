# Impact Report — Language Dashboard Preference Bridge (Stage 3)

**Date:** 2026-08-06  
**Depends on:** Language Intelligence Phases 1–5A + Auto Resolution Stage 0–2  
**Authority:** `isLanguageIntelligenceAuthoritative() === false`  
**Surfaces wired for content:** `[]` (unchanged)  
**Chrome bridge:** opt-in only (`dashboard_chrome` sync, not content cutover)

---

## VERDICT

**DASHBOARD_PREF_BRIDGE_READY** — manual chrome ↔ account preference bridge behind fail-closed flags. No storefront cutover; LI remains non-authoritative.

---

## (1) What could break

| Risk | Severity |
|------|----------|
| Signed-in users see chrome language change after login when account has manual pref | Medium (intended when flag on) |
| Toggle fails or doubles if PATCH prefs errors / loops | Low |
| localStorage and account diverge if bridge off or API 503 | Low (current behavior) |
| Accidental silent migration of browser-detect → account | High if implemented wrong — **must not** |

---

## (2) Why

Dashboard chrome today is i18next + `cardbey.lang` only. Account prefs exist via  
`GET|PATCH /api/language-intelligence/preferences` but are not wired. Stage 3 adds a **manual** bridge so explicit toggles persist to the account and manual account prefs apply to chrome on login.

---

## (3) Impact scope

| Area | Effect |
|------|--------|
| Dashboard LanguageToggle / AccountLanguageMenuItems | May PATCH prefs when signed in + flag on |
| Login / `checkAuthStatus` success | May pull manual account pref → i18next |
| Public storefront content | **None** |
| Guest / anonymous | **None** (no account PATCH; guest cookie unchanged) |
| Stage 0–2 resolve API / shadow | **None** |
| Translation Engine / canonical content | **None** |

---

## (4) Smallest safe patch

1. Fail-closed flags:  
   - Core `ENABLE_LANGUAGE_DASHBOARD_PREF_BRIDGE_V1` (diagnostics / features snapshot)  
   - Dashboard `VITE_ENABLE_LANGUAGE_DASHBOARD_PREF_BRIDGE_V1` (client gate; prod off when unset)
2. Client helpers: `preferencesClient` + `dashboardPrefBridge`  
   - **Push:** only on user-initiated `setLanguage` when authenticated  
   - **Pull:** only when account `manualLanguageSelection` + preferredLanguage in `{en,vi}`  
   - **Never** PATCH from `detectInitialLanguage` / browser detect  
   - **Never** silent promote `cardbey.lang` → account without toggle
3. Keep `authoritative: false`; do not cut over storefront; do not change guest cookie semantics.

---

## CONFLICT_POLICY

| Situation | Rule |
|-----------|------|
| Signed-in + manual account pref on login | Account → chrome (en\|vi only) |
| User toggles language while signed in | Chrome update + PATCH account (manual) |
| Anonymous toggle | localStorage only (unchanged) |
| Stale localStorage vs manual account | Account wins on pull when bridge on |
| Soft/non-manual account preferredLanguage | Do not force chrome overwrite on login |

---

## FEATURE_FLAGS

| Flag | Default unset | Role |
|------|---------------|------|
| `ENABLE_LANGUAGE_DASHBOARD_PREF_BRIDGE_V1` | off (fail closed) | Core diagnostics / snapshot |
| `VITE_ENABLE_LANGUAGE_DASHBOARD_PREF_BRIDGE_V1` | off in prod/staging builds | Dashboard push/pull |

Requires prefs API available (`ENABLE_LANGUAGE_INTELLIGENCE_PREFERENCES_V1`). Bridge client treats 503 as no-op.

---

## NOT_IMPLEMENTED

- Storefront opt-in cutover  
- Guest cookie from dashboard toggle  
- Silent localStorage → account migration / consent UI  
- Making LI authoritative  
- Expanding chrome beyond en\|vi  
- IP / timezone / GPS inference  
- `editArtifact` overwrite fix  

---

## ROLLBACK

Set both bridge flags false / omit Vite flag and rebuild. No schema migration.

---

## NEXT_STAGE

Storefront opt-in cutover via consumption facade (separate impact report).

---

## TEST_RESULTS

| Suite | Result |
|-------|--------|
| Core Phase 1–5A + Stage 0–2 + Stage 3 | **90 passed** |
| Dashboard `dashboardPrefBridge.test.ts` | **6 passed** |

## REGRESSION_STATUS

| Area | Status |
|------|--------|
| LI Phases 1–5A / Stage 0–2 | Passing |
| Storefront content cutover | Not started |
| `authoritative` | Still `false` |
| Consumption `surfacesWired` | Still `[]` |
| Silent localStorage → account | Not implemented (by design) |
