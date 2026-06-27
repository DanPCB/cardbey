# Vietnamese Language Audit Report

**Date:** 2026-06-19  
**Scope:** `apps/dashboard/cardbey-marketing-dashboard`  
**Locale storage:** `localStorage` key `cardbey.lang` (`en` | `vi`)

## Architecture

| Layer | Location |
|-------|----------|
| Core resources | `src/i18n.js` (~9k lines, `translation` + `dashboard` + `features` + `booking`) |
| Modular merges | `src/i18n/*.js` (components, explore, activation/discovery) |
| Hook | `src/hooks/useI18n.js`, `react-i18next` |
| Contract tests | `src/test/i18nContract.test.ts`, `*.i18n.test.tsx` |

## Pages Audited

| Page | Status | Notes |
|------|--------|-------|
| Homepage / Explore | Partial | Explore capabilities vi fixed; some landing strings remain in English modules |
| Pricing / About | OK | Keys exist in `i18n.js` |
| Control Center | OK | Sidebar/control labels translated |
| Performer Console | OK | Contract-tested console keys |
| Store Creation | OK | Business Builder vi block present |
| **Activation Runway** | **Fixed** | Wired to `activation.*` keys |
| **Business Discovery** | **Fixed** | Wired to `discovery.*` keys |
| Devices | **Fixed** | Table chrome + toasts use `devices.*` |
| Suitcase / Account | Partial | Sidebar label fixed; some admin labels remain |
| Login / Signup | OK | Auth contract tests pass |
| Dashboard Home | OK | `dashboard.home.*` vi present |

## Fixes Applied (this pass)

1. **New module** `src/i18n/activationDiscoveryResources.js` — 80+ activation + discovery keys (en/vi)
2. **Activation runway** — `ActivateBusinessPage.tsx`, `ActivationExperienceSections.tsx` use `useTranslation()`
3. **Business discovery** — `BusinessDiscoveryPage.tsx` fully wired
4. **Vi copy corrections** — nav, sidebar, MI panel, explore capability titles
5. **Device toasts** — hardcoded English toasts → `devices.toast.*`
6. **Tests** — `activationDiscovery.i18n.test.tsx`, extended `i18nContract.test.ts`

## Remaining Gaps (follow-up)

| Area | Issue | Priority |
|------|-------|----------|
| Console section subtitles | Creatives/Insights/Devices section pages | Medium |
| Homepage | `"Discover"`, slideshow aria-labels | Medium |
| `mapGenerateStoreError.ts` | English error strings from API layer | Low |
| CI baseline | ~1,213 allowed hardcoded strings in `i18n-ci-baseline.json` | Low (incremental) |
| Product names | Performer, Cardbey, C-Net kept as brand terms by design | N/A |

## Vietnamese Guidelines

- **Terminology:** Store → *Cửa hàng*, Device → *Thiết bị*, Campaign → *Chiến dịch*
- **Brand terms:** Keep *Cardbey*, *Performer*, *C-Net* untranslated; translate surrounding words
- **Dates:** Use `vi-VN` locale (`toLocaleDateString('vi-VN')`)
- **Currency:** `Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })`

## Verification

```bash
cd apps/dashboard/cardbey-marketing-dashboard
npm test -- --run i18n
npm test -- --run activationDiscovery
npm test -- --run i18nContract
```

## Success Criteria

- [x] Activation + discovery pages display Vietnamese in vi mode
- [x] Nav/sidebar mixed English reduced
- [x] Device toasts translated
- [x] Contract tests for new keys
- [ ] Full zero-hardcoded-English pass (requires incremental CI baseline reduction)
