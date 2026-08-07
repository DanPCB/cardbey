# Vietnamese Language Audit Report

**Date:** 2026-08-01 (updated)  
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
| Homepage / Explore | **Fixed** | Hero chrome + primary mission chip labels |
| Pricing / About | OK | Keys exist in `i18n.js` |
| Control Center | OK | Sidebar/control labels translated |
| Performer Console | **Fixed** | Home idle chips/hints localized; intents stay EN |
| Console sections | **Fixed** | Creatives / Insights / Devices section copy |
| Store Creation | OK | Business Builder vi block present |
| Activation Runway | **Fixed** | Wired to `activation.*` keys |
| Business Discovery | **Fixed** | Wired to `discovery.*` keys |
| Devices table | **Fixed** | Table chrome + toasts use `devices.*` |
| Pair Device modal (dashboard-init) | **Fixed** | `devices.modal.*` |
| Screens Pair Device modal | **Fixed** | `screens.pairModal.*` |
| Pair Alert popup | **Fixed** | `devices.pairAlert.*` |
| Screens page | **Fixed** | `signage.page.*` |
| **ScreenCard** | **Fixed** | Card actions/status (`signage.card.*`) |
| Feed rail / engagement | **Fixed** | `feedRail.*` + known CTA remap (`frontscreen.*`) |
| Store preview / mini-website CTAs | **Fixed** | `websiteChrome.*` + display remap |
| Suitcase vault | **Fixed** | `dashboard:suitcase.vault.*` |
| Account profile | **Fixed** | `dashboard:account.*` |
| Login / Signup | OK | Auth contract tests pass |
| Dashboard Home | OK | `dashboard.home.*` vi present |

## Remaining Gaps (follow-up)

| Area | Issue | Priority |
|------|-------|----------|
| Account country names | Country labels may remain EN | Low |
| `mapGenerateStoreError.ts` | English error strings from API layer | Low |
| Store preview chrome extras | Live/Draft badges, dismiss, breadcrumb still EN | Low |
| CI baseline | ~1,213 allowed hardcoded strings in `i18n-ci-baseline.json` | Low (incremental) |
| Product names | Performer, Cardbey, C-Net kept as brand terms | N/A |

## Next

**Store preview chrome extras** — Live/Draft badges, dismiss, breadcrumb labels (optional polish).

## Verification

```bash
cd apps/dashboard/cardbey-marketing-dashboard
npm test -- --run miniWebsiteNav.i18n
```
