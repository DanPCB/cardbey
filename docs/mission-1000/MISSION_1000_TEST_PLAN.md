# Mission 1000 — Test Plan

**Audit date:** 2026-07-21  
**Principle:** Unit tests prove modules; Mission 1000 requires golden-path E2E and production smoke.

---

## 1. Golden-path E2E scenarios

### GP-01 Assisted SME launch (must pass for 10-pilot go)
1. Fresh signup (or guest → claim)  
2. Choose “Run my business”  
3. Performer: provide name + location + website URL (or Places pick)  
4. `from-discovery` creates mission + DraftStore  
5. Review draft; apply ≤20 corrections  
6. Publish (confirm)  
7. Open `/s/:slug` on mobile + desktop  
8. Generate QR; scan to storefront  
9. Submit public quote request  
10. Owner receives notification; responds  

**Pass criteria:** Wall-clock import→publish ≤15 min assisted; storefront non-empty; enquiry visible &lt;60s.

### GP-02 Menu PDF import
Upload representative café PDF → catalog sections with prices → publish → product visible.

### GP-03 Service duration options (beauty)
Import or manual services with duration/price variants → booking or enquire CTA works.

### GP-04 Week-1 pack (after P1-01)
Generate 7 items → edit one → approve plan → artifacts persisted.

### GP-05 Morning briefing (in-app)
With pending quote + incomplete hero, open `/app` → briefing shows enquiry + completeness action → action opens correct flow.

### GP-06 Value card (after P1-04)
After GP-01, Value card shows measured quote count and import duration; estimated fields labeled Estimated.

---

## 2. Persona fixtures

| Persona | Fixture assets | Assert |
|---|---|---|
| Beauty/spa | PDF/price list with 30/60/90 min | Duration rows; enquire/book |
| Café | Multi-section menu PDF + hours | Sections not headers-as-products; hours on storefront |
| Tradie | Text profile + service area + phone | Enquiry CTA + QR phone path |
| Retail | CSV/admin or manual SKUs + variants | Variant rows; loyalty optional |
| Creator | Profile-only | Does **not** block SME path |
| Vietnamese → AU | vi UI + EN storefront | Language toggle; AUD; no illegal claim copy |

Store fixtures under e.g. `apps/core/cardbey-core/test/fixtures/mission-1000/` (to be created when implementing).

---

## 3. Failure scenarios

| ID | Failure | Expected |
|---|---|---|
| F-01 | Places API key missing | Clear message; manual name/URL still works |
| F-02 | OCR timeout | Retry + manual edit; no silent empty catalog |
| F-03 | Publish without email verify (gate on) | Block with verify CTA |
| F-04 | Video provider unset | Poster/copy still succeed; video marked unavailable |
| F-05 | Mid-import process restart | Resume or explicit restart (after P0-03) |
| F-06 | Quote spam | Rate limit; no crash |
| F-07 | SSRF on URL import | Blocked by fetch policy |
| F-08 | Cross-tenant draft access | 403 |
| F-09 | Studio navigate | No 404 for SME (redirect Performer) |
| F-10 | Stripe unset | Booking/enquire without payment still works |

---

## 4. Performance targets

| Metric | Pilot target | Scale-100 target |
|---|---|---|
| Median time to first draft | ≤10 min assisted | ≤8 min |
| Median time to publish | ≤15 min | ≤12 min |
| Import success rate | ≥80% assisted | ≥90% |
| Median manual corrections | ≤20 | ≤10 |
| Quote notify latency | ≤60s | ≤30s |
| Storefront LCP mobile | ≤3.5s | ≤2.5s |
| Week-1 approve time | ≤15 min | ≤10 min |

Instrument via P0-01 events; do not claim targets until measured.

---

## 5. Production / staging smoke

Run after each deploy:

1. `GET /api/performer/intake/v2` health (Render healthCheckPath)  
2. Login + create throwaway draft (staging only)  
3. Publish to disposable slug OR dry-run publish validation  
4. Public `GET /api/public/stores/:slug`  
5. Submit quote on staging store  
6. Confirm Notification row / email sink  
7. Open briefing surface  
8. Flag snapshot: Kernel/DI/Creator Production remain intentional  

**Do not** run destructive migrations or write production customer data from audit scripts.

---

## 6. Telemetry requirements

Events (minimum):

| Event | Properties |
|---|---|
| `m1000.signup_completed` | userId, roleIntent |
| `m1000.import_started` | sourceType, missionId |
| `m1000.import_completed` | durationMs, correctionCount, draftId |
| `m1000.publish_completed` | storeId, completenessScore |
| `m1000.qr_created` | storeId |
| `m1000.enquiry_created` | storeId, channel |
| `m1000.enquiry_notified` | channel |
| `m1000.enquiry_responded` | latencyMs |
| `m1000.week1_generated` | itemCount |
| `m1000.week1_approved` | itemCount |
| `m1000.briefing_opened` | source |
| `m1000.value_card_viewed` | measuredKeys |

Reuse `StoreActivityEvent` / PIL where possible; avoid parallel analytics platforms initially.

---

## 7. Staging verification checklist

- [ ] `GOOGLE_PLACES_API_KEY` set if Places tested  
- [ ] SMTP configured for notify tests  
- [ ] `USE_LOYALTY_SPINE` matches intended pilot path  
- [ ] Kernel/DraftStore flags documented for staging experiment  
- [ ] Discovery Intelligence Panel **off** unless Prisma ready  
- [ ] Video provider documented (mock vs Kling)  
- [ ] Submodule dashboard revision pinned and matches expected routes  

---

## 8. Regression suite (existing + gaps)

### Already strong (keep running)
- `businessImportKernel` phase tests  
- `runUnifiedStoreCreationFromDiscovery` contracts  
- Draft/publish service tests  
- `businessBriefingBuilder.test.ts`  
- Store engagement tests  
- Auth verification tests  

### Gaps to add
- E2E GP-01 Playwright/Cypress against staging  
- Tenant isolation on quote/draft  
- Resume-after-restart import  
- Completeness checklist gating  
- Value formula unit tests  
- Meta/OG snapshot for storefront  

### Do not treat as Mission proof
- Creator Production fixture tests  
- Discovery Intelligence memory tests alone  
- Social mock connect tests  
- Isolated Kernel unit without DraftStore persist  

---

## 9. Accessibility / mobile

- Mobile publish preview and storefront CTA reachability  
- Focus order on enquiry form  
- Contrast on briefing card  
- Autoplay muted policy respected (existing video sound policy)

---

## 10. Command snippets (non-destructive)

```bash
# Core unit subsets
cd apps/core/cardbey-core
npx vitest run src/lib/businessImportKernel/__tests__/businessImportKernel.test.js
npx vitest run src/lib/storeMission/__tests__/runUnifiedStoreCreationFromDiscovery.test.js

# Dashboard briefing
cd apps/dashboard/cardbey-marketing-dashboard
npx vitest run src/lib/pil/business/businessBriefingBuilder.test.ts

# Prisma (requires postgresql:// DATABASE_URL)
npx prisma validate --schema=prisma/postgres/schema.prisma
```
