# CARDBEY_LAUNCHPAD_MARKET_INTENT_INVESTOR_ACTION_CONVERGENCE

**Verdict:** `CARDBEY_LAUNCHPAD_MARKET_INTENT_INVESTOR_ACTION_CONVERGENCE_READY`  
**Date:** 2026-09-01

## Root cause

Launchpad was mounted on `/control-center/growth` and absorbed the entire Growth Command Center page. That caused:

1. **Market Intent test UI** to be demoted to a secondary link instead of canonical Signals entry.
2. **Launchpad Actions** to default to the generic business acquisition funnel (`Leads → Qualified → Discovery…`) instead of investor-mode workflows.
3. **Legacy `/market-intent/test`** (and bare `/market-intent/test`) to fall through or land on the wrong shell.

## Correction (surface + routing only)

| Surface | Route | Content |
|---------|-------|---------|
| **Executive Overview** | `/marketing` | Market Opportunities summary + platform briefing |
| **Launchpad** | `/control-center/launchpad` | Signals · Supply · Demand · Matches · Review · Actions (investor) |
| **Growth Center** | `/control-center/growth` | Business acquisition CRM (unchanged workflow) |

## Reused components (no engine changes)

| Capability | Reused from |
|------------|-------------|
| G1→G4 business signal analysis | `MarketIntentSignalAnalyzer` (extracted from `MarketIntentTestPage`) + `marketIntentTestApi` + `MarketIntentResultPanels` |
| Capital cohort load | `admitCapitalCohort` in Launchpad Signals |
| Investor actions | `GrowthInvestorMode` in Launchpad Actions only |
| Business acquisition | `GrowthCommandCenterPage` (restored, no Launchpad tabs) |

## Legacy routes

| Route | Behavior |
|-------|----------|
| `/control-center/market-intent/test` | Redirects → `/control-center/launchpad?section=signals` |
| `/market-intent/test` | Redirects → `/control-center/launchpad?section=signals` |
| `/control-center/growth?section=signals\|supply\|…` | Redirects → Launchpad equivalent |
| `/control-center/growth?mode=investors` | Redirects → `/control-center/launchpad?section=actions` |

## Acceptance mapping

| Test | Status |
|------|--------|
| A. Business signal in Launchpad Signals (G1–G4) | PASS — `MarketIntentSignalAnalyzer` embedded |
| B. Business signals not capital-only | PASS — separate “Analyze market signal” vs “Capital pilot” |
| C. Capital pilot regression | PASS — cohort loader unchanged |
| D. Launchpad Actions = investor mode | PASS — `GrowthInvestorMode` only, no business funnel |
| E. Growth Center business workflow | PASS — `/control-center/growth` restored |
| F. Legacy route not dead | PASS — redirects to Launchpad Signals |

## Locked (unchanged)

G1–G4 logic, matcher, candidate retrieval, review truth model, bands.

## Files changed

- `LaunchpadCommandCenterPage.tsx` (new)
- `MarketIntentSignalAnalyzer.tsx` (new, extracted)
- `MarketIntentTestPage.tsx` → redirect
- `GrowthCommandCenterPage.tsx` → Growth-only + Launchpad redirects
- `LaunchpadMarketPanels.tsx` → Signals embeds analyzer
- `App.jsx`, `controlCenterRoutes.ts`, `canonicalNavBuilders.ts`, `i18n.js`
- `marketOpportunitiesExecutiveProjection.ts` — launchpad path
- Tests: `MarketIntentSignalAnalyzer.test.tsx`, `MarketIntentTestPage.test.tsx`

## Operator navigation

Sidebar **Launchpad** → `/control-center/launchpad`  
Sidebar **Growth Center** → `/control-center/growth`
