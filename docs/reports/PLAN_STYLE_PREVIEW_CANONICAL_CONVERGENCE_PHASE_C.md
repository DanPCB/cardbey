# PLAN — Style & Preview Canonical Convergence (Phase C)

**Authorization:** `ACK STYLE_PREVIEW_CONVERGENCE_PHASE_C_DISCOVERY_AND_CONTRACT`  
**Date:** 2026-08-21  
**Phase type:** Discovery + contract only (no application code, no redirects, no publish changes)  
**Related plans (link, do not duplicate):**
- [`PLAN_MERGE_DRAFT_REVIEW_WEBSITE_EDITING_V1.md`](./PLAN_MERGE_DRAFT_REVIEW_WEBSITE_EDITING_V1.md)
- [`IMPLEMENTATION_REPORT_PHASE_0_WEBSITE_EDITING.md`](./IMPLEMENTATION_REPORT_PHASE_0_WEBSITE_EDITING.md)
- [`IMPLEMENTATION_REPORT_PHASE_1_DRAFT_REVIEW_CONTENT_ADAPTERS.md`](./IMPLEMENTATION_REPORT_PHASE_1_DRAFT_REVIEW_CONTENT_ADAPTERS.md)
- [`IMPACT_REPORT_SINGLE_OWNER_WEBSITE_EDITING_ENTRY_PHASE_B.md`](./IMPACT_REPORT_SINGLE_OWNER_WEBSITE_EDITING_ENTRY_PHASE_B.md)
- [`IMPACT_REPORT_MY_STORES_EDIT_ENTRY_CLEANUP.md`](../IMPACT_REPORT_MY_STORES_EDIT_ENTRY_CLEANUP.md)

**Verdict:** `STYLE_PREVIEW_CONVERGENCE_PLAN_READY`

---

## Objective (locked)

| Layer | Role |
| ----- | ---- |
| Performer | Create / improve proposals |
| Website Editing (Draft Review) | Single manual workspace |
| Design & presentation | Capability **inside** Website Editing, same revision |
| Preview | Renders that revision |
| Publish / Republish | Existing canonical `publishDraft` / snapshot contract |
| Legacy `/preview/website/...` | Temporary compatibility |

Do **not** assume convergence = moving React components.

---

## A. Style & preview implementation inventory

### Entry resolver

| Item | Location |
| ---- | -------- |
| Resolver | `apps/dashboard/.../src/lib/committedStoreWebsiteEditor.ts` → `resolveCommittedStoreWebsiteEditorTarget` |
| Draft lookup | `GET /api/stores/:storeId/draft` |
| Success URL | `buildWebsitePreviewOwnerUrl` → `/preview/website/:draftId?generationRunId?&returnTo?` |
| Fallback | `buildPublishedStoreEditFallbackUrl` → `/app/store/:storeId/review?mode=published&edit=1&committedStoreId=&from=` |

### Route registration

| Route | Shell | Page |
| ----- | ----- | ---- |
| `/preview/website/:draftId` | `CanonicalStorefrontRenderer mode="preview"` | `WebsitePreviewPage` |
| `/w/:draftId` | same | `WebsitePreviewPage` (alias) |
| `/preview/store/:storeId` | — | `StorePreviewPage` (storefront preview; “Style & preview” toolbar often returns here / to website editor) |
| `/s/:slug`, `/store/:slug` | public | May render mini-website via `WebsitePreviewPage` when published sections exist |

**Files:** `App.jsx` (~L1197–1235), `CanonicalStorefrontRenderer.tsx`, `WebsitePreviewPage.tsx`, `StorePreviewPage.tsx`.

### Data loader / store–draft resolution

| Concern | Mechanism |
| ------- | --------- |
| Primary load | `GET /api/draft-store/:draftId` (preview payload + `publishState`) |
| Temp / generating | `fetchTempDraftByGenerationRunId` / stores temp draft |
| Published chrome | Public store fetch when owner views live; owner draft overlay for unpublished hero/catalog |
| Auth | Guest-capable preview; owner tools require `isRealAuthed` (+ email verify for publish) |
| Authorisation | Draft access / store ownership on Core draft-store + hero routes |

### Query parameters (observed)

| Param | Role |
| ----- | ---- |
| `:draftId` (path) | DraftStore id **or** sometimes store id (legacy callers) |
| `generationRunId` | Lineage / temp draft continuity |
| `returnTo` | Safe return (My Stores, Catalog, Overview, etc.) |
| `embedded` | Performer iframe / panel |
| `ownerPreview` / `hideDraftMetadata` | Owner iframe chrome |
| `theme` | Occasional Performer entry context (not primary SOFT) |
| Fallback review: `mode=published`, `edit=1`, `committedStoreId`, `from=preview\|live_website` | Redirect bridge into website editor |

**Not primary on this surface:** `businessId` as query (Business id ≈ store id in Cardbey), published release id (projection uses `publishRunId` internally on Core, not a stable Style & preview query).

### UI capabilities → files

| Capability | Primary UI / module |
| ---------- | ------------------- |
| Style preset chips | `WebsitePreviewToolbar` + `WEBSITE_TEMPLATES` / `resolveWebsiteTheme` (`lib/websiteTheme`) |
| Hero render | `HeroMediaBackground`, hero section in `WebsitePreviewPage` |
| Hero edit | `HeroImageEditor` → hero upload / `PATCH .../draft/hero` / content-asset apply |
| Profile controls | Toolbar `onProfile` → `BusinessProfileEditor` / `updateStore` |
| Section layout | `preview.website.sections` + `normalizeStorefrontSections`; projection cutover path |
| Preview changes banner | `WebsitePreviewToolbar` + draft publish workflow state |
| View live | `publishState.liveUrl` / public slug navigate |
| LIVE indicator | Toolbar “Live” + unpublished hints (`draftPublishWorkflow`) |
| Republish | `handleRepublishClick` → snapshot path or `PublishModal` |
| Return navigation | `returnTo` query; post-publish navigate to live / overview |
| Cache invalidation | `invalidatePublicFeedCache` after successful republish |
| Audit | Core `activityEvent` / projection upsert / limited `auditEvent` (no full release history table) |
| Error / fallback | Toast + open PublishModal; missing draft → usedFallback review URL; hero apply rollback |

---

## B. State ownership map

| Capability | UI component | Read source | Write target | Draft/published | Preview source | Publish effect |
| ---------- | ------------ | ----------- | ------------ | --------------- | -------------- | -------------- |
| Style preset (`templateId`) | `WebsitePreviewToolbar` | `preview.website.theme.templateId` then local state default `warm` | **Primarily local React state** (`selectedTemplate`); not clearly patched to DraftStore on chip click | Draft intent / ephemeral | CSS vars via `resolveWebsiteTheme(selectedTemplate)` | Only if draft `preview.website.theme` already contains template **or** snapshot carries theme — **risk of lost selection** |
| Theme tokens / colours | Theme resolver + CSS vars | Template + optional brand kit | Local / draft website.theme | Draft | Same | Copied into `Business.stylePreferences.miniWebsite.theme` on `publishDraft` |
| Typography | Template tokens | Template | Local / theme | Draft | Same | Via miniWebsite theme |
| Hero media | `HeroImageEditor` | Draft preview hero fields; live Business hero columns | Draft hero PATCH / upload; Business only if not live (Class A) | Draft authoritative when live | Mixed until republish | Snapshot hero → `syncPublishedStoreFromDraft` |
| Hero copy / slogan | Hero section content | `preview` / sections | Draft preview / section patch paths | Draft | Draft-first | Publish sync |
| Store logo / profile | Profile editor | Business + draft sync | **Business PATCH** (`updateStore`) + draft sync helpers | Often **live Business** | Profile may update live independently of website hero | Website hero still may need republish |
| Layout variant | Template / sections | `preview.website` | Draft website | Draft | Draft | miniWebsite on publish |
| Section order / visibility | Section list / editors | `preview.website.sections` | Draft preview; **also** `PATCH /api/mini-website/:storeId/sections` (live) | Dual | Dual | Live patch **bypasses** draft revision |
| Product/catalog presentation | Catalog sections / grids | Draft catalog + live products | Draft products; live via catalog publish | Mixed | Mixed | Catalog apply on publish |
| CTA presentation | Hero CTAs / commerce labels | Commerce + preview | Mostly draft / Business commerce fields | Mixed | Mixed | Publish / Business PATCH |
| Mobile/desktop mode | Layout CSS / mobile nav | Client viewport | Local only | N/A | Local | None |
| Brand Profile | Artifact / loyalty compose (partial) | `brandProfile` in artifact factory; brand kit PATCH | Business brandTone/Style/Colors | Parallel | Not fully wired into Style chips | Independent of website publish |
| Dynamic composition / adoption | `businessCompositionEngine` (loyalty/channels) | Composition modes | Not Style & preview publish preflight | Separate | Separate | **Not** gating Republish today |
| miniWebsite state | Public mapper | `Business.stylePreferences.miniWebsite` | Publish write **or** direct sections PATCH | Published SOFT for public | Public reads miniWebsite | Republish overwrites via `publishDraft` |
| Projection cutover | `ProjectionCutoverStorefront` | `publishedArtifactProjection` / render payload | Publish rebuilds projection | Published | May differ from draft preview | Rebuild on publish |

### Explicit write-target summary

Style & preview currently touches:

1. **DraftStore.preview** (hero, website sections/theme when patched)  
2. **Business** directly (profile, some brand kit, optional live hero when not live)  
3. **Business.stylePreferences.miniWebsite** (on publish **and** via live sections PATCH)  
4. **storefrontSettings** (Shows / featured works — separate CMS paths)  
5. **Local/session state** (style chip selection — high risk)  
6. **publishedArtifactProjection** (on publish)  
7. **Not** a dedicated Design preset service; **not** composition-adoption as publish gate

---

## C. Publication trace — Republish

### Client end-to-end (owner full-page)

```
WebsitePreviewPage.handleRepublishClick
  → auth / email gates
  → if VITE_PUBLISH_SNAPSHOT_V1 + storeId:
       ensureSnapshotMatchesUiCatalog (GET/PATCH publish-snapshot)
       publishFromSnapshot → executePublishStore
         → unifiedDispatch({ type: 'publish_store', confirmed: true, payload: snapshot expectations })
         → Core ui_runtime → handlePublishStore[FromSnapshot] → publishDraft(...)
  → else: PublishModal → publish_cardbey / legacy publish_store
  → invalidatePublicFeedCache; navigate live URL
```

| Concern | Behaviour |
| ------- | --------- |
| API | Dispatch / hybrid (`publish_store`); HTTP twin `POST /api/draft-store/:id/publish` (snapshot) |
| Auth | Authenticated owner; email verify in prod paths |
| Draft validation | Snapshot version + fingerprint; hero canonical enforce |
| Business write | `publishDraft` / `finishCommittedDraftRepublish` |
| Composition preflight | **None** dedicated |
| Idempotency | Snapshot version checks; not a full release ledger |
| Audit | Projection upsert + activity events; **no** durable multi-version release history |
| Cache | Client feed/storefront invalidation |
| Failure | Toast; fall open PublishModal; snapshot disabled → modal |

### Publish entry comparison

| Publish entry | Endpoint / path | Canonical draft? | Preflight | Composition aware | Audit | Release history | Public mutation |
| ------------- | --------------- | ---------------- | --------- | ----------------- | ----- | --------------- | --------------- |
| Style & preview Republish (snapshot on) | `unifiedDispatch(publish_store)` → `publishDraft` | Yes (DraftStore + snapshot) | Snapshot + hero | No | Projection / activity | Latest projection only | Yes via `publishDraft` |
| PublishModal Cardbey | `publish_cardbey` → `publishDraft` | Yes | Snapshot if V1 | No | Same | Same | Yes |
| `POST .../draft-store/:id/publish` | HTTP snapshot publish | Required | verifyPublishIdentity | No | Same | Same | Yes |
| `POST /api/stores/publish` | Legacy | Optional draft | Identity | No | Same | Same | Yes |
| Performer tool `publish_store` | tool → `publishDraft` | Yes | Tool gates | No | Limited | Same | Yes |
| `commitDraft` / `publish-draft` | Legacy commit | Partial | Weak | No | Weak | No | Yes (**bypass projection runway**) |
| `PATCH /api/mini-website/:id/sections` | Direct | No | N/A | N/A | No | No | **Yes — live style without publish** |
| `PATCH /api/stores/:id` profile | Direct | No | Validation | N/A | Limited | No | **Yes — live profile fields** |
| Shows status / featuredWorks | Shows APIs | Draft/live mix | Bridge rules | N/A | Partial | No | **Yes — public Shows** |

### Blocker evaluation (Republish-specific)

**Republish itself** uses the canonical `publishDraft` runway (preferred snapshot path). It does **not** independently invent a second public writer.

Therefore Phase C does **not** return `BLOCKED_BY_MULTIPLE_PUBLICATION_AUTHORITIES` for the Republish button.

**However:** parallel live writers (`mini-website/sections`, profile PATCH, Shows, `commitDraft`) are **unsafe / multi-authority** and must be isolated or folded before Style & preview can be declared “publication-converged” (batch **C5 / C8**). Documented as highest-risk blockers, not Phase C stop.

---

## D. Preview projection comparison

| Surface | Typical source | Notes |
| ------- | -------------- | ----- |
| Style & preview (`WebsitePreviewPage`) | **DraftStore.preview** (+ local template state); optional published overlay / projection cutover | Mixed; owner sees draft chrome on live site |
| Website Editing / Draft Review | Same DraftStore revision (content adapters) | Content-first; presentation incomplete |
| Public storefront | `Business` + `stylePreferences.miniWebsite` + products + storefrontSettings | Published SOFT |
| Composition preview | Composition engines (loyalty/channels) | Not the same DTO as miniWebsite |
| Published release / projection | `publishedArtifactProjection` | May diverge from draft until republish |

**Conflict situations (expected today):**

1. Style chip changed locally → preview looks new; refresh loses it; live unchanged.  
2. Hero saved to draft → Style & preview + WE draft agree; public differs until republish.  
3. Live `PATCH mini-website/sections` → public updates; draft preview stale.  
4. Projection cutover vs legacy hero path → two render pipelines on same page.  
5. Catalog in draft vs live products after partial sync.

---

## E. Capability classification

| Capability | Class |
| ---------- | ----- |
| Hero media edit (draft-authoritative) | **2** Reusable UI over canonical draft hero APIs |
| Hero / LIVE unpublished indicators | **1/2** Align with WE revision banner |
| View live / returnTo | **1** Already navigation-only |
| Republish → `publishDraft` | **1** Canonical; keep boundary |
| Style preset chips | **3** Legacy-required; must gain draft mutations before redirect |
| Theme/token CSS application | **2** After canonical theme on revision |
| Section order editors (if live PATCH) | **6** Unsafe until draft-only |
| Profile editor on Business | **6** / **4** — live profile vs website design boundary must be explicit |
| Projection cutover renderer | **4** Preview-only; must not mutate |
| Mobile layout toggles | **4** or **5** |
| Duplicate “Edit & Republish” labels mixing presentation + publish | **5** after Design section exists |
| Brand Profile constraints | **3** (wire later; incomplete today) |
| Composition adoption gate on publish | **3** / missing — treat as required before C5 exit |

---

## F. Target Design & presentation adapter (contract only)

### Identity

- **Adapter id:** `design` (Website Editing section key; URL `section=design`)  
- **Alias labels:** Design & presentation (EN), Giao diện & trình bày (VI)  
- **Content-neutral:** No catalog/Shows item editors; no Performer kernel UI imports

### Same editing context as Website Editing

Uses Phase 0/B context: `{ storeId, draftId, revisionId?, entry, returnTo, weKind, weSource }` from `resolveWebsiteEditingTarget` / `openWebsiteEditing`.

### Supported fields (v1 target)

- `theme.templateId` (+ token overrides if already in foundation)  
- Hero media + hero copy fields already on draft preview  
- Section order / visibility **only** via draft `preview.website.sections`  
- CTA presentation fields already on draft website hero  
- Explicit **non-goals v1:** live miniWebsite PATCH, new theme system, composition UI inside adapter

### Read projection

`GET` draft website editing context → `DraftStore.preview.website` (+ hero fields) as `DesignPresentationProjection`.

Public/live fields exposed as **read-only comparison** (`liveTheme`, `liveHeroFingerprint`) for drift diagnostics — not dual-edit.

### Mutation commands (draft-only)

| Command | Effect |
| ------- | ------ |
| `design.setTemplate` | Patch `preview.website.theme.templateId` + foundation merge |
| `design.patchThemeTokens` | Validated token subset |
| `design.setHeroMedia` | Existing hero draft services |
| `design.patchHeroCopy` | Draft section/hero text |
| `design.reorderSections` / `design.setSectionVisibility` | Draft sections only |

All commands: revision/version check, ownership, admin AoB reason when `entry=admin`.

### Validation / concurrency

- Reject unknown template ids  
- Optimistic concurrency on draft `previewVersion` / snapshot version  
- Never create another Business/store  
- Never publish as side effect

### Preview behaviour

- In-adapter preview pane **or** deep-link to `/preview/website/:draftId` with `weSource=design` **reading the same draftId**  
- Local-only overrides forbidden after C2

### Performer scopes

- Propose `design.setTemplate` / hero improvements as proposals (bridge-style)  
- Kernel remains unaware of toolbar components

### Admin

- Same adapter + admin website-editing context + reason/audit

### Publication boundary

- Adapter **never** calls publish  
- Publish/Republish remain explicit owner actions on canonical contract  
- Selecting a style marks Brand Profile / composition **stale flags** (metadata only) when those systems are present

---

## G. Brand Profile & composition alignment

| System | Relation to Style & preview today | Target ownership |
| ------ | --------------------------------- | ---------------- |
| Legacy `WEBSITE_TEMPLATES` | Local/legacy presets | Become **canonical design decisions** on DraftStore revision |
| Brand Profile / brand kit | Parallel Business fields; weak constraint on templates | **Constrains** allowed templates/tokens after approval; does not invent third theme engine |
| Website direction / foundations | `websiteTemplateFoundation` on generate/patch | Feed into `design.setTemplate` |
| Dynamic composition / adoption | Not on Republish path | **Must gate** public design release in C5 (composition-controlled publish) |
| Final public design owner | `publishDraft` → `stylePreferences.miniWebsite` + projection | Keep; forbid live section PATCH as design authority |

**Do not create a third theme system.** Migrate preset selection onto draft `preview.website.theme`.

---

## H. Proposed user journey

1. My Stores → **Edit website** (`openWebsiteEditing`)  
2. Website Editing opens canonical revision  
3. User selects **Design & presentation** (`section=design`)  
4. User changes style / hero / layout via adapter commands  
5. Changes persist to **same** DraftStore revision  
6. Preview renders that revision  
7. Performer may propose design improvements  
8. User accepts/rejects  
9. Publish uses canonical `publishDraft` / snapshot  
10. View live opens public release  

### Style & preview CTA transition

| Stage | Behaviour |
| ----- | --------- |
| **T0 (now)** | Opens legacy `/preview/website/:draftId` via `resolveCommittedStoreWebsiteEditorTarget`; add deprecation metadata only in later coding batch |
| **T1** | Same URL, but mutations already draft-canonical (C2) |
| **T2** | CTA deep-links `openWebsiteEditing({ section: 'design' })` |
| **T3** | Legacy URL resolves through website-editing context → Design section or draft-bound preview; **no wrong-store fallback** |
| Always | No independent Republish authority; capability parity checklist before removing legacy UI |

---

## I. Transitional compatibility

| Case | Strategy |
| ---- | -------- |
| Bookmarks `/preview/website/:draftId` | Keep serving; eventually resolve draft → store → optional redirect to WE Design |
| `generationRunId` preview links | Preserve query; load exact draft; never invent another store |
| Published store without editable revision | Website Editing context creates/forks unpublished revision (existing Phase 0 behaviour); Style CTA may toast unavailable if no draft (Phase B already) |
| Legacy miniWebsite only | Diagnostics flag; on first WE Design open, import miniWebsite → draft website once (C7, confirmed) |
| Style preset without composition metadata | Allow edit; mark composition stale |
| Adopted/published composition | Design edits require stale/re-adopt before publish (C5) |
| Stale Brand Profile | Constrain or warn; do not auto-force template |
| Admin support links | Admin WE context + Design section |
| Return to My Stores | Keep `returnTo` sanitiser |
| Ambiguous legacy link | **Fail closed** — never open/create another store |

---

## J. Read-only diagnostics (design only)

**Report id:** `design_preview_convergence_diagnostics_v1`  
**Mode:** read-only; no repairs in Phase C / C7 until confirmed.

Detect:

1. Preview draft theme ≠ WE revision theme  
2. Style preset only in `stylePreferences.miniWebsite`  
3. Theme/token conflicts (draft vs live vs brand kit)  
4. Hero fingerprint draft ≠ live  
5. Multiple section-order sources (draft vs miniWebsite vs projection)  
6. Live miniWebsite PATCH capability still enabled (republish bypass risk)  
7. Missing revision mapping for committed store  
8. generation-run-only preview without storeId  
9. Composition/adoption mismatch vs live design  
10. Public release / projection ≠ expected canonical release fingerprint  

Output: per-store JSON for admin/support; privacy-safe ids only.

---

## K. Future tests (required for implementation)

- Unit/contract: adapter commands, URL `section=design`, no publish side effects  
- Tenant isolation: cross-store design patch denied  
- Revision concurrency: stale `previewVersion` rejected  
- Style/hero persistence: chip → draft → reload equality  
- Preview equality: WE Design preview ≡ `/preview/website/:draftId` for same draft  
- Brand/composition staleness flags  
- Publish preflight with composition gate  
- Republish compatibility (snapshot path)  
- Legacy redirect / bookmark  
- Admin AoB + reason  
- Flags-off regression (legacy surface still works)  
- Mobile/desktop browser matrices  

---

## L. Delivery batches

### C1 — Canonical design projection / adapter contract

- **Status (2026-08-21):** Implemented read-only — see [`IMPLEMENTATION_REPORT_STYLE_CONVERGENCE_C1.md`](./IMPLEMENTATION_REPORT_STYLE_CONVERGENCE_C1.md)
- **Scope:** Types, `section=design` registration, flags (default OFF), provenance projection, drift diagnostics, parallel-writer inventory, GET design-projection API, read-only WE panel when flag ON
- **Deps:** Phase B helper; Overview route closure (`BUSINESS_OVERVIEW_ROUTE_AND_ENTRY_VERIFIED`)
- **Flags:** `ENABLE_WEBSITE_EDITING_DESIGN_ADAPTER_V1` / `VITE_ENABLE_WEBSITE_EDITING_DESIGN_ADAPTER_V1` (off)
- **Migration:** None
- **Tests:** Contract + projection + Dashboard flag/URL
- **Browser:** Flag-off unchanged; flag-on shows read-only readiness (no style mutation controls)
- **Rollback:** Flag off
- **Exit:** Adapter id reserved; no UI mutations of design/public state
- **Exclude:** C2 persistence, UI move, preview redirects, publish changes

### C2 — Style preset + hero draft mutations

- **Scope:** Persist template to draft; hero remains draft services; remove reliance on local-only template  
- **Deps:** C1  
- **Flags:** design adapter mutations  
- **Migration:** None  
- **Tests:** Persistence + reload  
- **Browser:** Style chip survives refresh on draft  
- **Rollback:** Flag off  
- **Exit:** Local-only template path gone when flag on  
- **Exclude:** Legacy route redirect; composition gate  

### C3 — Website Editing Design UI

- **Scope:** Design & presentation section UI (reuse toolbar patterns via adapters, not copy-paste product)  
- **Deps:** C2  
- **Flags:** UI flag  
- **Tests / browser:** Section opens; edits draft  
- **Exclude:** Deleting Style & preview  

### C4 — Canonical preview convergence

- **Scope:** Preview always bound to WE revision draftId; projection cutover rules documented  
- **Deps:** C2–C3  
- **Exit:** No mixed local overrides  
- **Exclude:** Publish changes  

### C5 — Republish / publish convergence

- **Scope:** Ensure Style CTA / Design UI publish entries only call `publishDraft` snapshot path; add composition/Brand stale preflight; quarantine live miniWebsite design PATCH  
- **Deps:** C4 + composition contract availability  
- **Exit:** No design go-live via sections PATCH  
- **Exclude:** Broad Shows rewrite  

### C6 — Legacy route compatibility redirect

- **Scope:** `/preview/website/:draftId` → resolve context → WE Design or draft-bound preview; deprecation metadata  
- **Deps:** C3–C5  
- **Exit:** Bookmarks work; no wrong-store  
- **Exclude:** Deleting page file yet  

### C7 — Existing-store diagnostics + controlled reconciliation

- **Scope:** Read-only report; optional confirmed import miniWebsite→draft  
- **Deps:** C1 diagnostics schema  
- **Exit:** Report runnable; repairs only with confirmation  
- **Exclude:** Automatic mass rewrite  

### C8 — Remove obsolete preview mutations / UI

- **Scope:** Remove duplicate style chrome / unsafe live design writers from owner path  
- **Deps:** C6 usage proof  
- **Exit:** Single design edit path  
- **Exclude:** Public renderer redesign  

---

## M. Overview browser gap (Phase B evidence)

### Attempt

- Disposable owner + store (`tmp/phase3-browser-evidence`, gitignored)  
- `cardbey.businessBuilder.v1` onboarding `completed: true`  
- SQLite `stylePreferences.lifecycleStage = live` so store context leaves onboarding redirect  
- Playwright ephemeral script (tmp only — **not** committed application code)

### Result

| Check | Result |
| ----- | ------ |
| Reach `/business/overview?storeId=…` without onboarding wizard | **Pass** (after lifecycle=live) |
| Overview **Edit website** / Catalog / Shows / Style & preview testids | **Fail to render** |

**Root cause (discovery):** `/business/overview` is claimed by `Route path="/business/:slug"` → `BusinessPublicOrBuilderRoute` → `BusinessDashboard`, but nested `<Route path="overview">` does not receive a remaining path segment (slug already consumed). Shell title “Business Overview” renders; **`OverviewPage` (with Phase B CTAs) does not mount.**

### Implications

- Phase B **code** for Overview CTAs is present in `OverviewPage.tsx` (`openWebsiteEditing`, style resolver).  
- Phase B **browser proof** for Overview remains incomplete until a **routing fix** (out of Phase C coding ban). Recommend smallest follow-up: ensure builder segments render nested routes correctly (e.g. splat routing), then re-run Overview matrix.  
- No exact-lineage restoration observed on attempted Overview navigation (page never reached CTAs).

Evidence (sanitised): `apps/core/cardbey-core/tmp/phase3-browser-evidence/phase-c-overview-results.json` + screenshots (gitignored). Fixtures soft-cleaned after pass attempt.

---

## N. Highest-risk blockers

1. **Multiple design write authorities** (draft vs live miniWebsite PATCH vs Business profile) — must quarantine before C5 exit.  
2. **Style preset local-only state** — preview lies relative to draft/public.  
3. **Dual render pipelines** (legacy hero vs projection cutover).  
4. **Composition/Brand not on publish path** — public design can drift from “approved” composition.  
5. **Overview route nesting** — blocks Overview UI verification and owner discovery of Design entry from Overview.  
6. **No durable release history** — diagnostics must use projection fingerprints carefully.

### Recommended first coding batch

**C1** (adapter contract + section id + flags-off shell), immediately followed by **C2** (persist style preset + hero to the same DraftStore revision). Do not redirect Style & preview until C2 proves persistence.

---

## Confirmation

- **No application code changed** for Phase C (dashboard/core product paths untouched).  
- Documentation only: this plan file.  
- Ephemeral tmp scripts/evidence under gitignored Core `tmp/` only.  
- No push, deploy, or BB Flowers/live data mutation beyond disposable fixtures (cleaned).
