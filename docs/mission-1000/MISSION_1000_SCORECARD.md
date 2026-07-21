# Mission 1000 — Scorecard

**Audit date:** 2026-07-21  
**Purpose:** Measurable outcomes for pilots → 100 → 1,000.  
**Rule:** Prefer measured events; label estimated and merchant-confirmed explicitly.

Legend for **Current availability:** Available · Partial · Missing

---

## North-star outcome metrics

| Metric | Definition | Source event | Calculation | Required properties | Current | Missing instrumentation |
|---|---|---|---|---|---|---|
| Onboarding completion rate | % of signups with roleIntent=business who reach import_started within 7d | `m1000.signup_completed`, `m1000.import_started` | completed / signups | userId, roleIntent, ts | Partial (signup exists; roleIntent missing) | roleIntent + funnel join |
| Median time to first import | Median(import_completed.ts − import_started.ts) for successful drafts | import_started/completed | median durationMs | missionId, sourceType, durationMs | Missing | emit both events |
| Import success rate | import_completed / import_started (7d) | same | ratio | errorCode on fail | Partial (mission outcomes uneven) | standardize fail codes |
| Median manual corrections | Median correctionCount on import_completed | import_completed | median | correctionCount | Missing | count field edits in review |
| Median time to publish | publish_completed − import_completed | publish_completed | median | storeId, draftId | Partial (publish logs) | mission1000 event |
| Storefront completeness | Share of publishes with completenessScore ≥ threshold | publish_completed | % ≥ bar | completenessScore components | Missing | checklist scorer |
| Seven-day content-plan completion | week1_approved / stores published (cohort) | week1_* | ratio | storeId, itemCount | Missing | Week-1 mission |
| Content approval rate | approved items / generated items | week1_* | ratio | itemId | Missing | per-item events |
| First enquiry within 7 days | Stores with enquiry_created within 7d of publish | enquiry_created, publish_completed | % | storeId, channel | Partial (quotes exist; not cohorted) | cohort join |
| First transaction (where applicable) | Payment success or booking completed within 30d | payment/booking events | % | amount, currency | Partial (Stripe optional) | attribution id |
| Cardbey-attributed conversions | Conversions with touchpoint + merchant confirm | confirm event | count / $ | touchpointId, confirmed | Missing | confirm flow |
| Daily briefing open rate | briefing_opened / eligible owners / day | briefing_opened | ratio | source=in_app\|email | Partial (in-app only) | email + daily eligibility |
| Suggested-action completion | actions completed / suggested in briefing | action_completed | ratio | actionType | Partial (PIL intents) | consistent complete event |
| Time saved | Sum(baseline − actual) for assisted tasks | import + content durations | minutes | baselineMinutes, actualMinutes | Missing | baselines |
| Verified revenue | Sum of merchant-confirmed or payment-attributed $ | confirm / payment | sum | amount, currency, attribution | Missing | — |
| Estimated value | labourValue + optional softwareSavings estimates | derived | sum | rate, confidence | Missing | Value card |
| Day-1 / Day-7 / Day-30 retention | Owners with ≥1 meaningful session on day N | session / briefing / mission events | % | userId, dayN | Partial | retention cohort job |

---

## Metric detail sheets

### Onboarding completion rate
- **Definition:** Business-intent users who start import within 7 days.  
- **Available today:** Signup/login durable; intent not standardized.  
- **Action:** P0-06 + P0-01.

### Median time to first import
- **Definition:** Start when owner submits discovery/import; end when DraftStore ready for review.  
- **Available today:** Adapter `durationMs` only; no product SLO.  
- **Action:** P0-01.

### Import success rate
- **Definition:** Draft created without fatal error.  
- **Available today:** Mission pipeline outcomes; inconsistent taxonomy.  
- **Action:** Map errors to `DISCOVERY_INPUT_REQUIRED`, enrich fail, OCR fail, etc.

### Median manual corrections
- **Definition:** Count of field-level edits between first draft projection and publish.  
- **Available today:** Missing.  
- **Action:** Diff draft versions or review UI edit counters.

### Median time to publish
- **Definition:** Draft ready → published Business.  
- **Available today:** Publish services; not Mission-scored.  
- **Action:** `m1000.publish_completed`.

### Storefront completeness
- **Suggested bar (pilot):** name, slug, ≥1 image (logo or hero), ≥3 catalog items OR explicit service description, contact or CTA, hours or “by appointment”.  
- **Available today:** Briefing markers mention gaps; no score.  
- **Action:** P0-05.

### Seven-day content-plan completion
- **Available today:** Missing (no Week-1).  
- **Action:** P1-01.

### First enquiry within seven days
- **Definition:** `quote_request` or booking create with storeId.  
- **Available today:** Quotes + `emitCustomerInquiryActivity`.  
- **Gap:** Not joined to publish cohort automatically.  
- **Action:** Scorecard job + P0-04 to ensure owners see enquiries.

### Cardbey-attributed conversions
- **Classes allowed:**  
  - **Direct:** payment with Cardbey checkout session id  
  - **Influenced:** merchant confirms enquiry→sale with touchpoint  
  - **Forbidden:** infer revenue from impressions alone  
- **Available today:** Unsupported.  
- **Action:** P2-04 after notify/respond loop works.

### Time saved
- **Formula:**  
  `time_saved_min = max(0, baseline_manual_min − actual_assisted_min)`  
  Defaults (configurable): import baseline 120; week1 content baseline 180; respond baseline 15.  
- **Labour value:** `time_saved_min / 60 * hourly_rate` (default AUD 45, owner-editable).  
- **Label:** Estimated unless owner confirms.

### Verified vs estimated value
| Component | Class |
|---|---|
| Quote/booking counts | Measured |
| Catalog items created | Measured |
| Import duration | Measured |
| Time saved $ | Estimated |
| Payment captured in Cardbey | Measured direct revenue |
| Offline sale after Cardbey enquiry | Merchant-confirmed influenced |
| Replaced Canva/Mailchimp cost | Merchant-confirmed software savings |

---

## Operating targets by phase

| Metric | Phase A (10) | Phase B (100) | Phase C (1000) |
|---|---|---|---|
| Onboarding completion | ≥70% assisted | ≥60% semi | ≥50% self |
| Median import time | ≤10 min | ≤8 min | ≤6 min |
| Import success | ≥80% | ≥90% | ≥95% |
| Median corrections | ≤20 | ≤12 | ≤8 |
| Time to publish | ≤15 min | ≤12 min | ≤10 min |
| Completeness ≥ bar | ≥90% shared | ≥95% | ≥98% |
| Week-1 approve | optional | ≥50% | ≥70% |
| Enquiry ≤7d | ≥40% | ≥50% | ≥60% |
| Briefing open (in-app) | ≥50% | ≥40% daily email | ≥50% |
| Value card viewed | ≥80% pilots | ≥60% | ≥70% |

---

## Current system coverage (pre-instrumentation)

| Data already in DB | Can support |
|---|---|
| DraftStore / Business / Product | import & publish proxies |
| Quote requests / Bookings | enquiry & transaction proxies |
| StoreActivityEvent / EngagementSnapshot | visits, likes, inquiries |
| CampaignReport | campaign performance |
| Notification | notify delivery (when written) |
| CreatorContent + publishing decisions | creator track only |

| Not available | Blocks |
|---|---|
| correctionCount | quality of import |
| completenessScore | presence quality |
| week1 events | Stage 3 |
| attributed revenue | Stage 5 claims |
| scheduled briefing delivery | Stage 6 habit |

---

## Dashboard presentation rules

1. Always show **as-of timestamp** and timezone.  
2. Separate tiles: Measured · Estimated · Confirmed.  
3. Never sum estimated + confirmed into one “Revenue created by Cardbey” without disclosure.  
4. Empty state: “Not enough data yet” — never fabricate.
