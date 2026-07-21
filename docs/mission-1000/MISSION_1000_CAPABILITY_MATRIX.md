# Mission 1000 — Capability Matrix

**Audit date:** 2026-07-21  
**Status legend:** A WORKING · B PARTIAL · C SCAFFOLDED · D MISSING · E BLOCKED  
**Production readiness / User outcome readiness:** 0–5

Confidence: H high · M medium · L low

---

## Stage 0 — Entry, account, onboarding

| Capability | Status | Conf | Prod | User | Evidence | Flag / config | Main blocker | Next action |
|---|---|---|---|---|---|---|---|---|
| Discover registration path | B | H | 3 | 3 | `/signup`, `/login` in `App.jsx`; marketing entry uneven | — | Value prop vs creator/marketplace confusion | Single “Start my business” CTA → Performer |
| Create account | A | H | 4 | 4 | `routes/auth.js`, `authService.js`, Prisma `User` | rate limits | — | Keep; add post-signup role intent |
| Verify identity (email) | B | H | 3 | 2 | verify templates; `ENABLE_EMAIL_VERIFICATION` default false in `.env.example` | `ENABLE_EMAIL_VERIFICATION`, `VITE_EMAIL_VERIFICATION_GATE` | Gate often off | Enable on staging for pilots |
| Guest → claim draft | A | H | 4 | 4 | `POST /api/draft-store/claim`, `useGuestDraft` | — | Edge claim races | Smoke in pilot checklist |
| Role assignment (business vs creator) | B | H | 2 | 2 | Register forces `roles:["viewer"]`; Creator separate model/routes | promote script CLI | No self-serve chooser | Explicit first-run intent: business / creator / browse |
| Workspace / store create | A | H | 4 | 4 | Performer `create_store`, from-discovery, DraftStore | — | — | Default entry = Performer |
| Onboarding state machine | B | H | 2 | 2 | `User.onboarding`, `OnboardingProgress`, Business Builder `/onboarding/business`, sessionStorage next-step | — | Multiple SOTs | Prefer Performer progress; demote wizard to advanced |
| Resume interrupted onboarding | B | M | 2 | 2 | Mission resume flags mostly off in `.env.example`; draft IDs durable | `ENABLE_RUNTIME_MISSION_RESUME` default false | Resume fragmented | Enable mission resume on staging |
| Progress / remaining steps | B | M | 2 | 2 | OnboardingProgress API; post-launch welcome | — | Not one progress UX | Inline Performer checklist |
| Welcome email | D | H | 0 | 0 | Only verify/reset templates | SMTP | Missing | Optional post-publish email for pilots |
| Empty states | B | M | 3 | 3 | Feed EmptyState; store empty catalog UX varies | — | Generic after import | Completeness checklist post-publish |
| Mobile first-run | B | M | 3 | 3 | PWA/install; Performer composer mobile | — | Wizard vs chat | Prefer chat on mobile |
| Analytics (signup) | B | M | 2 | 2 | Auth events uneven; PIL instrumentation exists | — | Incomplete funnel | Instrument signup→first_import |
| Support escalation | C | L | 1 | 1 | No dedicated owner support path found | — | Missing | Pilot Slack/email runbook |

**Stage 0 required outcome:** Owner reaches first import without staff → **PARTIAL** (possible via Performer if guided; confusing alone).

---

## Stage 1 — Import &lt; 10 minutes

| Capability | Status | Conf | Prod | User | Evidence | Flag / config | Main blocker | Next action |
|---|---|---|---|---|---|---|---|---|
| URL / website import | B | H | 2 | 3 | Kernel acquisition + semantic/jsonLd; unified from-discovery | `ENABLE_BUSINESS_IMPORT_KERNEL_V1` | Memory snapshots | Persist snapshots; time the path |
| Manual / text profile | A | H | 3 | 4 | owner intake → create_store | — | Manual typing volume | Prefer URL/Places first |
| PDF menu | B | H | 2 | 2 | `pdfAdapter.js` + tests | Kernel flag | Not proven E2E timing | Fixture menus + wall-clock |
| Image / OCR / camera | B | H | 3 | 3 | visual adapter; `/api/menu/configure-from-photo`; vision camera | Menu visual agent | Parallel stacks | One path through Performer |
| Google Business / Places | B | H | 2 | 2 | `businessDiscoverySources`; `/discover-business` | `GOOGLE_PLACES_API_KEY`; file-backed candidates | Not Kernel graph | Bridge Places → from-discovery |
| Facebook page | C | H | 1 | 0 | URL classify / trust scores | — | No live acquirer | Defer |
| Instagram profile | C | H | 1 | 0 | Future-marked | — | No live acquirer | Defer |
| CSV | B | H | 2 | 0 | `/api/discovery-engine/csv` admin | admin auth | Not SME path | Defer for Mission 1000 |
| Multi-file / drag-drop | B | M | 2 | 2 | Upload endpoints exist; Studio UI missing | — | Studio UI gone | Performer attachments only |
| Business Import Kernel (full) | B/E | H | 1 | 2 | `lib/businessImportKernel/**` | Kernel + DraftStore adapter flags | Memory + flags | Durable persist on Performer path |
| Studio sessions | E | H | 1 | 0 | `businessImportStudio/sessionStore.js`; routes mounted | execute `persistToDraftStore:false` | Memory + no UI | Do not require Studio for pilots |
| DraftStore adapter | C | H | 1 | 1 | `draftStoreAdapter.js` | `ENABLE_BUSINESS_IMPORT_DRAFTSTORE_ADAPTER_V1` | Off by default | Enable only with Kernel on staging |
| Identity / reconcile / project | B | H | 2 | 2 | phase tests green | Kernel | Memory graph | Persist graph or skip to draft |
| Provenance / confidence | B | H | 2 | 2 | Kernel claims/trust | — | Weak owner UX | Surface low-confidence in review |
| Resume partial import | C | M | 1 | 1 | Mission resume flags off | runtime resume flags | Not durable | Persist import job |
| Timing instrumentation (&lt;10 min) | D | H | 0 | 0 | adapter `durationMs` only | — | No SLO | Add import_started/completed events |
| Idempotent apply / re-import | B | M | 2 | 2 | Draft fingerprints; publish paths | — | Live mutate risk | Guard re-import vs live Business |
| Variants / duration options | B | M | 2 | 2 | catalog compiler / typed catalog non-prod defaults | `ENABLE_TYPED_CATALOG_COMPILER` | Uneven | Beauty persona fixtures |
| Section/header filtering | B | M | 2 | 2 | extraction tests | — | Menu noise | Golden menu fixtures |

**Stage 1 required outcome:** Representative business &lt;10 min, &lt;20 corrections → **NOT MET** (unproven; durability gaps).

**Estimates from code structure (not production telemetry):**

| Metric | Estimate |
|---|---|
| Happy-path user actions (Performer + review + publish) | ~8–15 if discovery clean |
| Happy-path duration | 5–20 min depending on OCR/URL quality |
| Max likely duration | 45+ min with bad PDF / retries |
| Manual corrections | Highly variable; no median instrumentation |
| Stick points | Studio 404, OCR fail, empty catalog, publish gate, role confusion |

---

## Stage 2 — Digital presence

| Capability | Status | Conf | Prod | User | Evidence | Flag / config | Main blocker | Next action |
|---|---|---|---|---|---|---|---|---|
| Business profile fields | A | H | 4 | 4 | Prisma `Business` brand/hero/CTA | — | — | Auto-fill from import |
| Storefront public URL | A | H | 5 | 5 | `/s/:slug`, `GET /api/public/stores/:slug` | — | — | Deep-link after publish |
| Logo / brand colours / hero | A | H | 4 | 4 | hero resolvers; publish pipeline tests | — | Missing media → empty | Completeness gate |
| Catalog / menu live | A | H | 4 | 4 | Product rows; repair-catalog | — | Extraction quality | — |
| Product/service pages | B | H | 3 | 3 | storefront commerce shell | V2 grid flags | Detail depth varies | — |
| Booking / enquiry CTAs | B | H | 3 | 3 | BookingDrawer, quote-requests | transactionMode | Mode misconfig | Default enquiry for services |
| Offers / promos | B | H | 3 | 2 | promo models + routes | — | Manual create | Optional Week-1 offer |
| Loyalty after import | D | H | 2 | 1 | Loyalty separate mission | `USE_LOYALTY_SPINE` staging true | Not auto-attached | Suggest, don’t auto |
| QR | A | H | 4 | 4 | `DynamicQr`, `/q/:code` | — | — | Auto-create on publish |
| Social links | B | M | 2 | 2 | profile fields | — | Often empty | Import from Places/site |
| SEO / OG / structured data | B | H | 1 | 1 | title helpers; weak OG | — | Underbuilt | Add storefront meta |
| Discovery profile | B | H | 2 | 2 | marketplace listing | DI panel off | DI memory | Prefer marketplace |
| Gallery / media | B | H | 3 | 3 | media library; hero video | transcode skip on Render | Playback variance | Poster fallbacks |
| Hero video playback | B | H | 3 | 3 | HeroMediaBackground; public media token | `VIDEO_UPLOAD_SKIP_TRANSCODE` | Codec issues | Ensure poster |
| Analytics on storefront | B | H | 3 | 2 | engagement attach | — | — | Funnel events |
| Consent / privacy | B | M | 2 | 2 | partial | — | Incomplete | Pilot checklist |
| Publish confirmation governance | A | H | 4 | 4 | safe execution / autonomy rules | — | — | Keep Level 3+ confirm |

**Stage 2 required outcome:** Credible presence within 5 min of import → **PARTIAL** (publish works; completeness not automatic).

---

## Stage 3 — First week of content

| Capability | Status | Conf | Prod | User | Evidence | Flag / config | Main blocker | Next action |
|---|---|---|---|---|---|---|---|---|
| Single poster generation | B | H | 3 | 3 | `generate_poster` tool | — | Stock images | Include in Week-1 pack |
| Social post copy | B | H | 3 | 2 | `generate_social_posts` | — | Not scheduled | Pack day slots |
| Video generation | B/E | H | 1 | 1 | Kling/OpenAI/mock | `VIDEO_GENERATION_PROVIDER`, KLING_* | Keys unset | Mock OK for pilots; real optional |
| Creative Factory V1 | B | H | 3 | 2 | factory runtime | `ENABLE_CREATIVE_FACTORY_V1=true` example | V2–V4 off | Use V1 only |
| Creator Studio CRUD | B | H | 3 | 2 | `/creator-studio`, CreatorContent | — | Creator≠SME path | Don’t force SME into Creator |
| Creator Production Runtime | C | H | 1 | 1 | `lib/creator/production` | all production flags default false | Fixtures/memory | Postpone |
| Content Graph | C | H | 1 | 0 | `lib/contentGraph` | `ENABLE_CONTENT_GRAPH_V1` false | Memory | Postpone |
| Campaign schedule | B | H | 3 | 2 | CampaignV2 + schedule items | `FLAG_CAMPAIGNS_V2` often off | External publish mock | In-app calendar OK |
| Publishing queue | A | H | 4 | 2 | admin creator publishing | — | Admin, not owner week pack | Reuse patterns for SME approve |
| Lifecycle → content | C | H | 1 | 1 | lifecycle → StoreActivityEvent only | — | No content bridge | Event→Week-1 job later |
| Social publish integrations | C | H | 0 | 0 | mock social routes | — | Fake | Manual share links for pilots |
| **7-day auto content plan** | D | H | 0 | 0 | fragments only | — | Missing orchestrator | Build thin Week-1 mission |

**Stage 3 required outcome:** 7 days editable branded content &lt;15 min approve → **NOT MET**.

---

## Stage 4 — First customer / enquiry

| Capability | Status | Conf | Prod | User | Evidence | Flag / config | Main blocker | Next action |
|---|---|---|---|---|---|---|---|---|
| Marketplace discovery | A | H | 4 | 3 | PublicFeedShell | — | Ranking quality | Ensure new stores appear |
| Discovery Intelligence Panel | C | H | 1 | 1 | `discoveryIntelligence/**` | `ENABLE_DISCOVERY_INTELLIGENCE_PANEL_V2` false; memory | Flags + memory | Keep off until Prisma |
| Business search | B | M | 3 | 3 | `/api/discovery`, explore | staging DISCOVERY_ENABLED false | Cron off | Manual listing OK |
| QR journey | B | H | 3 | 3 | journeys + qr analytics | — | Weak attribution | Instrument qr→quote |
| Campaign funnel | B | H | 2 | 2 | campaigns + reports | — | External delivery weak | In-app + share |
| Offers / coupons | B | H | 3 | 2 | models/routes | — | — | One launch offer |
| Loyalty acquisition | B | H | 3 | 2 | loyalty APIs | USE_LOYALTY_SPINE staging true | Separate from import | Optional Week-1 |
| Quote / lead form | B | H | 3 | 3 | public quote-requests; StoreLead growth | — | Notify weak | Email/Notification |
| Booking | B | H | 3 | 3 | Booking model + routes | Stripe optional | Payment optional | Enquiry-first for tradies |
| Checkout / Stripe | B/E | H | 2 | 2 | paymentRoutes; env keys | STRIPE_* | Secrets | Enable per pilot |
| Merchant response UX | B | M | 2 | 2 | owner quote PATCH; growth center | — | No inbox habit | Performer “Respond” card |
| Owner notification | B | M | 2 | 1 | Notification model; sparse producers | SMTP | Unreliable push | Wire quote→notify+email |
| Messaging inbox | D | M | 0 | 0 | Performer chat ≠ customer inbox | — | Missing | Defer; use quote status |
| Attribution to Cardbey | C | H | 1 | 1 | counters; no claim flow | — | Missing | Touchpoint IDs + merchant confirm |
| recentActivity public | A | H | 4 | 3 | attachPublicStoreAwarenessSignals | — | — | Keep |

**Stage 4 required outcome:** Launch path + detect first enquiry → **PARTIAL** (possible; attribution/notify incomplete).

---

## Stage 5 — Time / money / revenue

| Capability | Status | Conf | Prod | User | Evidence | Flag / config | Main blocker | Next action |
|---|---|---|---|---|---|---|---|---|
| StoreActivityEvent | A | H | 4 | 2 | engagement services | — | Not ROI | Feed Value card |
| Engagement snapshot | A | H | 4 | 2 | snapshot service | — | — | — |
| Campaign reports | B | H | 3 | 2 | CampaignReport | REPORT_SCHEDULER often off | — | — |
| QR counts | B | H | 3 | 2 | qrScansCount / intents | — | — | — |
| Growth dashboards | B | H | 3 | 2 | BusinessGrowthCenter | — | No $ value | Add Value section |
| Analytics trackEvent | C | H | 1 | 1 | console stub in analytics.js | — | Stub | Real sink later |
| Time saved formulas | D | H | 0 | 0 | none | — | Missing | Baseline vs assisted duration |
| Revenue attribution | D | H | 0 | 0 | docs avoid causal claims | — | Missing | Merchant-confirm only |
| Value dashboard UX | D | H | 0 | 0 | none | — | Missing | Minimal card |

**Metric classification cheat sheet:**

| Metric | Class |
|---|---|
| Quote/booking counts | Directly measured |
| Catalog items created | Directly measured |
| Content artifacts created | Directly measured (when tool succeeds) |
| Store visits / QR scans | Directly measured (engagement) |
| Time saved | Unsupported today → proposed derived |
| Labour $ | Estimated (needs hourly rate) |
| Direct revenue | Unsupported without payment attribution |
| Influenced revenue | Merchant confirmed (missing flow) |
| Software savings | Merchant confirmed (missing flow) |

**Stage 5 required outcome:** Credible value dashboard → **NOT MET**.

---

## Stage 6 — Morning manager

| Capability | Status | Conf | Prod | User | Evidence | Flag / config | Main blocker | Next action |
|---|---|---|---|---|---|---|---|---|
| Daily briefing builder | A | H | 3 | 3 | `businessBriefingBuilder.ts` + tests | VITE_INTELLIGENCE_SURFACE_BRIEFING staging true | Pull-only | Keep as core |
| Suggested actions | B | H | 3 | 3 | opportunities + PIL handoffs | autoSubmit false | Snapshot quality | Improve data inputs |
| Quiet hours | C | M | 1 | 1 | localStorage timing | — | Client-only | Server prefs later |
| Email briefing | D | H | 0 | 0 | SMTP exists; not wired | — | Missing | Cron + email Phase B |
| Push | D | L | 0 | 0 | narrow order push | — | Missing | Defer |
| In-app notifications | B | H | 2 | 2 | `/api/notifications` | — | Sparse producers | Quote wiring |
| Scheduler / cron | B | H | 1 | 1 | reportScheduler default false; discovery cron off | REPORT_SCHEDULER_ENABLED | Off | Enable briefing job |

**Stage 6 required outcome:** One useful daily briefing + action → **PARTIAL** (in-app only).

---

## Cross-cutting

| Area | Status | Conf | Prod | Notes |
|---|---|---|---|---|
| Canonical business context | B | H | 2 | Business/DraftStore durable; Kernel memory; Creator parallel |
| Mission orchestration / idempotency | B | H | 2 | Strong for store missions; many runtime flags off in example |
| Persistence for new systems | E/C | H | 1 | Memory defaults for Kernel/DI/Creator Identity/Production/Content Graph |
| Tenant isolation | B | H | 3 | Store ownership checks common; upload/SSRF need ongoing audit |
| Observability | B | M | 2 | Structured logs uneven; engagement SSE; few SLO dashboards |
| Cost controls | B | M | 2 | Some limits; video/LLM unbounded risk |
| Testing | B | H | 3 | Strong unit/integration; weak golden E2E for Mission 1000 |

---

## Persona matrix (complete Mission 1000 journey)

| Persona | Stage0 | Stage1 | Stage2 | Stage3 | Stage4 | Stage5 | Stage6 | Journey |
|---|---|---|---|---|---|---|---|---|
| Beauty / spa (duration options, booking) | B | B | B | D | B | D | B | **Fails** Week-1 + ROI; booking partial |
| Café / restaurant (menu, hours, offers) | B | B | A/B | D | B | D | B | **Fails** import timing proof + content |
| Tradie (enquiry, portfolio, phone/QR) | B | B | B | D | B | D | B | **Partial** if enquiry+QR; no attribution |
| Retail (products, variants, loyalty) | B | B | A/B | D | B | D | B | **Fails** checkout/loyalty automation |
| Creator / indie pro | B | C | B | B | B | D | C | **Parallel product**; not SME Mission 1000 |
| Vietnamese seller → AU | B | B | B | D | B | D | B | **Partial UI i18n**; ops/compliance gaps |

**None of the six personas complete the full Mission 1000 journey without staff assistance today.**
