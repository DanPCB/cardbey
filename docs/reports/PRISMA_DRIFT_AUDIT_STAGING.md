# Prisma drift audit — staging CI runway (no repairs)

**Status:** `BLOCKED_PRISMA_MIGRATION_CHAIN`  
**Databases:** disposable CI Postgres (`cardbey_test` + `cardbey_shadow`) and local disposable SQLite file. No staging/production credentials.

RTMPS PRs #102 / #139 contain **no** `prisma/` schema or migration files. Live Market index-name drift below is from existing Live Market migrations vs Prisma’s 63-character Postgres identifier truncation — not RTMPS.

## Postgres (`migrate diff --from-migrations` → schema)

`prisma migrate deploy` on empty disposable Postgres **succeeds** (full history applies).  
`migrate diff --exit-code` **fails** (schema ahead of / divergent from history).

### Added tables (in schema, not created by migration history)

| Domain | Tables |
|--------|--------|
| Content templates | `TemplateLibrary`, `ContentTemplate`, `ContentTemplateVersion`, `TemplateInstance`, `TemplateAsset`, `TemplateFavorite` |
| Creator | `CreatorPayoutAccount` |
| OAuth | `OAuthConnection` |
| Teacher | `teacher_traces` |
| Inventory | `ProductVariant`, `Warehouse`, `InventoryItem`, `InventoryMovement`, `Supplier`, `PurchaseOrder`, `PurchaseOrderItem` |
| POS / commerce | `PosOrder`, `PosOrderItem`, `Receipt`, `CommerceCustomer`, `CommerceStaff`, `StaffRole`, `CommerceShift`, `CashDrawer`, `CommerceTable`, `Reservation`, `CommercePromotion`, `LoyaltyAccount`, `TaxProfile`, `CommerceBusinessSettings` |
| Events | `BusinessEvent` |

### Removed tables (in history, not in current schema)

- `ContentLibraryCollection`
- `business_action_events`, `business_decision_events`, `business_observation_events`, `business_opportunity_events`, `business_outcome_events`

### Field / constraint changes (selected)

- **Commerce / POS:** FKs and indexes on `storeId` (and related) for CashDrawer, Commerce*, Inventory*, PosOrder*, PurchaseOrder*, Receipt, Reservation, Supplier, TaxProfile, Warehouse, LoyaltyAccount, StaffRole; `Payment.posOrderId` FK.
- **Templates:** unique/index/FK graph on library/template/version/instance/asset/favorite.
- **Creator / OAuth:** unique indexes on payout account; OAuth `(userId, platform)` indexes.
- **Defaults:** `BusinessLead.updatedAt`, `ExecutiveLead.updatedAt`, `business_ingestion_run.updatedAt`, `business_seed.updatedAt` (`Now` → none); `LlmCache.tenantKey`/`purpose` defaults added; `SkillDispatchLog.query` default removed; `StoreLeadActivity.metadata` type recreate.
- **Live Market (index names only):** truncated `@@index` names on `LiveMarketSession` and `LiveMarketParticipantRegistration`. No new RTMPS columns.
- **Other index renames:** `LlmUsageDaily_key`, `UniversalEntityRelation` unique key.

## SQLite (`migrate diff --from-migrations` → schema)

**Blocked before drift SQL:** migration `20260711080337_init` fails on the disposable shadow DB:

```text
SQLite database error
no such table: AccountProfile
```

This matches the existing comment in `src/lib/liveMarket/testHarness/disposableSqlite.js`. Do **not** edit that historical file without a dedicated ACK.

## Proposed forward-only repair batches (not implemented)

1. **`ACK PRISMA_PG_TEMPLATE_LIBRARY_CATCHUP`** (recommended first) — additive Postgres migration for TemplateLibrary cluster only; no drops.
2. **`ACK PRISMA_PG_COMMERCE_POS_CATCHUP`** — ProductVariant / inventory / POS / commerce tables + FKs/indexes.
3. **`ACK PRISMA_PG_CREATOR_OAUTH_TEACHER_CATCHUP`** — CreatorPayoutAccount, OAuthConnection, teacher_traces.
4. **`ACK PRISMA_PG_BUSINESS_EVENTS_UNIFY`** — introduce `BusinessEvent` and decide drop/retain of `business_*_events` (destructive; needs explicit product ACK).
5. **`ACK PRISMA_PG_DEFAULTS_AND_INDEX_NAMES`** — updatedAt/LlmCache defaults + 63-char index rename alignment (includes Live Market index names).
6. **`ACK PRISMA_SQLITE_SHADOW_CHAIN`** — SQLite `20260711080337_init` vs `AccountProfile` ordering. Historical edit is currently forbidden; needs its own safety ACK.

Do not baseline shared databases, `db push`, or suppress `migrate diff`.
