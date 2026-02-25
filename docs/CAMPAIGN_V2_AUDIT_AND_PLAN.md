# Campaign V2 — Audit & Plan (TASK 0)

**Status:** Audit only — no code changes.  
**LOCKED RULE:** Risk assessment first; minimal, additive, feature-flagged implementation.

---

## 1. Existing flow files (identified)

### Promo creation

| File | Role |
|------|------|
| `src/features/promotions/createPromoFlow.ts` | `createPromoFromItemAndOpenEditor()` — canonical “create from item” → navigate to editor |
| `src/lib/promoHelpers.ts` | `createPromoDraftAndNavigate()` — create draft + navigate to `/app/creative-shell/edit/:id`; used by store-draft flow |
| `src/api/miPromo.ts` | `createPromoFromDraft()`, `createPromoDraft()`, `createPromoFromIdea()` — **uses `fetch(buildApiUrl(...))`** (not apiPOST); single place for MI promo API |
| `src/services/createSmartPromotion.ts` | Wraps createPromoFromDraft for Smart Object path |
| `src/services/createPromoAndGoToStudio.ts` | Create + navigate to studio |
| `src/services/createPromoDraftFromItem.ts` | Sets `cardbey.pendingPromo` handoff for editor |

### Smart Object / wizard

| File | Role |
|------|------|
| `src/features/storeDraft/review/SmartObjectPromoWizard.tsx` | Modal: source (store/product) → object type → create → navigate to `/app/creative-shell?contentId=...` |
| `src/features/storeDraft/review/MICommandBar.tsx` | Chip “Create Smart Object Promo” opens `SmartObjectPromoWizard` |
| `src/features/storeDraft/StoreDraftReview.tsx` | Renders `SmartObjectPromoWizard`; `handleCreatePromotion(productId)` uses `createPromoDraftAndNavigate` + `cardbey.pendingPromo` |

### MI Promotion Creator (editor)

| File | Role |
|------|------|
| `src/features/content-studio/pages/CreativeShell.tsx` | Router for `/app/creative-shell/*` |
| `src/features/content-studio/pages/ContentStudioEditor.tsx` | Scene-based editor; reads `instanceId` from route; applies `cardbey.pendingPromo` for product image/name/headline |
| `src/features/content-studio/layout/EditorShell.tsx` | Layout: top bar, optional topBanner (e.g. PromotionContextBanner, PromoWizardBanner) |
| `src/features/content-studio/store/templateStore.ts` | `getInstance` / `saveInstance` (localStorage) for editor instances |
| `src/lib/buildContentStudioUrl.ts` | Builds `/app/creative-shell/edit/:instanceId?source=...&productId=...&storeId=...` |

### Routes (App.jsx)

- `/app/creative-shell/*` → `CreativeShell` (RequireAuth)
- `/app/creative-shell/promo` → redirect to `/promotions/new`
- No `/campaigns` routes yet.

### API helpers

- `src/lib/api.ts`: `apiGET`, `apiPOST`, `request()` — **use these only**; no raw `fetch('/api/...')`.
- `src/api/miPromo.ts`: uses `buildApiUrl()` + `fetch()` — **existing**; Campaign must not add new relative `/api` calls; new endpoints via apiPOST/apiGET.

### Feature flags

- `src/lib/featureFlags.ts`: `initFeatureFlags()`, `isFeatureEnabled(flag)`; flags from `GET /api/v2/flags`.
- No `FLAG_CAMPAIGNS_V2` yet. Plan: **backend can add it**; frontend **fallback**: `isFeatureEnabled('FLAG_CAMPAIGNS_V2') || import.meta.env.VITE_FLAG_CAMPAIGNS_V2 === '1'` so dev can enable without backend.

### Guest / login restore

- `cardbey.pendingPromo` (editor handoff), `cardbey.pendingPromoAfterLogin` (LoginPage resume).
- LoginPage.tsx: after login, reads pendingPromoAfterLogin and calls `createPromoFromItemAndOpenEditor` or similar to resume.

---

## 2. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| **Breaking store creation** | Campaign entry and routes are additive. No change to store onboarding or draft creation unless FLAG_CAMPAIGNS_V2 is on. |
| **Breaking MI Promotion Creator** | Do not replace or rewrite ContentStudioEditor. Campaign Studio “Creative” tab **embeds or navigates to** existing editor (iframe or route with same component + prefill). No changes inside ContentStudioEditor except optional “campaign context” props when opened from Campaign. |
| **Breaking Smart Object Promo flow** | When FLAG_CAMPAIGNS_V2=off, product card and MICommandBar unchanged. When on, product card can show “Create Campaign” in addition to or instead of “Create Promotion” (configurable); SmartObjectPromoWizard still used from MI Command Bar for non-Campaign path. |
| **Guest → login restore** | Campaign draft persisted in localStorage (e.g. `cardbey.campaignDraft.*`). If we add “resume campaign” after login, use same pattern as pendingPromoAfterLogin; do not change existing promo restore. |
| **State handoff (product → Campaign → Editor)** | Reuse `cardbey.pendingPromo` for Creative tab when opening editor from Campaign; Campaign stores `creativeProjectId` (editor instance id) when user saves from Creative tab. |
| **API base URL / relative calls** | All new requests via `apiGET`/`apiPOST` (from `@/lib/api`). No `fetch('/api/...')` or `axios.get('/api/...')`. New backend endpoints called as `apiPOST('/campaigns', body)` etc. |
| **Backend contract** | Prefer new endpoints (e.g. `POST /api/campaigns`, `GET /api/campaigns/:id`) without changing existing `/api/mi/promo/*` contracts. If backend not ready, Campaign stays “local” (localStorage only) and Publish marks “Published (local)”. |

---

## 3. Proposed file / module structure (Campaign V2)

```
src/
  features/
    campaigns/
      store/
        campaignStore.ts          # Zustand: campaign draft state + persistence (localStorage)
      types/
        campaign.ts               # Campaign, Deployment, BehaviorPreset types
      components/
        CampaignContextBanner.tsx # "Creating Campaign for: [source]" + Change Source
        BehaviorPresetCard.tsx    # Single preset (open_product, add_to_cart, …)
        DeploymentChannelCard.tsx # Social | Store | QR | C-NET card
      pages/
        CampaignNewPage.tsx      # /campaigns/new — wizard (source summary + objective) → create → redirect to Studio
        CampaignStudioPage.tsx   # /campaigns/:id/studio — shell with tabs
        CampaignListPage.tsx     # /campaigns — list (optional, can be stub)
      tabs/
        CampaignCreativeTab.tsx  # Embeds or links to MI Promotion Creator; passes source for auto-fill
        CampaignBehaviorTab.tsx   # Preset grid + computed destination URL
        CampaignDeployTab.tsx     # Channel cards (Social, Store, QR, C-NET)
      lib/
        campaignPersistence.ts   # load/save campaign draft to localStorage (key: cardbey.campaignDraft.*)
        behaviorPresets.ts       # presetId → label, default config, URL builder stub
  routes/
    paths.ts                     # Add campaignStudio(id), campaignNew(), campaignList()
  lib/
    featureFlags.ts              # No change; use isFeatureEnabled('FLAG_CAMPAIGNS_V2') + env fallback
```

**Routes to add (feature-flagged):**

- `GET /campaigns/new?source=product:productId` or `source=store:storeId` — wizard, then redirect to `/campaigns/:id/studio`
- `GET /campaigns/:id/studio` — Studio shell (Creative | Behavior | Deploy)
- Optional: `GET /campaigns` — list (stub OK)

**Integration points (no changes when flag off):**

- **Product card:** In `ProductReviewCard` or `StoreDraftReview`, **only when** `isFeatureEnabled('FLAG_CAMPAIGNS_V2')` (or env), show “✨ Create Campaign” and navigate to `/campaigns/new?source=product:${productId}&storeId=...`. Existing “Create Promotion” remains.
- **Creative tab:** Campaign Studio loads ContentStudioEditor in a route or iframe; URL or state includes `productId`/`storeId` so existing `cardbey.pendingPromo` or equivalent can be set before opening editor; or we pass prefill via search params and let editor read them.

---

## 4. Task order and touch points (summary)

| Task | Touch points (files to add/modify) |
|------|-------------------------------------|
| **1 — Data model** | `features/campaigns/types/campaign.ts`, `features/campaigns/store/campaignStore.ts`, `features/campaigns/lib/campaignPersistence.ts` |
| **2 — Entry points** | `ProductReviewCard` or `StoreDraftReview` (conditional button), `paths.ts` |
| **3 — Wizard** | `CampaignNewPage.tsx`, App.jsx routes |
| **4 — Studio shell** | `CampaignStudioPage.tsx`, `CampaignContextBanner.tsx`, App.jsx |
| **5 — Creative tab** | `CampaignCreativeTab.tsx` (reuse editor route or embed), prefill from source |
| **6 — Behavior tab** | `CampaignBehaviorTab.tsx`, `behaviorPresets.ts`, `BehaviorPresetCard.tsx` |
| **7 — Deploy tab** | `CampaignDeployTab.tsx`, `DeploymentChannelCard.tsx` |
| **8 — Publish** | Validation in store or Studio; optional `apiPOST('/campaigns', …)` when backend ready |
| **9 — QA** | Manual / regression checklist; no new relative /api; dev overlay unchanged |

---

## 5. Feature flag usage

- **FLAG_CAMPAIGNS_V2** (default off):
  - **Off:** No “Create Campaign” button; no `/campaigns` routes (or they 404). Existing promo and Smart Object flows unchanged.
  - **On:** “Create Campaign” on product card; `/campaigns/new` and `/campaigns/:id/studio` active; Campaign Studio uses existing MI Promotion Creator for Creative tab.
- **Fallback for dev:** `VITE_FLAG_CAMPAIGNS_V2=1` in env or `.env` so flag works before backend returns it from `/api/v2/flags`.

---

*End of TASK 0. Proceed to TASK 1 (data model) when approved.*

---

## 6. TASK 9 — Regression tests / QA notes

**When FLAG_CAMPAIGNS_V2 is OFF (default):**
- [ ] Store creation flow unchanged (no new buttons or routes visible).
- [ ] MI Promotion Creator: Create Promotion from product card still works (existing flow).
- [ ] Smart Object Promo: MI Command Bar “Create Smart Object Promo” and SmartObjectPromoWizard unchanged.
- [ ] Guest → login restore: pendingPromo and promo creation resume unchanged.
- [ ] No relative `/api` calls: all requests use apiGET/apiPOST/buildApiUrl (dev overlay unchanged).

**When FLAG_CAMPAIGNS_V2 is ON (or VITE_FLAG_CAMPAIGNS_V2=1):**
- [ ] Product card shows “✨ Create Campaign” in addition to Create Promotion.
- [ ] Clicking “Create Campaign” creates a draft and navigates to `/campaigns/:id/studio`.
- [ ] `/campaigns/new?source=product:ID&storeId=...` shows wizard; Continue creates draft and goes to Studio.
- [ ] Studio: Back, Name, Status, Save, Publish; Source banner; tabs Creative | Behavior | Deploy.
- [ ] Creative tab: “Design creative” opens MI Promotion Creator with product context; creativeProjectId saved.
- [ ] Behavior tab: preset selection and computed destination URL.
- [ ] Deploy tab: Add Social / Store / QR / C-NET; QR shows target URL + Copy.
- [ ] Publish: validation (creative + behavior + ≥1 deployment); status becomes “Published (local)”.

**iOS Safari / LAN:**
- [ ] No relative `/api` errors on LAN (all API via apiGET/apiPOST with buildApiUrl).
- [ ] Campaign wizard and Studio work on mobile (touch-friendly, no desktop-only APIs).
