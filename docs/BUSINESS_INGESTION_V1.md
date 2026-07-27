# Business Ingestion Foundation (V1)

Canonical bulk ingestion layer for discovering, normalizing, validating, deduplicating, and pre-creating Cardbey business profiles from factual data sources.

## Architecture

```
Source Adapter → Normalization → Entity Resolution → Quality Scoring → Seed Governance → Store Creation → Claim Flow
```

Location: `apps/core/cardbey-core/src/lib/businessIngestion/`

## Adapters (Phase 1)

| Adapter | Source type | Usage |
|---------|-------------|--------|
| `CsvAdapter` | `csv` | Local file or inline CSV content |
| `GoogleSheetAdapter` | `google_sheet` | Public Google Sheets CSV export URL |
| `OpenDataUrlAdapter` | `open_data_url` | JSON or CSV from a public dataset URL |

All adapters implement:

```typescript
interface BusinessFeedAdapter {
  fetch(): Promise<RawBusinessRecord[]>
}
```

Future adapters (`RegistryApiAdapter`, `LicensedFeedAdapter`, etc.) plug in without changing the pipeline.

## Pipeline

```typescript
import { OpenDataUrlAdapter, runIngestion } from './lib/businessIngestion/index.js';

const adapter = new OpenDataUrlAdapter({ url: '...', recordsPath: 'records' });
const result = await runIngestion(adapter, { persistSeeds: true, persistStores: false });
```

## Seed states

| Status | Meaning |
|--------|---------|
| `seeded_pending_qa` | Ingested, awaiting QA review |
| `seeded_claimable` | Ready for owner claim |
| `verified_owner` | Owner verified email/phone/website |
| `active` | Profile complete and active |
| `rejected` | Rejected by admin QA |
| `duplicate` | Marked or merged as duplicate |

## QA Promotion (V1.1)

Admin endpoints (super admin):

- `GET /api/business-ingestion/seeds?view=qa` — QA queue with filters
- `GET /api/business-ingestion/seeds?view=claimable` — claimable only (excludes rejected/duplicate)
- `GET /api/business-ingestion/seeds/:id` — detail + audit + provenance
- `POST /api/business-ingestion/seeds/:id/approve` — `seeded_pending_qa` → `seeded_claimable`
- `POST /api/business-ingestion/seeds/:id/reject` — → `rejected`
- `POST /api/business-ingestion/seeds/:id/mark-duplicate` — body: `{ canonicalSeedId }`
- `POST /api/business-ingestion/seeds/:id/merge` — merge into canonical
- `POST /api/business-ingestion/seeds/:id/send-back-to-review` — → `seeded_pending_qa`

Auto-approval **suggestion** only when: qualityScore ≥ 70, resolution `unique`, name present, address or website present. Never auto-publishes to `active`.

Audit log: `data/businessIngestion/qa-audit.json`

## Claim & Verification Bridge (V1.2)

Public preview: `GET /claim-business/:seedId` (also `/api/claim-business/:seedId` for dev proxy) — limited preview with masked contacts and source confidence. Dashboard page: `/claim-business/:seedId`.

Claim flow (authenticated):

1. `POST /api/business-ingestion/seeds/:id/claim` — `{ proofType, contact }` → creates pending claim; email/phone use OTP (reuses `claimOtpStore`)
2. `POST /api/business-ingestion/seeds/:id/claim/verify` — `{ otp }` or `{ proofValue }` for registration/website
3. On verified proof: duplicate check against live `Business` rows → `verified_owner` (store **not** activated yet)
4. `POST /api/business-ingestion/seeds/:id/activate` — `{ confirmed: true }` → creates/links owner store → `active`

Claim statuses: `pending`, `otp_sent`, `proof_submitted`, `verified`, `rejected`, `expired`, `duplicate_blocked`, `activated`

Claim audit events: `claim_started`, `otp_sent`, `proof_submitted`, `proof_verified`, `claim_rejected`, `claim_expired`, `duplicate_blocked`, `seed_activated`

Claim audit: `data/businessIngestion/claim-audit.json`

Admin claim queue: `GET /api/business-ingestion/claims?status=pending|verified|...` (enriched with seed business name)

## API (admin)

- `GET /api/business-ingestion/metrics` — dashboard metrics
- `GET /api/business-ingestion/seeds` — list seeds
- `GET /api/business-ingestion/runs` — recent pipeline runs
- `POST /api/business-ingestion/run` — run ingestion (super admin)
- `POST /api/business-ingestion/seeds/:id/claim` — owner claim

## Public Discovery Layer

Marketplace-facing representation of `seeded_claimable` businesses. **Ingestion internals are never shown publicly** — users see *Discovered Business*, activation benefits, and claim/verify flows only.

### Public API (no auth)

- `GET /api/public/discovery/businesses?limit=20&category=food|products|services|other`

Returns **Discovery Cards** with: business name, category, location, description, hero image, badge, claim/profile URLs.

Core implementation: `apps/core/cardbey-core/src/lib/businessIngestion/publicLifecycle.ts`, `DiscoveryCardService.ts`, `publicDiscoveryRoutes.js`.

### Internal → public lifecycle mapping

| Internal status | Public label |
|-----------------|--------------|
| `seeded_claimable` | Discovered Business |
| `verified_owner` | Verified Owner |
| `active` | Business Space |

Public lifecycle strip on cards: **Discovered → Claimed → Verified → Active** (current stage: *Discovered Business*).

### Dashboard integration

| Concern | Location |
|---------|----------|
| API client | `src/lib/discovery/discoveryCardApi.ts` |
| Feed artifact mapping | `src/lib/discovery/discoveryCardArtifacts.ts` |
| Feed hook (interleave) | `src/hooks/usePreparedPublicFeedArtifacts.ts` |
| Feed card UI | `src/components/publicfeed/ArtifactCard.tsx` |
| Explore grid UI | `src/components/explore/ExploreResultCard.tsx` |
| Copy + analytics | `src/lib/discovery/discoveryClaimEducation.ts` |

Discovered artifacts use id prefix `discovered:{seedId}` and `href` `/claim-business/{seedId}`.

Feed surfaces interleave discovered cards every 4 published store artifacts.

---

## Business Discovery Activation UX (V1)

Value-first activation layer on Discovery Cards. Owners see **what they get** before background explanation.

**Principle:** Lead with activation and ownership — not data-collection or ingestion language.

### Component map

| Component | Role |
|-----------|------|
| `DiscoveryClaimCta` | Primary CTA wrapper on feed + explore cards |
| `DiscoveryActivationSheet` | Mobile/desktop bottom sheet (activation + badge variants) |
| `DiscoveryActivationPopover` | Desktop hover/focus preview panel |
| `DiscoveryActivationContent` | Shared panel body: hero, benefits, lifecycle, collapsible explanation |
| `DiscoveryBadgeButton` | Interactive `✨ Discovered by Cardbey` badge |
| `DiscoveryLifecycleIndicator` | ● Discovered → ○ Claimed → ○ Verified → ○ Active |

### `DiscoveryClaimCta` behavior

**Label:** `Activate Your Business Space` with supporting text *Verification required.*

**All platforms — first CTA tap/click:**

1. Opens the activation sheet (does **not** navigate immediately).
2. Emits `activation_cta_clicked` with `trigger`: `cta_tap` or `long_press`.

**After user confirms in sheet** (`Activate Your Business Space` button):

1. Emits `activation_cta_completed`.
2. Calls `onClaim` → `window.location.assign('/claim-business/{seedId}')`.

**Mobile** (`(hover: none)`):

- First tap on CTA → activation sheet.
- Long-press (~520ms) on CTA → activation sheet (`trigger: long_press`).
- No separate info icon (explanation is collapsible inside the sheet).

**Desktop** (`(hover: hover)`):

- Hover/focus on CTA area → `DiscoveryActivationPopover` preview (benefits + lifecycle, read-only).
- Emits `activation_panel_opened` with `trigger: hover` on first open per hover session.
- Click CTA → activation sheet (same deferred navigation as mobile).

### `DiscoveryBadgeButton` behavior

**Label:** `✨ Discovered by Cardbey`

**Desktop:** hover or keyboard focus → tooltip: *"This business profile is waiting to be claimed by its owner."*  
Emits `badge_info_opened` (`trigger: hover`).

**Mobile:** tap → badge bottom sheet with same copy + *Got it* dismiss.  
Emits `badge_info_opened` (`trigger: badge_tap`).

### Activation sheet content (value-first order)

1. Hero — *Activate your Business Space* + ownership subtitle
2. Business name, category, location
3. Five benefit bullets (profile, offers, QR, Performer AI, online space)
4. Lifecycle indicator (current: Discovered Business)
5. Collapsible — *Why is this business on Cardbey?* (collapsed by default)
6. Primary CTA — *Activate Your Business Space*
7. Secondary — *Maybe later*
8. Tertiary — *Not your business?* → report / removal / support (mailto)

Expanding the collapsible emits `discovery_explanation_opened` (`trigger: collapsible`).

### Analytics (PIL)

All events via `trackDiscoveryEducation()` → `emitPilEvent()` → session buffer `cardbey.pil.events.v1`.

| Event | When |
|-------|------|
| `activation_panel_opened` | Activation sheet opens, or desktop hover preview first shown |
| `activation_cta_clicked` | User taps/clicks feed CTA (before navigation) |
| `activation_cta_completed` | User confirms activation in sheet |
| `discovery_explanation_opened` | Collapsible “Why is this business on Cardbey?” expanded |
| `discovery_explanation_closed` | Collapsible collapsed |
| `badge_info_opened` | Badge tooltip or badge sheet opened |
| `not_my_business_clicked` | “Not your business?” opened or action chosen |

**Metadata on every event:**

| Field | Description |
|-------|-------------|
| `surface` | `feed_card` \| `explore_grid` |
| `trigger` | `hover` \| `focus` \| `cta_tap` \| `long_press` \| `badge_tap` \| `collapsible` |
| `seedId` | Extracted from `discovered:{seedId}` artifact id |
| `ctaVariant` | `activate_your_business_space` (canonical) |
| `panelSeen` | Whether activation panel was shown before CTA completion |
| `notMyBusinessAction` | `report` \| `removal` \| `support` when applicable |

Types registered in `src/lib/pil/events/eventTypes.ts`.

**Inspect in browser console:**

```js
JSON.parse(sessionStorage.getItem('cardbey.pil.events.v1') || '[]')
  .filter(e => e.type.startsWith('activation_') || e.type.startsWith('discovery_') || e.type === 'badge_info_opened')
```

### Public terminology rule (LOCKED)

**Never expose in marketplace / discovery UI:**

- `seeded_claimable`, `seeded_pending_qa`, `verificationStatus`
- `ingestion`, `sourceType`, `QA`, adapter names
- Raw seed ids in visible UI (seed id only in analytics metadata and support mailto body)

**Use instead:**

- Discovered Business, Discovered by Cardbey
- Activate your Business Space, Verify ownership
- Discovered → Claimed → Verified → Active

Copy source of truth: `DISCOVERY_ACTIVATION_COPY` in `discoveryClaimEducation.ts`.  
Automated guard: `src/lib/discovery/discoveryClaimEducation.test.ts`.

### Manual QA

See [BUSINESS_DISCOVERY_ACTIVATION_QA.md](./BUSINESS_DISCOVERY_ACTIVATION_QA.md) for checklist and verification results.

### Tests

```bash
cd apps/dashboard/cardbey-marketing-dashboard
npx vitest run src/lib/discovery/discoveryClaimEducation.test.ts src/components/discovery/DiscoveryClaimCta.test.tsx
```

---

## Business Identity Profile (V1)

Canonical public page for every discovered business: `/business/:slug`

| Item | Location |
|------|----------|
| Public API | `GET /api/public/discovery/businesses/:slug` |
| Slug builder | `businessPublicSlug.ts` |
| Profile service | `PublicBusinessProfileService.ts` |
| Dashboard page | `src/pages/business/BusinessIdentityProfilePage.tsx` |

Slugs are deterministic (`slugify(name-city)` + 6-char id suffix). Not shown as raw seed ids in UI.

Discovery card `profileUrl` → `/business/:slug`. Feed secondary CTA and card tap open profile; primary CTA still activates via sheet → `/claim-business/:seedId`.

When `verificationStatus === active` and a storefront exists, profile redirects to `/s/{storeSlug}`.

Profile analytics: `business_profile_viewed`, `business_profile_activation_clicked`, `business_profile_not_my_business_clicked`.

---

## Tests (core ingestion)

```bash
cd apps/core/cardbey-core
npx vitest run src/lib/businessIngestion/__tests__
```

Expected sample run: **100 records → 90 unique → 90 `seeded_pending_qa` stores**

Re-running the same sample is idempotent: second run reports `seedsSkippedExisting: 90`, `seedsCreated: 0`, and Pending QA stays at 90.

## CLI

```bash
node scripts/run-business-ingestion.mjs
# Optional: persist DraftStore/Business rows (requires INGESTION_SYSTEM_USER_ID)
node scripts/run-business-ingestion.mjs --persist-stores
```

## Data storage

Seed records: `data/businessIngestion/seeds.json` (override with `BUSINESS_INGESTION_DIR`).

## Ethics

Only factual business identity fields are ingested. Reviews, ratings, UGC, competitor descriptions, and photos are excluded.

See also: [IMPACT_REPORT_BUSINESS_INGESTION_V1.md](./IMPACT_REPORT_BUSINESS_INGESTION_V1.md)
