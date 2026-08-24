# Implementation Report — Phase 1 real-user outcome activation

Date: 2026-08-17  
Verdict: **PARTIAL**  
Impact: [`IMPACT_REPORT_PHASE1_OUTCOME_ACTIVATION.md`](./IMPACT_REPORT_PHASE1_OUTCOME_ACTIVATION.md)

Not `PHASE_1_ACTIVATION_READY`: Miniweb and Digital Card can be exercised in a deployed build, but Facebook traffic must wait on production verification (this pass did not hit live cardbey.com). Loyalty and display are **not** first-traffic experiments.

---

## VERDICT: PARTIAL

A real unknown user can arrive at `/start` or a capability deep link, get a small preview/draft, and we can record what happened. They cannot yet be promised a production-verified Facebook funnel until deploy + the release-gate checklist.

---

## A. Existing capability readiness matrix

| Area | Status | Evidence |
|------|--------|----------|
| Create / Global Create launcher | **EXISTS** (heavy) | Registry + sheet; many actions go to Performer. Not outcome-first. |
| `/create` store/miniweb job | **PARTIAL** | Guest session → orchestra job → draft review. Public `/s/:slug` only after publish. |
| Mini-website / public page | **PARTIAL** | `/preview/website/:draftId`, `/w/:draftId`, `/s/:slug`. Guest draft claim on auth exists. |
| Digital / personal card | **PARTIAL** | Prisma `Card` + `buildCard` + `/doc/:id/view` + QR. Create launcher pointed at greeting cards (`/app/mi-greeting-cards`). Needs auth to persist. |
| Loyalty | **PARTIAL internally / not first-user** | `LoyaltyProgram` + stamps + rewards **require storeId**. Artifact ≠ enrolment. |
| Display / TV | **PARTIAL / not advertised as TV** | `/screens` → auth `/devices`. `/device/player` browser player. Pairing needs tenant/store. LG webOS code ≠ production TV claim. |
| QR | **EXISTS** for cards via `buildCard`; not for unclaimed guest preview |
| Auth + guest | **EXISTS** | Guest session, `GuestDraftClaimOnAuthEffect`, store claim APIs |
| Claim (discovered businesses) | **EXISTS** (separate GTM path) | Do not mix with new-user outcomes |
| Me / Library / Performer | **EXISTS** | Not the first-value path |
| Attribution | **PARTIAL** | First-party visit + UTM envelope. `ENABLE_MARKETING_ATTRIBUTION_V1` **defaults OFF**, so visit writes often no-op |
| A/B infra | **NOT IMPLEMENTED** for messaging | Discovery A/B retired. This phase uses `msg=minutes\|shareable` only |
| Feature flags | Marketing operator / live Meta **OFF** by default | Correct — not enabled here |

---

## B. Recommended first real-user experiment

**Miniweb** (`/create?capability=miniweb` or Facebook → that URL).

Shortest path to a useful result: name + type → guest draft → review/preview URL. Reuses store/public-page infrastructure. Does not auto-publish or index.

## C. Recommended second experiment

**Digital card** (`/start/card`).

Local preview (no public index) → Save → sign-in → `POST /api/cards/from-activation` → `Card` row + share URL + QR. Never creates a `Business`.

**Do not Facebook-advertise** loyalty or display yet.

---

## D. User journeys

### Miniweb
Arrive (UTM) → `/create?capability=miniweb` → minimum fields → generate → draft review (useful result) → Save/sign-in claims guest draft → optional next: digital card / display (honest) / publish later (governed).

### Digital card
Arrive → `/start/card` → name/role/contact → on-device preview → Save my card → signup (`returnTo=/start/card`) → persist Card → share `/card/:id/view` (not marketplace).

### Loyalty (truth page only)
Copy: stamps need a store → CTA Create a miniweb first.

### Display (truth page only)
Copy: browser player + signed-in pairing; not every TV; LG webOS not a first-user experiment → CTA Create a miniweb first.

---

## E. Reused architecture

- `/create` + `startCreateCapability` / `quickStartCreateJob` / guest store claim
- `buildCard` + public `/card/:id/view` → `/doc/:id/view`
- First-party attribution session + `MarketingVisitCapture`
- Control Center `/control-center/funnel` (extra labeled section)
- Marketing layout, i18n merge pattern, guest session
- Global Create sheet **unchanged** (avoid regressing existing users)

---

## F. New code / schema

- **No Prisma migration**
- JSON sidecar `apps/core/cardbey-core/data/activation/events.json` (gitignored)
- Public `POST /api/public/activation/events`
- Admin `GET /api/admin/activation/funnel`
- `POST /api/cards/from-activation` (auth; Card only)
- Pages: `/start`, `/start/card`, `/start/loyalty`, `/start/display`

---

## G. Attribution / event model

Envelope (session, first landing wins): source, channel, campaign, content, language, country (**only if `?country=XX`**), entry capability, anonymous viewer key, user id after auth (not sent on public event), timestamps.

Events (actual states only):  
`QUICK_START_VIEWED` → `CAPABILITY_SELECTED` → `CAPABILITY_STARTED` → `FIRST_RESULT_CREATED` → `PREVIEW_VIEWED` → `AUTH_STARTED` → `CLAIM_COMPLETED` → `RESULT_PUBLISHED` / `RESULT_SHARED` (only when those actions exist) → `NEXT_CAPABILITY_SELECTED` → `RETURN_VISIT`

Deduped 30 minutes per anonymousId + event + capability + path. No PII. Independent of Meta flags.

Click ≠ activation. Draft preview ≠ published. Signup ≠ useful outcome. Claim ≠ paid.

---

## H. EN / VI

`src/i18n/outcomeActivationResources.js` — outcome Vietnamese, not mechanical calque.

---

## I. A/B configuration

Not a new A/B platform. Miniweb headlines:

- A (default): `?msg=minutes` — “Create your miniweb in minutes.”
- B: `?msg=shareable` — “Turn your business into a shareable miniweb.”

Measure `FIRST_RESULT_CREATED` / `CLAIM_COMPLETED` by `variant`, not CTR.

---

## J. Production verification

**Not done on live.** Before Facebook:

- [ ] Production `/start` and `/create?capability=miniweb` on mobile EN/VI
- [ ] No localhost in share/QR (`PUBLIC_BASE_URL`)
- [ ] Guest miniweb draft survives signup
- [ ] Digital card draft survives signup (`returnTo=/start/card`)
- [ ] Share URL works; card not in sitemap
- [ ] Attribution query params survive the flow
- [ ] Events dedupe; funnel section shows counts
- [ ] Recoverable errors; no console-breaking errors
- [ ] Existing `/create` and Global Create still work

---

## K. Known limitations

- Marketing visit spine still flag-gated; outcome JSON events are the reliable funnel
- Guest card QR only after save
- Card photo upload not in this slice
- Loyalty/display are interstitial honesty pages
- `buildCard` `liveUrl` uses `PUBLIC_BASE_URL` (must be production origin)
- Unclaimed card preview is device-local only

---

## L. Safe Facebook claims

- Create your miniweb in minutes. → `https://cardbey.com/create?capability=miniweb&utm_source=facebook&utm_medium=social&utm_campaign=vn_sme_activation&entry_capability=miniweb&lang=vi`
- Create your digital card. → `https://cardbey.com/start/card?utm_source=facebook&utm_medium=social&utm_campaign=vn_sme_activation&entry_capability=digital_card&lang=vi`
- What would you like to create? → `https://cardbey.com/start?...`

Optional A/B: add `&msg=shareable` on miniweb.

## M. Must NOT advertise yet

- Free tier / free TV
- Universal TV or “works on any TV” / production LG webOS
- Loyalty stamps, enrolment, redemption, analytics as a first outcome
- Discovered/scraped businesses as the user’s miniweb
- Testimonials, revenue, conversion rates
- “Published marketplace store” from the first generate click

---

## N. Tests / lint / build

| Check | Result |
|-------|--------|
| Core activationEvents + public event route | Pass (3) |
| Dashboard capabilities + Quick Start page + i18n contract (incl. new keys) | Pass |
| ESLint on new/edited activation files | No issues reported via IDE diagnostics |
| Full production `build` | **Not run** (out of scope for this slice; deploy separately) |

## O. Files changed (principal)

Core: `activationEvents.js`, public/admin routes, `cardRoutes.js` `from-activation`, `server.js`, `admin.js`, `data/activation/.gitignore`  
Dashboard: `/start*` pages, `CreatePage.tsx`, `App.jsx`, outcomeActivation lib, i18n, funnel section, footer, sitemap, `apiPaths.ts`, `MarketingVisitCapture.tsx`  
Docs: this report + impact report

## P. Next recommended experiment

After Miniweb production verification: Digital Card Facebook traffic. Then, **only if** a store exists from Miniweb, a loyalty enrolment slice that uses real `LoyaltyProgram` persistence — not a design-only card. Display remains a follow-on after content exists, worded “Try digital display”.
