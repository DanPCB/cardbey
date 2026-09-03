# CARDBEY V1 — STORE CREATION RELEASE GAP REGISTER

**Date:** 2026-09-03  
**Mission:** `CARDBEY_V1_STORE_CREATION_RELEASE_CLOSURE_AUDIT`  
**Mode:** Audit + release plan only — **no product expansion**  
**Entry contract:** FROZEN — `docs/reports/GOLDEN_PATH_STORE_CREATION_ENTRY_UX_V2_GATE.md` (`CANARY_PASS`)

---

## VERDICTS

| Axis | Verdict |
|------|---------|
| **CORE V1** | `V1_STORE_CREATION_RELEASE_BLOCKED` |
| **PAID PILOT** | `V1_PAID_PILOT_BLOCKED` |

It is valid that CORE and PAID are independently blocked. Paid remains blocked even if CORE later clears, until entitlement/checkout is safe.

**Wave 0 (2026-09-04):** `WAVE_0_COMPLETE_PENDING_RENDER_SYNC` — see `docs/reports/WAVE0_STORE_CREATION_RELEASE_CLOSURE.md`. Flag pins written; OCR resilient on staging; Day 4 full reveal+refresh canary PASS. Core/Paid still blocked on Wave 1+.

**Wave 1 (2026-09-04):** `WAVE_1_PARTIAL` — see `docs/reports/WAVE1_STORE_CREATION_RELEASE_CANARY.md`. HP Services build+preview PASS; publish blocked (`publish_snapshot_disabled` on live staging). Insufficient clarify PASS; ambiguous names FAIL (Ready-to-create without ASK_USER). Cohort 7/12 strict.

---

## FIRST FAILING BOUNDARY

**RESEARCH / EVIDENCE UNDER PRODUCTION CONFIG + UNPROVEN CREATE→PUBLISH CANARY**

Entry UX V2 is locked and canary-passed. Mission 001 truthfulness is closed for research-only soaks. Downstream UI (quick edit, CTAs) is not the earliest failure.

The earliest release-dependability break is:

1. **Production research defaults** — `ENABLE_STORE_RESEARCH_PIPELINE` returns `false` in production unless explicitly set (`runStoreResearchPipeline.js`). Grounded creation / Design Library family also default off in production (see Aug E2E audit + `features.js`).
2. **No documented multi-business live cohort** proving `clue → research → build → persist → reveal → edit → publish → live URL reload`.
3. **HP Services permanent canary** only proven through **entry → intelligence start**, not full chain (`IMPACT_REPORT_STORE_CREATION_ENTRY_UX_V2.md`).

Fixing edit polish or paid copy before production research enablement + end-to-end canaries is not release closure.

```
ENTRY (LOCKED PASS)
   ↓
IDENTITY / INTAKE (staging smoke PASS; ambiguous live deferred)
   ↓
OCR/VISION (PARTIAL — extract-card has fallback; Google opt-in)
   ↓
★ RESEARCH / EVIDENCE  ← FIRST FAILING BOUNDARY (prod flag + canary depth)
   ↓
OFFERINGS (Mission 001 closed for research-only; fail-closed invention)
   ↓
BUILD / PERSIST / REVEAL (code ready; live full-path proof incomplete)
   ↓
QUICK EDIT (shipped; browser A–F PARTIAL)
   ↓
PUBLISH / LIVE (code + snapshot guards; E2E cohort missing)
   ↓
COMMERCIAL CTA (Quote OPERATIONAL; Book DEGRADED; Buy PLACEHOLDER)
   ↓
PAID ENTITLEMENT (customer Stripe journeys PARTIAL; platform billing MISSING)
```

---

## Severity definitions

| Severity | Meaning |
|----------|---------|
| `P0_RELEASE_BLOCKER` | User cannot reliably complete free V1: clue → credible store → correct → publish → use |
| `P1_PAID_PILOT_BLOCKER` | Core may work, but charging would create an expectation Cardbey cannot fulfil |
| `P2_POST_V1` | Useful; does not block release or honest paid pilot |
| `NO_GAP` | Sufficient for V1 |

---

## Gap register

### RG-001 — Production research pipeline default OFF

| Field | Value |
|-------|-------|
| **STAGE** | RESEARCH / EVIDENCE |
| **SEVERITY** | `P0_RELEASE_BLOCKER` |
| **OBSERVED FAILURE** | `isStoreResearchPipelineEnabled()` uses env if set; else `NODE_ENV !== 'production'` → **false in production** |
| **ROOT CAUSE** | Safe default for non-prod inverted for release: prod must opt in |
| **OWNER MODULE** | `apps/core/cardbey-core/src/lib/storeResearch/runStoreResearchPipeline.js` |
| **USER IMPACT** | Prod create may skip grounded research → weak/template-leaning stores; violates “intelligence does the rest” |
| **REPRODUCTION** | Unset `ENABLE_STORE_RESEARCH_PIPELINE` with `NODE_ENV=production`; start create-store research path; observe pipeline skipped |
| **EXISTING CAPABILITY** | Full `runStoreResearchPipeline` / `runStoreCreationResearch` when flag on |
| **MINIMUM FIX** | Confirm prod/staging env has `ENABLE_STORE_RESEARCH_PIPELINE=true` (and Mission 001 / grounded flags as already used in Mission 001 soak). Document pin in release checklist. Code default change only if ops cannot guarantee env. |
| **TEST REQUIRED** | Staging+prod config canary: research stage runs for name+URL fixtures; log `storeResearch` started |
| **RELEASE BLOCKING** | **YES** (until prod pin verified) |
| **WAVE 0** | Pins added to `render.yaml` production+staging (2026-09-04). **Live VERIFY after Render sync/redeploy.** |

### RG-002 — Publish snapshot dual-path / default OFF

| Field | Value |
|-------|-------|
| **STAGE** | PUBLISH |
| **SEVERITY** | `P0_RELEASE_BLOCKER` (config) / `NO_GAP` if both env pins proven |
| **OBSERVED FAILURE** | Canonical `POST /api/draft-store/:draftId/publish` requires `PUBLISH_SNAPSHOT_V1`; flag defaults **false**. Dashboard twin `VITE_PUBLISH_SNAPSHOT_V1` also defaults false. Legacy publish paths still coexist. |
| **ROOT CAUSE** | Snapshot publish is the guarded path; unset flags force legacy or 503 |
| **OWNER MODULE** | `publishSnapshotService.js`, `draftStore.js`, `publishSnapshotClient.ts` |
| **USER IMPACT** | Owner Publish may fail or use weaker legacy path; draft/live identity weaker |
| **REPRODUCTION** | Publish with snapshot flag off vs on; compare identity checks + live `/s/:slug` |
| **EXISTING CAPABILITY** | Snapshot verify + `finishCommittedDraftRepublish` idempotent republish |
| **MINIMUM FIX** | Pin `PUBLISH_SNAPSHOT_V1=true` and `VITE_PUBLISH_SNAPSHOT_V1=true` on staging+prod; kill-switch documented; one publish canary |
| **TEST REQUIRED** | draft → publish → live reload → republish same store (no duplicate) |
| **RELEASE BLOCKING** | **YES** until pins verified |
| **WAVE 0** | `PUBLISH_SNAPSHOT_V1` pinned in core `render.yaml`; `VITE_PUBLISH_SNAPSHOT_V1=true` in dashboard staging/production env templates. **Live VERIFY after deploy.** |

### RG-003 — HP Services canary not full-chain PASS

| Field | Value |
|-------|-------|
| **STAGE** | FULL GOLDEN PATH (Canary A) |
| **SEVERITY** | `P0_RELEASE_BLOCKER` (evidence) |
| **OBSERVED FAILURE** | Entry canary PASS for `HP Services` only proves “Analyzing business…” / intelligence start — not identity→research→build→persist→reveal→edit→publish→reload |
| **ROOT CAUSE** | Entry UX gate scoped to entry; Hardening Program defines HP upload canary as still required |
| **OWNER MODULE** | Entry: `StoreCreationDraftCard` + Intake V2; full path: research/build/publish |
| **USER IMPACT** | Cannot claim permanent canary PASS for release |
| **REPRODUCTION** | Run `HP Services` (name + optional card) through publish; record IDs |
| **EXISTING CAPABILITY** | Day 3 intake smoke; Mission 001 research; publish services; entry canary script |
| **MINIMUM FIX** | One scripted/manual full-chain canary artifact (not new features) |
| **TEST REQUIRED** | Auth → input → identity → evidence → research → build → persist → reveal → edit → publish → reload |
| **RELEASE BLOCKING** | **YES** for READY verdict |

### RG-004 — No 10–20 business create→publish→live cohort

| Field | Value |
|-------|-------|
| **STAGE** | RELEASE COHORT |
| **SEVERITY** | `P0_RELEASE_BLOCKER` (evidence) |
| **OBSERVED FAILURE** | Mission 001 30-fixture soak is **live_research only** — “no publish, no contact, no ownership claim” (`MISSION_001_V1_LAUNCH_CLOSURE.md`). No doc of 10–20 full seller Golden Path completions. |
| **ROOT CAUSE** | Research closure ≠ release closure |
| **OWNER MODULE** | Release ops / canary harness |
| **USER IMPACT** | Unknown failure rate on publish/CTA/mobile beyond research |
| **REPRODUCTION** | N/A — cohort never run as release suite |
| **EXISTING CAPABILITY** | Mission 001 fixtures; MSD/Market Lane proofs; entry clue tests |
| **MINIMUM FIX** | Bounded cohort (~12) covering name/URL/description/card/ambiguous/insufficient × service/café/retail; record matrix; no new features |
| **TEST REQUIRED** | Per-fixture INPUT→…→CTA→TIME→FAILURE→RECOVERED |
| **RELEASE BLOCKING** | **YES** for READY |

### RG-005 — OCR / vision resilience PARTIAL

| Field | Value |
|-------|-------|
| **STAGE** | OCR / VISION |
| **SEVERITY** | `P0_RELEASE_BLOCKER` for **business-card input** if Google Vision disabled in prod; else `P1` residual risk |
| **OBSERVED FAILURE** | Extract-card uses `extractTextWithFallback` (OpenAI primary → Google if enabled). Google gated by `GOOGLE_CLOUD_VISION_ENABLED` (opt-in). Anthropic fallback in `runOcr` is **refusal-driven**, not quota/429-driven. Historical quota → empty OCR → “unreadable” risk remains if fallback off. |
| **ROOT CAUSE** | Fallback chain incomplete for transport/quota; Google not on by default |
| **OWNER MODULE** | `ocrFallback.js`, `runOcr.js`, `missionsRoutes.js` extract-card |
| **USER IMPACT** | Valid card upload can fail as infrastructure error misframed as unreadable business |
| **REPRODUCTION** | Simulate OpenAI 429/quota with Google off vs on; assert user message + provider class |
| **EXISTING CAPABILITY** | Refusal fallback; `OCR_FAILED` explicit; frontend guards against fake Confidence 0% pre-OCR |
| **MINIMUM FIX** | (1) Enable Google Vision fallback in staging+prod **or** classify provider failure distinctly from low confidence; (2) on primary throw (quota/429), attempt fallback before empty text |
| **TEST REQUIRED** | `ocrFallback.test.js` + extract-card integration with mocked primary failure |
| **RELEASE BLOCKING** | **YES** for card path if fallback not pinned; name/URL/description can still ship with card marked degraded |
| **CLASSIFICATION** | Staging: **RESILIENT** (OpenAI→Anthropic→Google + VISION_PROVIDERS_UNAVAILABLE). Production: **PARTIAL** until Core promote + canary. |
| **WAVE 0** | Mitigated on staging via Vision Provider Fallback V1 (PR #339). See `VISION_PROVIDER_FALLBACK_V1.md`. |

### RG-006 — Name-only / ambiguous identity live clarification incomplete

| Field | Value |
|-------|-------|
| **STAGE** | BUSINESS IDENTITY |
| **SEVERITY** | `P0_RELEASE_BLOCKER` for ambiguous cohort slice; `P2` once clarify ASK_USER works end-to-end |
| **OBSERVED FAILURE** | Day 3: case F `ABC Plumbing` **NOT IN SCRIPT**. Mission 001: resolution **53.3%** (16/30); unresolved fail-closed (good). Entry report: name-only hit `unwrapPlacesSearchRow` catalog noise. Ambiguous entity hook deferred. |
| **ROOT CAUSE** | Prefer unresolved over wrong entity (correct) but owner clarify loop not fully proven live |
| **OWNER MODULE** | `storeCreationIntakePolicy.js`, Mission 001 `nameOnlyResolution`, research review cards |
| **USER IMPACT** | Generic/ambiguous names may stall or degrade without one clear clarification question |
| **REPRODUCTION** | `Flower Store`, `Spotless Cleaning Services`, `ABC Plumbing` |
| **EXISTING CAPABILITY** | Fail-closed offerings; StoreResearchReviewCard; progressive clarification policy |
| **MINIMUM FIX** | Wire/prove single ASK_USER clarification for IDENTITY_AMBIGUOUS / UNRESOLVED before inventing; keep fail-closed catalog |
| **TEST REQUIRED** | Ambiguous + insufficient fixtures → clarify, not invent |
| **RELEASE BLOCKING** | **YES** for honest identity contract on name-only cohort |

### RG-007 — Quick Edit browser acceptance PARTIAL

| Field | Value |
|-------|-------|
| **STAGE** | QUICK CORRECTION |
| **SEVERITY** | `P0_RELEASE_BLOCKER` until A–F pass **or** proven via cohort that owners can fix material mistakes another way |
| **OBSERVED FAILURE** | Store Editing Flow Correction V1 shipped (dashboard #293/#294) but verdict `STORE_EDITING_FLOW_CORRECTION_V1_PARTIAL` — MSD browser A–F pending |
| **ROOT CAUSE** | Unit tests ≠ owner Draft Preview acceptance |
| **OWNER MODULE** | `WebsitePreviewPage`, `ShowQuickEditDrawer`, `ServiceQuickEditDrawer`, `StoreShowSection` |
| **USER IMPACT** | Generated mistakes may be hard to fix → unusable first store |
| **REPRODUCTION** | Owner Edit Store → `/preview/website` → service/show/featured Edit → Save → stay on preview |
| **EXISTING CAPABILITY** | Quick Edit drawers + Advanced Show → Content Studio; routing already Draft Preview |
| **MINIMUM FIX** | Run A–F acceptance; fix only blocking defects found |
| **TEST REQUIRED** | Browser A–F on Draft Preview |
| **RELEASE BLOCKING** | **YES** until PASS (or equivalent cohort proof) |

### RG-008 — Buy / Order storefront PLACEHOLDER

| Field | Value |
|-------|-------|
| **STAGE** | COMMERCIAL ACTION |
| **SEVERITY** | `P1_PAID_PILOT_BLOCKER` if paid promise includes retail checkout; `P2_POST_V1` if V1 paid promise is service Quote/Book/Contact only |
| **OBSERVED FAILURE** | Public cart UI; “Checkout coming soon”; `create-checkout-session` exists but not wired from live storefront |
| **ROOT CAUSE** | Payment backend ahead of storefront checkout UX |
| **OWNER MODULE** | `PublicStorePage`, `StorePreviewPage`, `checkoutSessionService.js` |
| **USER IMPACT** | Retailer primary CTA dead if presented as Buy |
| **REPRODUCTION** | Open published product store → cart → checkout |
| **EXISTING CAPABILITY** | Stripe checkout session API; Quote/Enquire OPERATIONAL |
| **MINIMUM FIX** | Either hide Buy as operational **or** wire one checkout path — prefer hide for V1 pilot contract |
| **TEST REQUIRED** | Retail fixture: no dead Buy presented as live |
| **RELEASE BLOCKING** | Paid: **YES** if overpromised; Core free: **NO** if service Quote is primary |

### RG-009 — Booking owner notification thin

| Field | Value |
|-------|-------|
| **STAGE** | COMMERCIAL ACTION |
| **SEVERITY** | `P1_PAID_PILOT_BLOCKER` if Book is sold as primary; else `P2` |
| **OBSERVED FAILURE** | Bookings persist + owner panel; activity emit mainly on payment confirm, not all unpaid creates |
| **ROOT CAUSE** | Notification incomplete |
| **OWNER MODULE** | `bookingService.js`, `paymentWebhookService.js`, `BookingsPanel.tsx` |
| **USER IMPACT** | Owner may miss unpaid booking requests |
| **REPRODUCTION** | Submit unpaid booking; check activity/email |
| **EXISTING CAPABILITY** | Booking rows + owner GET bookings |
| **MINIMUM FIX** | Emit inquiry activity on booking create; optional email later (POST_V1) |
| **TEST REQUIRED** | Booking create → owner activity visible |
| **RELEASE BLOCKING** | Paid if Book promised without notify |

### RG-010 — Platform paid entitlement / self-serve billing MISSING

| Field | Value |
|-------|-------|
| **STAGE** | PAID ENTITLEMENT |
| **SEVERITY** | `P1_PAID_PILOT_BLOCKER` |
| **OBSERVED FAILURE** | Stripe works for **customer journey** payments. Platform AI entitlement is credit/bundle/`isPremium` via `billing.js` / `creditsService.js`. No self-serve purchase: Pricing CTAs disabled/contact; `/app/billing` referenced without found page; credit add is `POST /api/dev/credits/add` |
| **ROOT CAUSE** | Customer payments ≠ seller subscription billing |
| **OWNER MODULE** | `paymentRoutes.js`, `PricingPage.tsx`, `useGatekeeper.ts` |
| **USER IMPACT** | Cannot honestly charge for “Cardbey plan” without manual ops |
| **REPRODUCTION** | Try buy plan from Pricing → no checkout |
| **EXISTING CAPABILITY** | Stripe client; credit ledger; welcome bundle |
| **MINIMUM FIX** | ONE pilot offer: either (A) manual entitlement + invoice + support SOP, or (B) single Stripe Checkout → credit/premium flag with webhook idempotency. Founder approve copy. |
| **TEST REQUIRED** | pay → entitlement → access; fail → no entitlement; webhook retry idempotent |
| **RELEASE BLOCKING** | Paid **YES**; Core free **NO** |

### RG-011 — Checkout copy / overpromise risk

| Field | Value |
|-------|-------|
| **STAGE** | PAID PILOT |
| **SEVERITY** | `P1_PAID_PILOT_BLOCKER` |
| **OBSERVED FAILURE** | Pricing is marketing; Global Live EOI is application-not-purchase (`IMPLEMENTATION_REPORT_GLOBAL_LIVE_EOI_*` PARTIAL) |
| **ROOT CAUSE** | No bounded paid contract tied to OPERATIONAL capabilities |
| **OWNER MODULE** | Product/founder + Pricing/EOI surfaces |
| **USER IMPACT** | Charge for Buy/full CRM/social → expectation failure |
| **MINIMUM FIX** | Written pilot contract: hosted store + edit + Quote/Contact (+ Book if RG-009 fixed) + human support; exclude Buy/Order/advanced CRM |
| **TEST REQUIRED** | Copy review checklist vs OPERATIONAL matrix |
| **RELEASE BLOCKING** | Paid **YES** |

### RG-012 — Result reveal / edit-session confusion (historical)

| Field | Value |
|-------|-------|
| **STAGE** | RESULT / REVEAL |
| **SEVERITY** | `P2_POST_V1` if Day 4 deploy proven; else `P0` until staging proof |
| **OBSERVED FAILURE** | Day 4 gate `PARTIAL` — MSD showed result but edit-session reopen failed; auto-reveal implemented in code |
| **ROOT CAUSE** | RESULT ≠ EDIT SESSION (correct architecture); live deploy proof lagged |
| **OWNER MODULE** | `storeResultReveal.ts`, `WebsitePreviewPage` |
| **MINIMUM FIX** | Staging canary: build → auto `/preview/website/:draftId` → refresh survives |
| **RELEASE BLOCKING** | **YES** until one staging refresh canary PASS |
| **WAVE 0** | Staging full Day 4 canary **PASS** including preview refresh (2026-09-04). Downgrade to `P2` / `NO_GAP` for staging; keep prod smoke in Wave 4. |

### NO_GAP (sufficient for V1)

| ID | Stage | Evidence |
|----|-------|----------|
| NG-001 | ENTRY | Entry UX V2 LOCKED; staging canary 7/7; 45/45 local acceptance |
| NG-002 | INVENTION POLICY (research) | Mission 001: False Offering 0%; WRONG_ENTITY 0%; unresolved no invented catalog |
| NG-003 | PUBLISH IDEMPOTENCY (code) | `finishCommittedDraftRepublish`; reuse Business for temp; identity fingerprint |
| NG-004 | QUOTE / ENQUIRE | Public journey → QuoteRequest → owner panel + activity |
| NG-005 | OWNER EDIT ROUTING | Edit Store → `/preview/website`; public `/preview/store?view=public` kept |
| NG-006 | ADVANCED SHOW EDIT | On-card Advanced → Content Studio with `showWorkId` (shipped) |
| NG-007 | OBSERVABILITY BASE | missionId, generationRunId, runtime diagnostics, publish lineage logs |
| NG-008 | GUEST / SESSION | Guest session + draft limits; extract-card auth retry |

### P2_POST_V1 (do not implement in release waves)

- Full Personal Space / social network / advanced CRM  
- Retail Buy/Order checkout (unless chosen as paid promise)  
- Owner email/SMS for every inquiry  
- Complete Design Library production cutover polish  
- Tokenisation / marketplace maturity  
- New Performer architecture / Content Studio redesign  
- Aesthetic polish unrelated to conversion  
- Async website metadata enrich on all NL paths  
- Duplicate `restore-from-published` route cleanup  

---

## Golden Path stage matrix

| STAGE | STATUS | EVIDENCE | BLOCKER |
|-------|--------|----------|---------|
| Entry | **PASS / FROZEN** | Entry V2 gate CANARY_PASS | — |
| Identity / Session | **PASS (staging smoke)** | Day 3 A–E; guest session | Ambiguous F deferred |
| OCR / Vision | **STAGING RESILIENT / PROD PARTIAL** | Vision Fallback V1 on staging | RG-005 prod promote |
| Research | **CONDITIONAL** | Mission 001; Wave 0 pins in render.yaml | RG-001 live verify |
| Confidence / Evidence | **PASS (fail-closed)** | Mission 001 gates | — |
| Offerings | **PASS (eligible)** | 16/16 eligible; 53% overall resolution | RG-006 clarify |
| Build | **STAGING PROVEN (MSD)** | Day 4 full canary build PASS | RG-003/004 cohort |
| Persistence | **LIKELY OK** | DraftStore / Business / Product | Cohort proof |
| Reveal | **STAGING PASS** | Day 4 full + refresh canary 2026-09-04 | Wave 4 prod |
| Quick Edit | **SHIPPED / ACCEPTANCE PARTIAL** | #293; A–F pending | RG-007 |
| Advanced Show Edit | **PASS (code)** | on-card Advanced | — |
| Publish | **CODE STRONG / CONFIG PINNED** | Snapshot pins in Wave 0 | RG-002 live verify |
| Live Store | **CODE STRONG / COHORT MISSING** | `/s/:slug`; Herbal Head Spa API fact | RG-004 |
| Commercial CTA | **MIXED** | Quote OK; Book degraded; Buy placeholder | RG-008/009 |
| Recovery | **PARTIAL** | OCR/research fallbacks uneven | RG-005 |
| Paid entitlement | **MISSING (platform)** | Journey Stripe only | RG-010 |

---

## Input matrix

| INPUT | CAN INTAKE? | IDENTITY? | RESEARCH? | EVIDENCE HANDOFF? | BUILD? | ON FAILURE |
|-------|-------------|-----------|-----------|-------------------|--------|------------|
| Name `HP Services` | Yes | Partial (entry PASS; full chain unproven) | If pipeline on | Continuity fields exist | Expected | Catalog noise / unresolved → clarify or sparse |
| URL `modernsecuritydoors.com.au` | Yes | Strong (Day 3/4) | Yes (MSD grounded) | Yes | Yes (preview proven) | Owner review / checkpoint |
| Description `Coffee shop in Melbourne` | Yes | Provisional | Eligible | Yes | Expected | Sparse/clarify |
| Business card | Yes (attach + extract-card) | If OCR OK | Yes | handoff + mission OCR persist | Expected | OCR_FAILED / provider → ASK_USER (not invent) |
| Ambiguous name | Intake accepts | Prefer UNRESOLVED | No wrong catalog | N/A | Sparse/clarify | ASK_USER (prove live) |
| Insufficient evidence | Yes | Clarify | No invent | N/A | Degraded honest | ASK_USER |

---

## Commercial matrix

| CAPABILITY | STATUS | PAID PROMISE SAFE? |
|------------|--------|--------------------|
| Store hosting | OPERATIONAL (code) | Yes if persist/publish proven |
| Editing | PARTIAL (acceptance) | After RG-007 |
| Services/products display | OPERATIONAL when catalog exists | Yes |
| Shows | OPERATIONAL + Advanced | Yes for metadata; creative Advanced OK |
| Booking | DEGRADED | Only with notify SOP |
| Quote / Enquire | OPERATIONAL | **Yes — primary V1 CTA** |
| Contact (tel) | DEGRADED | Yes as soft promise |
| Order / Buy | PLACEHOLDER | **No** |
| Performer assistance | OPERATIONAL for create assist | Soft; not unlimited autonomous |
| Platform subscription | MISSING | **No** until RG-010 |

---

## Payment matrix

| Item | Status |
|------|--------|
| Checkout (customer journey) | IMPLEMENTED (Stripe PaymentIntent / elements) |
| Checkout (platform plan) | MISSING / PLACEHOLDER |
| Payment persistence | IMPLEMENTED (`Payment` rows) |
| Webhook | IMPLEMENTED (succeed/fail/refund/checkout.completed) |
| Entitlement (AI credits) | PARTIAL (ledger; no self-serve top-up) |
| Failure → no false entitlement | PARTIAL for journey; N/A for plans |
| Cancellation | PARTIAL / unclear for plans |
| Support visibility | PARTIAL (activity, diagnostics, admin panels) |

---

## Recovery matrix (summary)

| Failure | Expected category | Current truth |
|---------|-------------------|---------------|
| OCR provider unavailable | FALLBACK_PROVIDER / ASK_USER | Fallback if Google on; else OCR_FAILED |
| Research timeout / no sources | DEGRADED_BUILD / ASK_USER | fallbackToGenerated + owner review (when pipeline on) |
| Ambiguous identity | ASK_USER | Fail-closed catalog; live clarify incomplete |
| Website inaccessible | DEGRADED_BUILD | Sparse / no invent offerings |
| No catalog | DEGRADED_BUILD | Honest empty/sparse |
| Build timeout | SAFE_RETRY | Task transitions; avoid orphan generating |
| Publish error | SAFE_RETRY | PUBLISH_FAILED; preserve draft |
| Payment fail (journey) | no false confirm | Payment failed; booking may stay pending_payment |
| Payment fail (plan) | N/A | No plan checkout |

---

## Feature flags / deploy pins (release checklist)

| NAME | DEFAULT IF UNSET | RISK |
|------|------------------|------|
| `ENABLE_STORE_RESEARCH_PIPELINE` | **false in production** | RG-001 |
| `PUBLISH_SNAPSHOT_V1` | false | RG-002 |
| `VITE_PUBLISH_SNAPSHOT_V1` | false | RG-002 |
| `ENABLE_GROUNDED_STORE_CREATION_V1` | false | Weak grounding |
| `ENABLE_MISSION_001_*` family | soak-dependent | Must match Mission 001 closure pins |
| `GOOGLE_CLOUD_VISION_ENABLED` | off | RG-005 |
| `ENABLE_EMAIL_VERIFICATION` | false | Publish auth policy |
| Stripe keys | blank | Journey pay + any pilot billing |
| Design Library / projection family | off in production | Renderer cutover; not Core P0 if legacy live works |

---

## Release cohort (current evidence — not a completed release run)

| Fixture / case | Depth proven | Result |
|----------------|--------------|--------|
| HP Services (name) | Entry → intelligence start | PASS entry; **FAIL full-chain evidence** |
| modernsecuritydoors.com.au | Intake → research → grounded preview | PASS preview; publish/reload **thin** |
| Coffee shop in Melbourne | Entry | PASS entry |
| Market Lane Coffee | Research offerings | Strong research; E2E blocked historically by 502 |
| Mission 001 30 fixtures | Research only | READY for Mission 001; **not** publish cohort |
| GP-01 Healing Spa | Commerce harness | Partial commercial |
| Herbal Head Spa | Public catalog after republish | Live API correct items |
| Ambiguous / insufficient | Research fail-closed | PASS honesty; clarify UX incomplete |

---

## Execution waves (P0/P1 only)

### WAVE 0 — Immediate broken-path / config truth

**Status (2026-09-04):** `WAVE_0_COMPLETE_PENDING_RENDER_SYNC` — details in `WAVE0_STORE_CREATION_RELEASE_CLOSURE.md`.

| Task | OWNER | PROBLEM | MINIMUM CHANGE | REUSE | TEST | EXIT GATE |
|------|-------|---------|----------------|-------|------|-----------|
| W0.1 Prod/staging flag pin audit | Ops + Core | Research/snapshot may be off | Document + set env pins | existing flags | Config canary | **Pins in repo**; live Render sync pending |
| W0.2 OCR fallback pin | Core OCR | Card path single-provider | Classify infra + sequential fallback | `ocrFallback.js` | Mock quota/429 | **Staging READY** (PR #339) |
| W0.3 Reveal refresh canary | Dashboard | Day 4 proof thin | Run staging canary + fix draftId extract | `golden-path-day4-staging-verify.mjs` | Refresh preview URL | **PASS** |

### WAVE 1 — Golden Path P0

**Status (2026-09-04):** `WAVE_1_PARTIAL` — see `WAVE1_STORE_CREATION_RELEASE_CANARY.md`.

| Task | OWNER | PROBLEM | MINIMUM CHANGE | REUSE | TEST | EXIT GATE |
|------|-------|---------|----------------|-------|------|-----------|
| W1.1 HP Services full-chain canary | Release | Canary incomplete | Script/manual artifact | Hardening Program | Full chain | **PASS build+preview**; publish blocked until Render snapshot pin |
| W1.2 Ambiguous/insufficient clarify proof | Intake/Research | Deferred ASK_USER | Prove one clarify question | intake policy + review card | Fixtures | **Insufficient PASS; ambiguous FAIL** |
| W1.3 Bounded cohort (~12) | Release | No publish cohort | Run matrix; fix only P0 defects found | Mission 001 fixtures | Matrix | **PARTIAL 7/12** strict |

### WAVE 2 — Publish / commercial P0

| Task | OWNER | PROBLEM | MINIMUM CHANGE | REUSE | TEST | EXIT GATE |
|------|-------|---------|----------------|-------|------|-----------|
| W2.1 Publish/republish canary | Draft/Publish | E2E thin | One + republish | publishDraftService | Reload `/s/:slug` | No duplicate |
| W2.2 Quick Edit A–F | Dashboard | PARTIAL | Acceptance + tiny fixes | websiteEditing | A–F | EDIT PASS |
| W2.3 Primary CTA honesty | Storefront | Buy dead | Hide Buy as live **or** service Quote as primary | Quote path | Service fixture | Primary CTA OPERATIONAL |
| W2.4 Mobile 390/412/430 | Dashboard | Beyond-entry thin | Smoke create/reveal/edit/publish/CTA | existing scripts | Screenshots | No P0 overflow/traps |

### WAVE 3 — Paid pilot P1

| Task | OWNER | PROBLEM | MINIMUM CHANGE | REUSE | TEST | EXIT GATE |
|------|-------|---------|----------------|-------|------|-----------|
| W3.1 Bound paid promise | Founder | Overpromise | One offer text | OPERATIONAL matrix | Copy review | READY_TO_SELL list |
| W3.2 Entitlement path | Billing | No self-serve | Manual premium/credits SOP **or** one Stripe Checkout | creditsService + Stripe | Pay/fail/webhook | Entitlement correct |
| W3.3 Support SOP | Ops | Recovery | Use missionId/draftId/diagnostics | runtime diagnostics | Tabletop | Support can answer WHERE/WHY |

### WAVE 4 — Release canary

| Task | EXIT GATE |
|------|-----------|
| Production smoke: Entry → MSD or HP → publish → Quote | CORE READY candidate |
| Paid: one test charge → entitlement → access | PAID READY candidate |
| Rollback pins documented | Safe |

---

## Proposed release success metrics (evidence-based, not 100%)

Measure separately **AUTONOMOUS_SUCCESS** vs **SUCCESS_AFTER_ONE_CLARIFICATION**.

| Metric | Suggested V1 threshold | Current evidence |
|--------|------------------------|------------------|
| Golden Path completion (create→publish) | ≥70% cohort autonomous **or** ≥85% with ≤1 clarify | **Unknown** (cohort not run) |
| Identity accuracy (no wrong business) | ≥99% / WRONG_ENTITY≈0 | Mission 001: 0% wrong entity |
| Material fact invention rate | 0% for identity/contact/pricing/catalog claims | Mission 001 false offering 0% (research) |
| Useful offering rate (eligible) | ≥80% eligible | 100% of 16 eligible |
| Build success | ≥90% when identity resolved | Unproven at publish depth |
| Persistence / reveal refresh | 100% of successful builds | Thin |
| Publish success | ≥95% of ready drafts | Thin |
| Mobile usability (P0 defects) | 0 P0 | Entry PASS; beyond PARTIAL |
| Primary CTA success (Quote for services) | ≥95% | Code OPERATIONAL; cohort thin |
| Recoverable failure rate | ≥90% failures ASK_USER/RETRY not silent | PARTIAL |

---

## Paid pilot contract candidate (founder approval required)

**READY_TO_SELL only after CORE clears + W3:**

- AI-assisted store creation from one clue  
- Hosted digital storefront (`/s/:slug`)  
- Owner Draft Preview editing (quick + Advanced Show)  
- Service/product presentation when evidence exists  
- Quote / Enquire (and Contact) as primary commercial actions  
- Human-assisted recovery during pilot  

**NOT_READY_TO_SELL:**

- Retail Buy/Order checkout  
- Full CRM / social / marketplace  
- Unlimited autonomous Performer  
- Guaranteed catalog for every name-only business  

**PILOT_WITH_SUPPORT:** Book (if activity on create), research-sparse stores needing owner fill-in.

---

## Estimated release distance

**CLOSE → MODERATE**

- **Close** on architecture: entry frozen, Mission 001 fail-closed, publish idempotency coded, Quote operational, edit routing corrected.  
- **Moderate** because release is blocked by **config pins + full-chain canaries + edit acceptance + paid entitlement**, not by missing a new product surface.

Do **not** start new capability programs. Execute waves 0→4 in blocker order.
