# Mission 1000 — Gap Backlog

**Audit date:** 2026-07-21  
**Rule:** Prefer connecting existing systems over new platforms.

Size: XS &lt;1d · S 1–3d · M 1–2w · L 2–4w · XL &gt;4w

---

## P0 — Blocks a real pilot (10 assisted)

### P0-01 Prove and instrument golden path Import→Publish→QR→Quote
- **Customer problem:** Staff cannot know if a pilot business finishes in &lt;10 minutes or where they stall.
- **Stage:** 1–4
- **Evidence:** from-discovery + DraftStore + publish + quote exist; no wall-clock SLO events.
- **Proposed:** Emit `mission1000.import_started|import_completed|publish_completed|first_enquiry` with durations and correction counts; runbook for assisted pilots.
- **Likely files:** `runUnifiedStoreCreationFromDiscovery.js`, `publishDraftService.js`, `quoteRequestService.js`, dashboard Performer telemetry
- **Dependencies:** None
- **Migrations:** Optional event table or reuse StoreActivityEvent / PilEvent
- **Security:** Tenant-scoped events only
- **Analytics:** Required (definitions in scorecard)
- **Tests:** E2E golden path smoke
- **Acceptance:** 3 internal dry-runs with recorded timings; dashboard shows duration
- **Size:** S
- **Sequence:** 1

### P0-02 Remove / guard dead Business Import Studio navigation
- **Customer problem:** Explicit Studio phrases produced a dead handoff (`open_business_discovery_studio` / `/app/business-import-studio`); Intake V2 fell through to “I'm not sure how to help.”
- **Stage:** 1
- **Evidence:** Fixed 2026-07-21 — Core maps to Performer `create_store` / draft resume; FE normalizes legacy payloads. See `BUSINESS_STUDIO_PERFORMER_RELATIONSHIP_AUDIT.md`.
- **Status:** **DONE (compat cleanup)** — Studio SME UI not restored; API/Kernel retained.
- **Proposed:** ~~Route all SME flows through Performer~~ Completed.
- **Likely files:** `businessDiscoveryRouting.js`, `performerIntakeV2Routes.js`, `normalizeLegacyBusinessDiscoveryIntake.ts`, `useIntakeV2.ts`
- **Acceptance:** No Core `navigateTo` to `/app/business-import-studio`; actionable Performer response; draft resume opens StoreDraftReview.
- **Size:** XS
- **Sequence:** 2

### P0-03 Durable import session on Performer path only
- **Customer problem:** Kernel evidence lost on restart; multi-instance unsafe.
- **Stage:** 1
- **Evidence:** `snapshotStore.js` memory://; Studio sessions memory
- **Proposed:** Persist acquisition snapshots + import job status to Prisma or object storage for the unified Performer path; leave Studio memory unless needed
- **Likely files:** `businessImportKernel/sources/snapshotStore.js`, enrich capability, DraftStore adapter
- **Dependencies:** P0-01
- **Migrations:** Yes (ImportJob / Snapshot refs) if not reusing DraftStore metadata
- **Security:** SSRF policy retained; tenant isolation; signed storage URLs
- **Analytics:** import job status
- **Tests:** restart mid-import resume
- **Acceptance:** Redeploy does not lose in-flight Performer import; resume works
- **Size:** M
- **Sequence:** 3

### P0-04 Owner notification on quote/booking
- **Customer problem:** First enquiry can sit unseen.
- **Stage:** 4, 6
- **Evidence:** `emitCustomerInquiryActivity` without reliable email fanout
- **Proposed:** On quote create → Prisma Notification + optional SMTP email with deep link to respond in Performer/growth
- **Likely files:** `quoteRequestService.js`, `mailer.js`, notifications routes, PIL briefing inputs
- **Dependencies:** SMTP configured on staging/prod
- **Migrations:** None if Notification model sufficient
- **Security:** No PII in email subject; authz on deep links
- **Analytics:** `enquiry_notified`, `enquiry_opened`
- **Tests:** unit + mailer mock
- **Acceptance:** Pilot owners receive notify within 1 minute of test enquiry
- **Size:** S
- **Sequence:** 4

### P0-05 Post-publish completeness checklist (auto presence)
- **Customer problem:** Published store can look empty (no hero, hours, CTA).
- **Stage:** 2
- **Evidence:** Publish works; completeness not gated
- **Proposed:** After publish, Performer shows checklist (logo, hero, hours, ≥3 catalog items, CTA, QR) with one-tap fixes; block “share publicly” until minimum bar or explicit override
- **Likely files:** `storeLaunchOnboarding.js`, publish response enrichment, briefing markers
- **Dependencies:** P0-01
- **Migrations:** None
- **Security:** Publish still Level 3 confirm
- **Analytics:** completeness_score
- **Tests:** fixture empty vs complete
- **Acceptance:** New pilot store never shared empty without override
- **Size:** S
- **Sequence:** 5

### P0-06 First-run role clarity (business vs browse vs creator)
- **Customer problem:** Owners land in creator/marketplace mental model.
- **Stage:** 0
- **Evidence:** Separate creator routes; register viewer role
- **Proposed:** After signup, one choice card: “Run my business” → Performer onboarding; “Explore” → feed; “Creator” → creator path
- **Likely files:** Signup success, ConsoleCentreColumn, postProfileNextStep
- **Dependencies:** None
- **Migrations:** Optional User.onboarding.intent
- **Security:** None special
- **Analytics:** role_intent_selected
- **Tests:** routing
- **Acceptance:** Business intent never auto-opens Creator Studio
- **Size:** S
- **Sequence:** 6

---

## P1 — Required before 100 businesses

### P1-01 Week-1 content pack mission
- **Customer problem:** No automatic 7-day plan.
- **Stage:** 3
- **Evidence:** Tools exist; no orchestrator
- **Proposed:** Single mission `week1_content_pack` generates 7 editable items (intro, highlight, offer, trust, edu, BTS, CTA) from Business+catalog; approve/regenerate per item; store as drafts/campaign schedule; **no** Content Graph required
- **Likely files:** toolRegistry, factoryRuntime, campaign schedule, Performer cards
- **Dependencies:** Published store with catalog
- **Migrations:** Optional ContentPlan table
- **Security:** Safe execution confirm before external publish; in-app drafts Level 1–2
- **Analytics:** week1_generated, week1_approved
- **Tests:** fixture beauty + café
- **Acceptance:** Owner approves plan &lt;15 min in assisted test
- **Size:** L
- **Sequence:** 7

### P1-02 Kernel→DraftStore on staging for URL/PDF happy path
- **Customer problem:** Enrichment quality unused.
- **Stage:** 1
- **Evidence:** adapter flag off; Studio persist false
- **Proposed:** Enable Kernel + DraftStore adapter on staging for from-discovery only; measure correction counts
- **Likely files:** flags, draftStoreAdapter, enrich
- **Dependencies:** P0-03
- **Migrations:** As needed for jobs
- **Security:** Upload limits; prompt-injection sanitization on extracted text
- **Analytics:** enrich_used, enrich_failed
- **Tests:** phase5 + E2E
- **Acceptance:** 5 real menus/URLs → usable draft with &lt;20 corrections median
- **Size:** M
- **Sequence:** 8

### P1-03 Enquiry response workspace in Performer
- **Customer problem:** Owners hunt Growth Center / APIs.
- **Stage:** 4
- **Evidence:** Owner quote PATCH exists
- **Proposed:** Inline “New enquiry” card with reply/status; update quote; optional template reply
- **Likely files:** PIL briefing, quote owner routes, Console cards
- **Dependencies:** P0-04
- **Migrations:** None
- **Security:** Owner-only
- **Analytics:** enquiry_responded_ms
- **Tests:** UI + API
- **Acceptance:** Response without leaving Performer
- **Size:** M
- **Sequence:** 9

### P1-04 Minimal Value card (measured only)
- **Customer problem:** No proof Cardbey helped.
- **Stage:** 5
- **Evidence:** engagement + quotes exist
- **Proposed:** Card showing measured counts + optional estimated time saved = (baseline − assisted) × rate; **no** attributed revenue until confirm flow
- **Likely files:** growth pages, engagement snapshot, new `valueSummary` service
- **Dependencies:** P0-01 events
- **Migrations:** Optional baseline config per store
- **Security:** Tenant isolation; no cross-store leaks
- **Analytics:** value_card_viewed
- **Tests:** formula unit tests
- **Acceptance:** Labels show Measured vs Estimated
- **Size:** M
- **Sequence:** 10

### P1-05 Storefront SEO basics
- **Customer problem:** Shared links look blank; weak Google discovery.
- **Stage:** 2, 4
- **Evidence:** title-only
- **Proposed:** OG title/description/image for `/s/:slug`; basic JSON-LD LocalBusiness
- **Likely files:** public storefront renderer, meta helpers
- **Dependencies:** hero/logo completeness
- **Migrations:** None
- **Security:** Escape user content
- **Analytics:** share_preview_hit
- **Tests:** meta snapshot
- **Acceptance:** Slack/iMessage preview shows name+image
- **Size:** S
- **Sequence:** 11

### P1-06 Mission resume defaults for pilots
- **Customer problem:** Interrupted sessions restart cold.
- **Stage:** 0–1
- **Evidence:** resume flags default false in `.env.example`
- **Proposed:** Enable runtime session rehydration + mission resume on staging; document rollback
- **Likely files:** render.yaml, `.env.example`, runtime flags
- **Dependencies:** Staging soak
- **Migrations:** None
- **Security:** Session binding
- **Analytics:** resume_success
- **Tests:** existing runtime tests
- **Acceptance:** Refresh mid-mission continues
- **Size:** S
- **Sequence:** 12

### P1-07 Places → from-discovery bridge
- **Customer problem:** `/discover-business` and Kernel/Performer diverge.
- **Stage:** 1
- **Evidence:** file-backed candidates vs unified API
- **Proposed:** Selecting a Places result posts to from-discovery with structured ownerIntake
- **Likely files:** BusinessDiscoveryPage, from-discovery client
- **Dependencies:** GOOGLE_PLACES_API_KEY
- **Migrations:** None
- **Security:** Do not trust Places blindly; show confirm
- **Analytics:** places_selected
- **Tests:** contract
- **Acceptance:** One click from Places to draft mission
- **Size:** S
- **Sequence:** 13

---

## P2 — Required before 1,000 businesses

### P2-01 Scheduled morning briefing email
- **Stage:** 6 — Cron using `buildDailyBusinessBriefing` inputs; timezone + quiet hours server-side
- **Size:** M · Sequence: 14

### P2-02 Discovery Intelligence Prisma path (or kill feature)
- **Stage:** 4 — Either finish durable projections or keep flag off permanently for Marketplace-only
- **Size:** L · Sequence: 15

### P2-03 Creator Identity/Production Prisma only if creator GTM
- **Stage:** 3 — Do not block SME Mission 1000; enable durability only for creator product track
- **Size:** L · Sequence: 16

### P2-04 Merchant-confirmed influenced revenue
- **Stage:** 5 — “Did this enquiry become a sale?” confirm → influenced revenue
- **Size:** M · Sequence: 17

### P2-05 Real social publishing (optional)
- **Stage:** 3–4 — Replace mock OAuth; or keep manual share forever for SME
- **Size:** XL · Sequence: 18

### P2-06 Quota/cost guards for LLM/vision/video
- **Stage:** cross — Per-tenant budgets; fail closed
- **Size:** M · Sequence: 19

### P2-07 Import source expansion (IG/FB) only after URL/PDF/Places green
- **Stage:** 1 — Defer live social scrapers
- **Size:** XL · Sequence: 20

### P2-08 Multi-persona catalog hardening
- **Stage:** 1–2 — Duration options, variants, service areas fixtures + QA
- **Size:** L · Sequence: 21

### P2-09 Vietnamese seller AU packaging
- **Stage:** 0–4 — Complete vi strings for Mission path; AUD defaults; compliance copy
- **Size:** M · Sequence: 22

---

## P3 — Valuable later

| ID | Title | Stage | Size |
|---|---|---|---|
| P3-01 | Welcome email sequence | 0 | S |
| P3-02 | Push notifications (FCM/APNs) | 6 | L |
| P3-03 | Content Graph production | 3 | XL |
| P3-04 | Full SEO schema suite | 2 | M |
| P3-05 | Automated A/B creative | 3 | XL |
| P3-06 | Software-savings confirmation wizard | 5 | S |
| P3-07 | Customer messaging inbox | 4 | XL |
| P3-08 | llama.cpp submodule hygiene | ops | XS |

---

## Explicitly do **not** build yet

1. New Intent Runtime / Broker platform rewrite for Mission 1000  
2. Mandatory Business Import Studio UI rebuild before Performer path is durable  
3. Enabling Discovery Intelligence Panel in production while memory-backed  
4. Creator Production flag forest for SME week-1 content  
5. Causal “Cardbey made you $X” without merchant confirmation  
6. Live Instagram/Facebook scrapers before URL/PDF/Places meet &lt;10 min bar  

---

## First ten backlog items (execution order)

1. P0-01 Golden path instrumentation  
2. P0-02 Dead Studio navigation guard  
3. P0-03 Durable Performer import sessions  
4. P0-04 Enquiry notification  
5. P0-05 Post-publish completeness checklist  
6. P0-06 First-run role clarity  
7. P1-01 Week-1 content pack  
8. P1-02 Kernel→DraftStore staging enablement  
9. P1-03 Enquiry response in Performer  
10. P1-04 Minimal Value card  
