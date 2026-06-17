# Business Discovery Activation — Manual QA Report

**Date:** 2026-06-16  
**Scope:** Discovery Card activation/education UX on feed (`ArtifactCard`) and explore grid (`ExploreResultCard`)  
**Related doc:** [BUSINESS_INGESTION_V1.md](./BUSINESS_INGESTION_V1.md#business-discovery-activation-ux-v1)

## Environment

| Item | Value |
|------|--------|
| Surfaces | Public feed `/`, Explore discovery grid |
| Components | `DiscoveryClaimCta`, `DiscoveryBadgeButton`, `DiscoveryActivationSheet`, `DiscoveryActivationPopover` |
| Automated tests | `discoveryClaimEducation.test.ts`, `DiscoveryClaimCta.test.tsx` |

## QA checklist

| # | Check | Expected (current V1) | Result | Method |
|---|--------|------------------------|--------|--------|
| 1 | Desktop feed card CTA | First click opens activation sheet; confirm navigates to `/claim-business/{seedId}` | **PASS** | Component test + code trace (`ArtifactCard` → `navigateToClaim`) |
| 2 | Desktop info icon | N/A — removed in Activation V1; explanation is collapsible inside sheet | **N/A** | Code review — no `Info` icon in `DiscoveryClaimCta` |
| 3 | Desktop badge hover/focus | Tooltip with owner-facing copy | **PASS** | Code trace `DiscoveryBadgeButton` + `badge_info_opened` |
| 4 | Mobile CTA first tap | Opens activation sheet, no navigation | **PASS** | `DiscoveryClaimCta.test.tsx` |
| 5 | Mobile sheet confirm | *Activate Your Business Space* → `onClaim` → claim URL | **PASS** | `DiscoveryClaimCta.test.tsx` |
| 6 | Mobile badge tap | Badge bottom sheet + *Got it* | **PASS** | Code trace `DiscoveryBadgeButton` variant `badge` |
| 7 | Explore grid parity | Same `DiscoveryClaimCta` + `DiscoveryBadgeButton`, `surface: explore_grid` | **PASS** | `ExploreResultCard.tsx` |
| 8 | Analytics metadata | `seedId`, `surface`, `trigger`, `ctaVariant` on PIL events | **PASS** | Unit test + `trackDiscoveryEducation()` |
| 9 | No internal terminology in public UI | No seed/QA/ingestion/sourceType/verificationStatus in visible copy | **PASS** | Grep + `discoveryClaimEducation.test.ts` |

**Overall:** PASS (8/8 applicable checks; item 2 superseded by Activation V1 design)

## Behavioral notes (vs. earlier education-layer spec)

The activation experience **supersedes** the original education-layer checklist in these ways:

| Original expectation | Current V1 behavior |
|---------------------|---------------------|
| Separate info icon opens popover | No info icon; collapsible *Why is this business on Cardbey?* inside sheet |
| Desktop CTA navigates immediately | Desktop and mobile both defer navigation until sheet confirmation |
| CTA label *Claim your business* | *Activate Your Business Space* |
| *Continue Claim* button | *Activate Your Business Space* in sheet |
| `claim_cta_clicked` / `claim_cta_after_explanation` | `activation_cta_clicked` / `activation_cta_completed` |

## Manual browser steps (recommended)

Use a discovered card in the feed (artifact id prefix `discovered:`).

### Desktop

1. Open public feed with at least one discovered business card.
2. Hover CTA — preview popover shows benefits + lifecycle (`activation_panel_opened`).
3. Click CTA — sheet opens; URL unchanged.
4. Click *Activate Your Business Space* in sheet — navigates to `/claim-business/{seedId}` (`activation_cta_completed`).
5. Hover badge — tooltip appears (`badge_info_opened`).
6. Expand *Why is this business on Cardbey?* — `discovery_explanation_opened`.

### Mobile (or DevTools device mode, `(hover: none)`)

1. Tap CTA — sheet opens; no navigation (`activation_cta_clicked`).
2. Tap *Maybe later* — sheet dismisses.
3. Tap CTA again → *Activate Your Business Space* — navigates to claim page.
4. Long-press CTA (~0.5s) — sheet opens (`trigger: long_press`).
5. Tap badge — badge sheet with *Got it*.

### Analytics inspection

```js
JSON.parse(sessionStorage.getItem('cardbey.pil.events.v1') || '[]')
  .filter(e => /activation_|discovery_|badge_info/.test(e.type))
  .map(e => ({ type: e.type, ...e.metadata }))
```

Confirm each event includes `seedId`, `surface`, and `trigger` where applicable; `ctaVariant: activate_your_business_space`.

## Forbidden-term scan (public discovery module)

Scanned `src/components/discovery/**` and `src/lib/discovery/**` visible copy (`DISCOVERY_ACTIVATION_COPY`, badge label).

| Term | In public UI? |
|------|----------------|
| `seeded_claimable` | No |
| `verificationStatus` | No |
| `ingestion` | No (code comments only) |
| `sourceType` | No |
| `QA` | No |

`seedId` appears only in analytics metadata and support mailto prefill — not rendered in UI.

## Automated test command

```bash
cd apps/dashboard/cardbey-marketing-dashboard
npx vitest run src/lib/discovery/discoveryClaimEducation.test.ts src/components/discovery/DiscoveryClaimCta.test.tsx
```

## Sign-off

| Role | Status |
|------|--------|
| Documentation | Complete — `BUSINESS_INGESTION_V1.md` updated |
| Automated QA | 8 tests passing (5 lib + 3 component) |
| Manual browser QA | Steps documented; code-level verification PASS |
