# Acquisition UI Reorganisation — Report (V1 corrective slice)

**Date:** 2026-09-12  
**Impact report:** `docs/IMPACT_REPORT_ACQUISITION_UI_REORGANISATION.md`  
**Verdict:** `ACQUISITION_UI_REORGANISATION_PARTIAL`

Not declared: `RICH_MEDIA_ACQUISITION_V1_PASS` (program gate).

---

## 1. Audit (existing)

| Surface | Was | Role |
|---------|-----|------|
| `/admin/discovery` | Rich Media Acquisition + business crawler under Sources | Mixed |
| `/control-center/content-acquisition` | “Content Acquisition” | Library population pipeline ops |
| Sidebar Tools “Discovery Agent” | → `/admin/discovery` | Ambiguous |
| Sidebar Governance “Content Acquisition” | → content-acquisition | Population ops |
| CC quick access “Content Discovery” | → `/admin/discovery` | Ambiguous |

APIs unchanged: `/api/discovery/*`, `/api/media-acquisition/*`, universal-library population admin.

---

## 2. Navigation changes

**Show (Governance / platform admin):**

- Business Acquisition → `/control-center/business-acquisition`
- Rich Media Acquisition → `/control-center/rich-media-acquisition`
- Library Population Operations → `/control-center/content-acquisition` (URL preserved)

**Removed:**

- Tools → Discovery Agent (`tools-discovery-agent`)
- Quick access → Content Discovery (replaced by the three named links)

**Relabeled CTAs:** Control Center header, Phase C, attention items, agent orb → Business Acquisition.

---

## 3. Route / redirect mapping

| URL | Resolves to |
|-----|-------------|
| `/control-center/business-acquisition` | Business Acquisition (Discovery Crawler) |
| `/control-center/rich-media-acquisition` | Rich Media Acquisition |
| `/control-center/content-acquisition` | Library Population Operations (same page, new title) |
| `/admin/discovery` | Redirect → `/control-center/rich-media-acquisition` (after platform-admin auth) |
| `CONTROL_CENTER_ROUTES.discoveryAgent` | Alias → business-acquisition (legacy callers) |
| DEV only | `/__dev/business-acquisition`, `/__dev/rich-media-acquisition`, `/__dev/library-population-ops` |

---

## 4. Components reused

- `DiscoveryControlPanel` (crawler; `hideChromeTitle` on Business Acquisition page)
- `DiscoveryAdminPage` (RMA; media tabs only)
- `ContentAcquisitionPage` (renamed UI; same population APIs)
- `Page` shell for Business + RMA titles

---

## 5. Files changed

- `src/pages/controlCenter/BusinessAcquisitionPage.tsx` (new)
- `src/pages/DiscoveryAdminPage.tsx`
- `src/pages/controlCenter/ContentAcquisitionPage.tsx`
- `src/components/admin/DiscoveryControlPanel.tsx`
- `src/App.jsx`
- `src/navigation/canonicalNavBuilders.ts`
- `src/components/controlCenter/controlCenterRoutes.ts`
- `src/i18n.js`
- `src/components/controlCenter/CardbeyControlCenter.tsx`
- `src/components/controlCenter/ControlCenterPhaseC.tsx`
- `src/components/controlCenter/buildAttentionItems.ts`
- `src/components/controlCenter/buildEcosystemFlow.ts`
- `src/components/controlCenter/living/buildAgentOrbStatus.ts`
- `src/components/controlCenter/CcDiscoveryIngestionPrimaryPanel.tsx`
- `src/pages/AdminPage.jsx`
- Tests: `CcDiscoveryIngestionPrimaryPanel.test.tsx`, `CardbeyControlCenter.test.tsx`, `accountMenuVariant.test.ts`, `controlCenterIntelligence.test.ts`
- `docs/IMPACT_REPORT_ACQUISITION_UI_REORGANISATION.md`

---

## 6. Backend behavior preserved

- Discovery crawler enable/pause/disable/run-now, seeds, settings, history → same `discoveryAdminApi`
- RMA search/review/acquire/library/sources → same `mediaAcquisitionApi`
- Population pipeline/jobs/federation → same `universalLibraryApi` / contentEngine
- No new SSOT, no migrations, no V2

---

## 7. Browser evidence

| Destination | Screenshot |
|-------------|------------|
| Business Acquisition | `apps/dashboard/.tmp/acq-biz.png` (+ mobile) |
| Rich Media Acquisition | `apps/dashboard/.tmp/acq-rma.png`, `acq-rma-sources.png` |
| Library Population Operations | `apps/dashboard/.tmp/acq-libpop.png` |
| JSON | `apps/dashboard/.tmp/acq-reorg-evidence.json` |

Proven: single titles, Discovery Crawler controls, RMA four tabs without crawler, Populate Library + pipeline tabs.

---

## 8. Console / network

On successful evidence run: **no pageErrors**, **no consoleErrors**, **no failedRequests** for the three DEV mounts. Legacy `/admin/discovery` unauthenticated → login (`returnTo=/admin/discovery`); after auth redirects to RMA.

---

## 9. Test results

- Browser evidence script: **pass** (`UI_EVIDENCE_OK`)
- Vitest jsdom suite: **blocked** by known dual-React (monorepo react vs cardbey-kimi-integration react-dom) — not introduced by this slice

---

## 10. Remaining defects

1. **Authenticated Control Center sidebar** not screenshotted — Governance trio only visible to platform admin; evidence used DEV mounts.
2. **Acceptance #11** (RMA acquire → Universal Library read-back vs population ops) **not executed** — out of UI-only reorg / needs keyed providers + admin session.
3. Some CC copy/tests still use internal field name `discoveryAgent` (metrics type) — route alias updated; deeper rename deferred.
4. DEV-only proof routes remain under `import.meta.env.DEV`.

---

## Allowed verdict

**ACQUISITION_UI_REORGANISATION_PARTIAL**
