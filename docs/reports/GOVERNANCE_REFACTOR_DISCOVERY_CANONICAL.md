# Governance Refactor — Discovery Engine V1 Canonical Onboarding

**Date:** 2026-06-21  
**Scope:** Growth Command Center → CRM-only; Discovery Engine V1 → sole store-creation path

---

## 1. Architecture impact report

### Before

| Path | Entity | Store creation |
|------|--------|----------------|
| Growth batch | `ExecutiveLead` → `DraftStore` | Immediate draft (system user) |
| Discovery V1 | `business_seed` → QA → claim → activate | At owner-confirmed activation |

### After

| Path | Entity | Store creation |
|------|--------|----------------|
| Growth CRM | `ExecutiveLead` → `promoteLeadToSeed()` → `business_seed` | **None** from Growth |
| Discovery V1 | Unchanged governed pipeline | **Only** path to `Business`/`DraftStore` |

### Behavioral changes

1. **Growth “Run Store Auto-Creation”** disabled by default (`ENABLE_LEGACY_GROWTH_STORE_CREATION=false`).
2. **“Promote Leads To Discovery”** creates real `business_seed` rows via `DiscoveryPromotionPipeline` (`persistStores: false`).
3. Each promotion writes **`discovery_engine_job`**, **`business_ingestion_run`**, **`business_seed_status_transition`** (`discovery_ingested`).
4. **Outreach claim URLs** use `/activate-business/:seedId` — no `ExecutiveLead.id` claim links.
5. **Discovery Network** sidebar removed; **Discovery Center** is canonical nav target.
6. **Executive Overview** retains **Discovery Summary** widget (primary panel only); duplicate `#discovery-agent` section removed.

### What did not change

- Discovery Center page (`/control-center/discovery-center`) — already owns jobs, runs, funnel, execution.
- QA / Claims / Funnel governance pages.
- Legacy `create-store-batch` code preserved behind feature flag.
- Existing `DraftStore` rows from prior Growth batches (not deleted).

---

## 2. Files changed

### Core (`apps/core/cardbey-core`)

| File | Change |
|------|--------|
| `src/lib/executiveGrowth/growthGovernanceConfig.ts` | **New** — feature flag |
| `src/lib/executiveGrowth/promoteLeadToSeed.ts` | **New** — lead → seed bridge |
| `src/lib/executiveGrowth/promoteLeadToSeed.test.ts` | **New** — governance tests |
| `src/lib/executiveGrowth/growthCommandCenterService.ts` | Metrics, outreach URLs, audit, legacy gate |
| `src/routes/executiveGrowthRoutes.js` | Promotion routes + legacy 403 gate |
| `prisma/*/schema.prisma` | `ExecutiveLead.businessSeedId` |
| `prisma/*/migrations/20260621140000_add_executive_lead_business_seed_id/` | **New** migration |

### Dashboard (`apps/dashboard/cardbey-marketing-dashboard`)

| File | Change |
|------|--------|
| `src/lib/executiveGrowth/growthCommandCenterApi.ts` | Types + promotion API client |
| `src/pages/controlCenter/GrowthCommandCenterPage.tsx` | CRM UI refocus |
| `src/navigation/canonicalNavBuilders.ts` | Remove Discovery Network sidebar |
| `src/components/controlCenter/CardbeyControlCenter.tsx` | Remove duplicate discovery-agent zone |
| `src/components/controlCenter/CcDiscoveryIngestionPrimaryPanel.tsx` | Discovery Summary + DC link |
| `src/components/controlCenter/controlCenterRoutes.ts` | Route comments / discoveryOnboarding |

---

## 3. APIs added

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/executive/growth/promote-leads-to-discovery` | Batch promote qualified leads → seeds |
| `POST` | `/api/executive/growth/promote-lead/:id` | Single lead promotion |

### Modified APIs

| Method | Path | Change |
|--------|------|--------|
| `POST` | `/api/executive/growth/create-store-batch` | Returns **403** when legacy flag off |
| `GET` | `/api/executive/growth/summary` | CRM metrics + `legacyStoreCreationEnabled` |
| `POST` | `/api/executive/growth/send-outreach` | Requires `businessSeedId`; seed-based URLs |

---

## 4. Migration requirements

```bash
# Postgres (Render staging/production)
cd apps/core/cardbey-core
pnpm prisma migrate deploy

# Adds:
# ExecutiveLead.businessSeedId TEXT + index
```

**Env vars:**

| Variable | Default | Purpose |
|----------|---------|---------|
| `ENABLE_LEGACY_GROWTH_STORE_CREATION` | `false` | Re-enable Growth draft batch (emergency only) |
| `VITE_ENABLE_LEGACY_GROWTH_STORE_CREATION` | unset/false | Show legacy batch button in dashboard |

---

## 5. Backward compatibility

| Item | Compatibility |
|------|----------------|
| Existing `ExecutiveLead` rows | ✅ Unchanged; promote when ready |
| Existing `DraftStore` from legacy batches | ✅ Preserved; marked “legacy draft” in UI |
| `create-store-batch` API | ✅ Available when `ENABLE_LEGACY_GROWTH_STORE_CREATION=true` |
| Old outreach emails with `/claim-business/{leadId}` | ⚠️ Broken links remain in sent mail — new sends use seed URLs |
| `/marketing#discovery-agent` deep links | ⚠️ Section removed — use `/control-center/discovery-center` |
| Melbourne Batch 0 | ✅ Use Discovery Center + lead promotion only |

---

## 6. Risks and rollback plan

### Risks

| Risk | Mitigation |
|------|------------|
| Promotion fails without `business_seed` table | Run migrations + backfill scripts before promote |
| Operators try outreach before promotion | Outreach skips leads without `businessSeedId` |
| Duplicate Melbourne businesses | `BusinessIdentityEngine` + promotion pipeline dedupe |
| Legacy drafts coexist with seeds | Audit doc; do not run legacy batch on same market |

### Rollback

1. Set `ENABLE_LEGACY_GROWTH_STORE_CREATION=true` on core + `VITE_ENABLE_LEGACY_GROWTH_STORE_CREATION=true` on dashboard.
2. Revert dashboard deploy (Growth UI restores legacy batch button).
3. **Do not** delete `promoteLeadToSeed` — promoted seeds are valid governed records.
4. Re-add Discovery Network sidebar entry if operators depend on hash anchor (optional).

---

## 7. Success criteria checklist

| Criterion | Status |
|-----------|--------|
| One store creation path (Discovery activation) | ✅ Growth gated |
| Discovery Engine V1 owns onboarding | ✅ |
| Growth owns CRM | ✅ |
| No DraftStore creation from Growth (default) | ✅ |
| No ExecutiveLead claim URLs | ✅ |
| Discovery Center = onboarding console | ✅ (unchanged, now canonical nav) |
| Discovery Network sidebar removed | ✅ |
| Executive Overview discovery summary retained | ✅ |
| Lead → Seed promotion | ✅ `promoteLeadToSeed()` |
| Real governance tables used | ✅ job, run, transition |
| Duplicate prevention | ✅ `BusinessIdentityEngine` |

---

## 8. Operator workflow (Melbourne Batch 0)

1. **Growth Command Center** — Import CSV leads → qualify  
2. **Promote Leads To Discovery** — creates `business_seed` (`seeded_pending_qa`)  
3. **Discovery Center** — monitor jobs / runs / funnel  
4. **QA Review** — approve seeds  
5. **Claims / Activate** — governed owner pipeline  
6. **Growth Outreach** — only after promotion (seed claim URLs)
