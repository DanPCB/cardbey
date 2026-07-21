# Mission 1000 — Executive Audit

**Audit date:** 2026-07-21  
**Scope:** Cardbey monorepo (`apps/core/cardbey-core`, `apps/dashboard/cardbey-marketing-dashboard` submodule, `packages/`, Prisma, Render deploy config, feature flags, tests)  
**Method:** Evidence-based path tracing. A capability counts as working only when frontend → API → persistence → user outcome is connected for a real business.  
**Code modified during audit:** None.

---

## Executive summary

Cardbey already has a **strong durable core** for account creation, Performer-led store draft generation, draft → publish → public storefront (`/s/:slug`), marketplace feed, quote/booking primitives, QR, engagement events, and an in-app daily briefing builder.

It does **not** yet deliver the Mission 1000 closed loop:

1. Import in under 10 minutes (proven, durable, self-serve)  
2. Automatic credible digital presence  
3. Automatic first-week content plan  
4. First attributed customer/enquiry  
5. Credible time/money/revenue value dashboard  
6. Scheduled morning manager habit  

Many Stage 3–6 systems exist as **flag-off, memory-backed, or admin-only scaffolding**. Documentation often describes UI and durability that the checked-out code does not expose to a normal business owner.

### Overall Mission 1000 readiness: **41%**

| Scale target | Ready? | Why |
|---|---|---|
| **10 assisted pilot businesses** | **Yes, with staff** | Staff can drive Performer + draft review + publish + manual content/QR; fill gaps offline |
| **100 semi-assisted businesses** | **No** | Import resume/durability, enquiry notify loop, content pack, and recovery UX are insufficient |
| **1,000 mostly self-service** | **No** | Memory repositories, default-off flags, missing ROI, missing scheduled briefing, incomplete social publish |

---

## Readiness by stage

| Stage | Outcome | Score | Status |
|---|---|---|---|
| 0 Entry / account / onboarding | Reach first import without staff | **52%** | PARTIAL |
| 1 Import business &lt; 10 min | Usable data, &lt;20 corrections | **38%** | PARTIAL → BLOCKED for claim |
| 2 Digital presence automatically | Publish credible presence in 5 min | **68%** | WORKING core / PARTIAL polish |
| 3 First week of content | 7-day plan approve &lt; 15 min | **28%** | PARTIAL tools / MISSING plan |
| 4 First customer / enquiry | Launch + attribute conversion | **38%** | PARTIAL |
| 5 Time / money / revenue | Credible value dashboard | **12%** | MISSING / SCAFFOLDED |
| 6 Morning manager | Useful daily briefing + action | **28%** | PARTIAL (in-app only) |

Weights used for overall: Stage1 25%, Stage2 20%, Stage4 15%, Stage3 15%, Stage0 10%, Stage5 10%, Stage6 5%.

---

## Strongest working capabilities

1. **Auth + guest → claim draft** — Prisma `User`, `/api/auth/*`, guest draft claim (`POST /api/draft-store/claim`).
2. **Performer store creation runway** — `POST /api/performer/store-creation/from-discovery` → `runUnifiedStoreCreationFromDiscovery` → MissionPipeline → `DraftStore`.
3. **Draft generate / review / publish / public slug** — `DraftStore` → `Business` + `Product`; public `/s/:slug`, `/store/:slug`; QR via `DynamicQr` + `/q/:code`.
4. **Marketplace / public feed** — Prisma-backed public stores; Living Canvas / PublicFeedShell.
5. **Store engagement instrumentation** — `StoreActivityEvent`, `StoreEngagementSnapshot`, lifecycle + inquiry hooks.
6. **In-app daily briefing (deterministic)** — `buildDailyBusinessBriefing` + PIL surfaces (session/open-app, not scheduled push).
7. **Quote request + owner list** — public submit + owner routes; emits inquiry activity.
8. **Vietnamese UI strings (partial)** — dashboard `i18n` en/vi resources exist for several surfaces.

---

## Biggest blockers

1. **Business Import Kernel is not production-durable by default** — snapshots `memory://`, Studio sessions in-memory, Studio execute sets `persistToDraftStore: false`, DraftStore adapter behind `ENABLE_BUSINESS_IMPORT_DRAFTSTORE_ADAPTER_V1`.
2. **Business Import Studio UI is absent** as an SME product; **legacy intents are normalized to Performer** (2026-07-21 cleanup). Core no longer emits `navigateTo: /app/business-import-studio`. Studio HTTP API / Kernel / `discoveryInputs` remain for backend use. See `docs/mission-1000/BUSINESS_STUDIO_PERFORMER_RELATIONSHIP_AUDIT.md`.
3. **No automatic 7-day content plan** grounded on import — single tools (poster/video/campaign) exist; Creator Production / Content Graph default **off** + often memory.
4. **No owner-facing ROI / time-saved dashboard** — engagement counts exist; value formulas and merchant confirmation do not.
5. **First-customer loop incomplete** — quote/booking durable, but reliable owner notification (email/push), response workspace, and Cardbey attribution are weak; Discovery Intelligence Panel V2 default **off** and memory-backed.
6. **Morning manager is pull-only** — briefing builder works; `REPORT_SCHEDULER` / discovery cron largely off; no daily email/push habit.

---

## Top five risks

1. **False readiness from docs/flags** — large completion/impact reports describe Studio, Prisma paths, and panels that are flag-off or UI-missing → pilots sold on capabilities that 404 or reset on restart.
2. **Multi-instance data loss** — in-memory Kernel / Studio / Discovery Intelligence / Creator Identity (default) break under horizontal scale and redeploys.
3. **Role confusion** — business owner, creator, customer, and admin surfaces coexist without a clear first-run chooser; creators and SMEs share overlapping language.
4. **Video/provider cost & availability** — Kling/OpenAI video gated on unset provider keys; Render skips transcode (`VIDEO_UPLOAD_SKIP_TRANSCODE=true`) → quality/compatibility variance.
5. **Attribution and ROI inflation** — if value claims ship without measured vs estimated vs merchant-confirmed distinctions, trust erodes with early pilots.

---

## Top five recommendations

1. **Prove one golden path for 10 pilots:** Performer discovery/import → DraftStore → review → publish → `/s/:slug` → QR → quote/booking → owner notified — instrument wall-clock and corrections; staff-assisted is OK.
2. **Make import durable without a new platform:** enable Kernel→DraftStore only on the unified Performer path; persist sessions/snapshots (Prisma or object storage); do not rebuild Studio as mandatory UI.
3. **Connect existing content tools into a “Week 1 pack” mission** (7 editable artifacts + approve) using store context — postpone Content Graph / Creator Production flag forests.
4. **Wire quote/booking → Notification + optional email** and a single “Respond” action in Performer/PIL.
5. **Ship a minimal Value card** from existing events (imports, catalog items, quotes, bookings, content created) with explicit measured/estimated labels — no causal revenue claims yet.

---

## What is genuinely working today

- Signup/login/verify (email verify infra; gate often off)
- Guest draft and claim
- Performer intake → store mission → draft
- Draft review and publish to public storefront
- Catalog products on storefront; booking/enquiry CTAs when configured
- QR codes for storefront
- Marketplace feed of public stores
- Engagement events and snapshots
- In-app business briefing when owner opens console
- Loyalty program as a **separate** mission (not auto post-import)
- Campaigns/offers/promos in-platform (external social publish mock)

## What appears implemented but is not end-to-end

| Surface | Why it fails the outcome test |
|---|---|
| Business Import Kernel | Memory snapshots; adapter/flags; Studio UI missing |
| Business Import Studio API | Mounted; default no DraftStore persist; no dashboard page |
| Discovery Intelligence Panel V2 | Flags off; memory repository |
| Creator Identity / Production / Content Graph | Migrations exist; defaults memory/off |
| Social OAuth / publish | Mock / stub |
| Video generation | Provider keys often unset → unavailable |
| ROI / time saved | No calculators or dashboard |
| Scheduled morning briefing | No cron → owner email/push |
| Facebook / Instagram / CSV SME import | Classify/admin only, not owner import |
| Welcome email | Verify/reset only |

---

## Single biggest blocker

**There is no production-proven, durable, self-serve import → publish → first-acquisition closed loop.** The choke point is Stage 1 durability and UX coherence (memory Kernel, missing Studio UI, fragmented sources, no &lt;10-minute instrumentation), which prevents credible automation of Stages 2–6 at scale.

---

## Submodule / deploy notes

| Item | Evidence |
|---|---|
| Dashboard submodule | `.gitmodules` → `apps/dashboard/cardbey-marketing-dashboard`; status `+2cd3291…` (detached / ahead of recorded commit) |
| `llama.cpp` | Present on disk; **no** `.gitmodules` mapping → submodule status error |
| Staging (Render) | Runtime kernel flags ON; `DISCOVERY_ENABLED=false`; `USE_LOYALTY_SPINE=true`; PIL briefing Vite flags ON |
| Production (Render) | Similar runtime flags; discovery cron off; video transcode skipped |

---

## Related deliverables

1. `MISSION_1000_CAPABILITY_MATRIX.md`  
2. `MISSION_1000_FLOW_TRACES.md`  
3. `MISSION_1000_GAP_BACKLOG.md`  
4. `MISSION_1000_TEST_PLAN.md`  
5. `MISSION_1000_SCORECARD.md`  
6. `MISSION_1000_90_DAY_PLAN.md`  

---

## Commands run (summary)

| Command | Result |
|---|---|
| `git submodule status` | Dashboard submodule dirty/offset; `llama.cpp` mapping fatal |
| `npx prisma validate --schema=prisma/postgres/schema.prisma` | **Fail P1012** — local `DATABASE_URL` not `postgresql://` (pre-existing env) |
| `node scripts/verify-feature-flag.js` | Menu visual agent flag ON locally |
| Kernel / unified create / briefing vitest subsets | **Pass** (8 + 4 + 10 tests) |

Failures are pre-existing environment/repo hygiene issues, not caused by this audit (no source changes).
