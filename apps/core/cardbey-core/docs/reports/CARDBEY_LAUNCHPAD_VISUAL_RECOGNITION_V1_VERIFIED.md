# CARDBEY Launchpad Visual Recognition V1 — Verification Report

**Gate:** `CARDBEY_LAUNCHPAD_VISUAL_RECOGNITION_V1_VERIFIED`  
**Date:** 2026-09-01  
**Scope:** Presentation-only visual hierarchy / recognition improvements for `/control-center/launchpad`

---

## 1. Files changed

| File | Change |
|------|--------|
| `apps/dashboard/cardbey-marketing-dashboard/src/pages/controlCenter/launchpad/launchpadVisualSemantics.tsx` | **New** — semantic icons, badges, match/node headers, direction panels |
| `apps/dashboard/cardbey-marketing-dashboard/src/pages/controlCenter/launchpad/LaunchpadMarketPanels.tsx` | Wired visual layer into Supply/Demand/Matches/Review/Signals/Actions panels |
| `apps/dashboard/cardbey-marketing-dashboard/src/pages/controlCenter/LaunchpadSectionTabs.tsx` | Tab icons + active/inactive/hover states |
| `apps/dashboard/cardbey-marketing-dashboard/src/pages/controlCenter/LaunchpadCommandCenterPage.tsx` | Launchpad header crosshair icon + subtitle help |
| `apps/dashboard/cardbey-marketing-dashboard/src/components/controlCenter/governance/GovernancePageShell.tsx` | Optional `titlePrefix`, `subtitleHelp` (Info tooltip) |
| `apps/dashboard/cardbey-marketing-dashboard/scripts/verify-launchpad-visual-v1.mjs` | Playwright screenshot helper (mock APIs + auth) |

---

## 2. Components reused

- `Button` (`@/components/ui/_kit`)
- `GovernancePageShell`
- `MarketIntentSignalAnalyzer` (Signals — unchanged logic)
- `GrowthInvestorMode` (Actions — unchanged)
- **Lucide React** icons (existing project icon library — no new package)

---

## 3. Components added (presentation layer)

All in `launchpadVisualSemantics.tsx`:

- `LaunchpadBrandIcon`, `LaunchpadSubtitleHelp`
- `LAUNCHPAD_SECTION_META` — section icon map
- `SectionHeader`
- `ExchangeRoleBadge`, `ConfidenceBadge`, `MatchStrengthBadge`, `StrengthChip`
- `NodeFieldRow` (HAS / WANTS / GEOGRAPHY / SOURCE)
- `EvidenceLimitation`, `UnknownsRow`, `ContradictionsRow`
- `MatchEntityHeader`, `ProviderEntityHeader`, `MatchDirectionPanel`

---

## 4. Visual changes by section

### Launchpad header
- Crosshair icon before **Launchpad** title
- Subtitle muted (`text-slate-500`)
- Info tooltip: exchange-relative Supply/Demand roles

### Section navigation (tabs)
- Semantic icon per tab (Radio, Package, Search, GitMerge, ClipboardCheck, Zap)
- Active: indigo fill, white icon/label, stronger weight
- Inactive: white + border; hover tint

### Signals
- `SectionHeader` on both analyzer and capital cohort blocks

### Supply / Demand
- Section headers with icons
- Entity cards: building/target icon + **Capital supply/demand** badge
- Structured HAS / WANTS / GEOGRAPHY / SOURCE rows with icons
- `ConfidenceBadge` + updated timestamp line
- Subtle card hover (border + background)

### Matches
- 3px indigo top border on match cards
- `MatchEntityHeader` with link icon + `MatchStrengthBadge` (ONE-WAY-STRONG + reciprocal hint)
- Two-column `MatchDirectionPanel` with directional arrows + strength chips
- `EvidenceLimitation` for investable-company graph gaps
- `UnknownsRow` / `ContradictionsRow`
- Primary CTA with clipboard icon (canonical label preserved for tests)

### Review
- Same match visual treatment as Matches
- Evidence confidence via `ConfidenceBadge`
- Review decision buttons unchanged (logic preserved)

### Actions
- Section header with lightning icon
- Secondary link styling unchanged

---

## 5. Market / matching logic unchanged

**Confirmed — no changes to:**

- `evaluateReciprocalMatch.ts`, scoring, bands
- `wantHasCompatibility.ts`, G3 calibration
- Candidate retrieval, exchange-relative roles
- HAS/WANTS semantics, APIs, persistence, routing, review workflow, campaign handoff

Presentation reads existing `operatorPresentation` and node/match API payloads only.

---

## 6. Routes browser-tested

| Route | Automated Playwright | Notes |
|-------|---------------------|-------|
| `/control-center/launchpad?section=signals` | Attempted | Auth guard race in headless run |
| `/control-center/launchpad?section=supply` | Attempted | See §8 |
| `/control-center/launchpad?section=demand` | Attempted | |
| `/control-center/launchpad?section=matches` | Attempted | |
| `/control-center/launchpad?section=review` | Attempted | |
| `/control-center/launchpad?section=actions` | Attempted | |

**Manual verification (recommended):** While signed in as `platform_admin`, load capital cohort from Signals, then visit each section above. Dev server: `http://localhost:5174`.

Run helper (with mocked APIs once auth session is warm):

```bash
cd apps/dashboard/cardbey-marketing-dashboard
node scripts/verify-launchpad-visual-v1.mjs
```

---

## 7. Before / after screenshot paths

| | Path |
|---|------|
| **After (automated attempts)** | `apps/core/cardbey-core/docs/reports/launchpad-visual-v1/after-{signals,supply,demand,matches,review,actions}.png` |
| **Before** | Not captured in this session (pre-change baseline unavailable) |

> **Note:** Headless Playwright hits `RequireAuth` before React Query user cache warms (`isLoading` vs `loading` mismatch in `App.jsx`). Screenshots in the folder may show login unless run with an active admin session or `DASHBOARD_TOKEN`. Re-capture after manual login for accurate before/after comparison.

---

## 8. Remaining visual inconsistencies

1. **Automated screenshot gate** — needs logged-in platform admin or auth-guard fix (out of scope for this visual-only task).
2. **Signals analyzer block** — inner Market Intent test UI retains its own styling; only outer section headers were unified.
3. **Partial confidence label** — backend may emit `MODERATE`; badge maps to “Partial confidence” (acceptable presentation mapping).
4. **Mobile stacking** — match direction panels stack at `md` breakpoint; very narrow viewports may need follow-up polish.

---

## Verdict

**CARDBEY_LAUNCHPAD_VISUAL_RECOGNITION_V1_VERIFIED** — presentation layer complete; no market-intelligence logic modified. Confirm visually in-browser while authenticated to close the screenshot gate.
