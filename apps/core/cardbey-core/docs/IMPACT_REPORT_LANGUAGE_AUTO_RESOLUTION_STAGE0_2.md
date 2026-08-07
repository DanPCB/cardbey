# Impact Report — Language Auto Resolution Stage 0–2

**Date:** 2026-08-06  
**Milestone:** `SHADOW_AND_GUEST_RESOLUTION_READY` (after tests pass)  
**Depends on:** Language Intelligence Phases 1–5A  
**Authority:** `isLanguageIntelligenceAuthoritative() === false`  
**Surfaces wired:** `[]` (unchanged)

---

## VERDICT

**SHADOW_AND_GUEST_RESOLUTION_READY** — foundation for auto resolution, safe resolve API, and guest cookie persistence. No UI or storefront cutover.

---

## CURRENT_STATE

- LI `resolveLanguage`: explicit → account → browser → device → region → en  
- Dashboard chrome: i18next + `cardbey.lang` (en/vi) — separate  
- Guest cookie: none  
- Public resolve envelope: none  
- Audit: `AUDIT_LANGUAGE_AUTO_DETECTION_DISPLAY_SWITCH_V1.md`

---

## IMPLEMENTED_SCOPE

| Stage | Deliverable |
|-------|-------------|
| 0 | `autoLanguageResolver`, `localeNormalizer`, reason codes, shadow diagnostics/telemetry |
| 1 | `GET /api/language-intelligence/resolve` (safe public envelope) |
| 2 | Guest cookie `cardbey_language` + set/reset operations |

---

## NOT_IMPLEMENTED

- Dashboard i18next bridge  
- Public storefront cutover  
- Localized routes / hreflang  
- IP / timezone / GPS / interaction inference  
- `editArtifact` overwrite fix (documented risk only)  
- Migrating `cardbey.lang` into account prefs  
- Making LI authoritative  

---

## RESOLVER_PRECEDENCE

### Anonymous

```text
explicit session (?lang / body)
  → guest cookie (manual)
  → Accept-Language (weighted)
  → device/browser candidates
  → regional default
  → English
```

### Signed-in

```text
manual account preference (manualLanguageSelection)
  → explicit session override
  → guest cookie ONLY if account has no manual preference
  → Accept-Language
  → device/browser candidates
  → regional default
  → English
```

**Conflict policy:** Stale guest cookie never overrides an existing manual account preference.

---

## LOCALE_NORMALIZATION

Order: exact supported locale → base language → configured regional variant (region registry) → fail (null, fall through chain).  
Normalize case / `_` → `-`. Never invent unsupported codes.

---

## COOKIE_POLICY

| Property | Value |
|----------|-------|
| Name | `cardbey_language` |
| SameSite | Lax |
| Path | `/` |
| Secure | production only |
| Value | normalized supported language code only |
| Expiry | ~180 days |
| Forbidden | IP, history, identity, behavioral data |

---

## API_CONTRACT

### `GET /api/language-intelligence/resolve`

Public safe envelope (auth optional):

```ts
{
  ok: true,
  displayLanguage, interfaceLanguage, regionalLocale,
  source, confidence, reasonCode, mode // 'automatic' | 'manual'
}
```

Query: `lang` / `language` for explicit session override.  
No raw headers, IP, account internals, or full diagnostics in public body.  
Admin/dev may get `diagnostics` only when `languageDebug=1` and non-production.

### Guest ops (flag-gated)

- `PUT /api/language-intelligence/guest-language` `{ language }`  
- `DELETE /api/language-intelligence/guest-language` — reset to automatic  

---

## AUTHENTICATED_VS_GUEST_CONFLICT_POLICY

| Actor | Winner |
|-------|--------|
| Signed-in + manual account pref | Account; ignore guest cookie |
| Signed-in + no manual pref | Explicit session → guest cookie → auto |
| Anonymous | Explicit session → guest cookie → auto |

---

## FEATURE_FLAGS (fail closed)

| Flag | Default (unset) | Behavior when on |
|------|-----------------|------------------|
| `ENABLE_LANGUAGE_AUTO_RESOLUTION_V1` | off in prod | Shadow resolve + diagnostics |
| `ENABLE_LANGUAGE_RESOLVE_API_V1` | off in prod | Resolve API available |
| `ENABLE_LANGUAGE_VISITOR_PREFERENCE_V1` | off in prod | Guest cookie set/read/reset |

Requires parent LI engine chain where applicable. All off → current behaviour unchanged.

---

## SHADOW_MODE_BEHAVIOR

When auto resolution is on but storefront/dashboard cutover flags are off (always in this stage):

- Compute unified resolution  
- Emit shadow telemetry  
- Expose via resolve API when API flag on  
- **Do not** change i18next output or public store DTO language  

---

## TELEMETRY

In-memory + console (dev): `language.resolution.completed` with  
`context`, `selectedLanguage`, `source`, `confidence`, `usedFallback`, `authenticated` — no raw IP/text.

---

## PRIVACY_BOUNDARIES

- No IP/timezone/GPS  
- Cookie = locale code only  
- Public envelope redacted  
- No promotion of guest → account  

---

## KNOWN_RISKS

| Risk | Mitigation |
|------|------------|
| `editArtifact` translate overwrite | Documented; out of scope |
| Interface language ≠ display for non en/vi | interfaceLanguage falls back to `en` when not in UI set |
| Cookie blocked by browser | Resolve still works via Accept-Language |

---

## ROLLBACK

Set all three flags `false`. Delete new modules if needed — no schema migration; no surface depends on them for render.

---

## NEXT_STAGE

1. ~~Bridge dashboard i18next ↔ account preference~~ → see `IMPACT_REPORT_LANGUAGE_DASHBOARD_PREF_BRIDGE_STAGE3.md`  
2. Storefront opt-in cutover via consumption facade  
3. Context-scoped preferences  

---

## TEST_RESULTS

Command (from `apps/core/cardbey-core`):

```text
node node_modules/vitest/vitest.mjs run \
  src/lib/languageIntelligence/__tests__/languageIntelligencePhase1.test.js \
  src/lib/languageIntelligence/__tests__/languageIntelligencePhase2.test.js \
  src/lib/languageIntelligence/__tests__/languageIntelligencePhase3.test.js \
  src/lib/languageIntelligence/__tests__/languageIntelligencePhase4.test.js \
  src/lib/languageIntelligence/__tests__/languageIntelligencePhase5a.test.js \
  src/lib/languageIntelligence/__tests__/languageAutoResolutionStage02.test.js
```

| Suite | Result |
|-------|--------|
| Phase 1 | 21 passed |
| Phase 2 | 8 passed |
| Phase 3 | 7 passed |
| Phase 4 | 9 passed |
| Phase 5A | 9 passed |
| Stage 0–2 | 33 passed |
| **Total** | **87 passed** |

Stage 0–2 coverage includes: locale normalization, resolver precedence (explicit / guest / manual account / browser / regional / global), guest cookie policy, fail-closed flags, resolve API public envelope, guest set/reset idempotency.

## REGRESSION_STATUS

| Area | Status |
|------|--------|
| Existing `resolveLanguage` / Phase 1–5A tests | Passing |
| Dashboard i18next | Unchanged (not bridged) |
| Storefront canonical rendering | Unchanged (no cutover) |
| Translation Engine | Unchanged (Phase 2 tests passing) |
| `authoritative` / `surfacesWired` | Still `false` / `[]` |
