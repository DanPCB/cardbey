# IMPACT REPORT — `PRISMA_PG_COMMERCE_POS_CATCHUP`

**Status:** planning only. **Do not implement** until `ACK PRISMA_PG_COMMERCE_POS_CATCHUP`.  
**Base schema:** `apps/core/cardbey-core/prisma/postgres/schema.prisma` (`Business Operations Platform (Phase 1)`).  
**Drift SQL:** post–Template Library `migrate diff` (cluster still present after PR #144).

This batch is **stricter than i18n debt**. Schema-to-migration drift remains deployment-blocking. Do not pin a “pass if unchanged” count for unexplained DDL.

## Explicitly out of scope

Creator payout, OAuth, `teacher_traces`, `BusinessEvent`, drops of `business_*_events`, default/index cleanup outside this cluster, SQLite history repair, Live Market, RTMPS, Template Library (#144).

`posOrderAggregate.js` also calls `appendBusinessEvent`. That **runtime** coupling is noted below; **do not** add `BusinessEvent` in this batch.

## Already in PostgreSQL history (do not recreate)

| Object | Where | Note |
|--------|--------|------|
| `Payment` table + `posOrderId` column + `Payment_posOrderId_idx` | `20260707140000_extend_payment_stripe_journey` | `CREATE TABLE IF NOT EXISTS` / indexes |
| `Payment_posOrderId_fkey` | same file, `DO $$ … WHEN undefined_table THEN null` | **FK is skipped until `PosOrder` exists.** After creating `PosOrder`, this constraint must be added in the **new** migration if still missing. |
| `Product`, `Business` | earlier migrations | FK targets for variants/orders |

If `Payment` already existed before that migration, `posOrderId` may be absent (it was not in the `ADD COLUMN IF NOT EXISTS` list). Preflight must check the column.

## Genuinely missing from migration history (this batch)

All of the following appear as `CREATE TABLE` in current `migrate diff` and **do not** appear as `CREATE TABLE "…"` in `prisma/postgres/migrations`:

### Inventory

| Model / table | Feature | Runtime | Existing-data / `db push` | Depends on | Backfill | Independent? |
|---------------|---------|---------|---------------------------|------------|----------|--------------|
| `ProductVariant` | Catalog variants / POS lines | `PosOrderItem.variant`; inventory by variant | Staging may already have it from `db push` | `Business`, `Product` | None (empty OK) | Yes, first |
| `Warehouse` | Stock locations | `InventoryItem.warehouse` | Same | `Business` | Optional default warehouse per store **not required** for schema | Yes |
| `InventoryItem` | On-hand identity | `inventoryMovementEngine.ensureInventoryItem` | Same | Variant/Warehouse optional FKs | None | After variant/warehouse |
| `InventoryMovement` | Ledger | `recordInventoryMovement`; checkout/receive/adjust tools | Same | `InventoryItem`, `Business` | None; do not invent stock | After items |
| `Supplier` | Purchasing | `PurchaseOrder.supplier` | Same | `Business` | None | Yes |
| `PurchaseOrder` | Purchasing | Schema + future receive flow | Same | `Supplier?` | None | After supplier |
| `PurchaseOrderItem` | PO lines | receive_inventory path | Same | `PurchaseOrder` | None | After PO |

### Point of sale / orders / commerce

| Model / table | Feature | Runtime | `db push` risk | Depends on | Backfill | Independent? |
|---------------|---------|---------|----------------|------------|----------|--------------|
| `CommerceCustomer` | POS customer | `PosOrder.customer`; loyalty | High | `Business` | None | Yes |
| `CommerceStaff` | POS staff | `PosOrder.staff`; shifts | High | `Business` | None | Yes |
| `StaffRole` | Staff roles | `CommerceStaff.roles` | High | `CommerceStaff` | None | After staff |
| `CommerceShift` | Shifts | `PosOrder.shift`; `CashDrawer` | High | Staff optional | None | After staff |
| `CashDrawer` | Drawer | Shift 1:1 optional | High | Shift optional | None | After shift |
| `CommerceTable` | Floor | `PosOrder.table`; reservations | High | `Business` | None | Yes |
| `PosOrder` | Orders | `posOrderAggregate`, `create_order` / `checkout_order` / `cancel_order`, payment webhook | High | Table/customer/staff/shift optional; `Business` required | None | After optional parents exist (FKs nullable except store) |
| `PosOrderItem` | Lines | create/checkout | High | `PosOrder`, `Product?`, `ProductVariant?` | None | After PosOrder |
| `Receipt` | Receipts | `print_receipt`, checkout | High | `PosOrder` | None | After PosOrder |
| `Reservation` | Tables | Schema; limited runtime grep | High | Table/customer optional | None | After table |
| `CommercePromotion` | Offers | Schema | High | `Business` | None | Yes |
| `LoyaltyAccount` | Points | Schema; `customerId` unique | High | `CommerceCustomer` | None | After customer |
| `TaxProfile` | Tax | Schema | High | `Business` | None | Yes |
| `CommerceBusinessSettings` | Store POS settings; unique `storeId` | Schema | High | `Business` | None | Yes |

### Additive on existing `Payment`

| Change | Strategy |
|--------|----------|
| Ensure `Payment.posOrderId` column | `ADD COLUMN IF NOT EXISTS` |
| `Payment_posOrderId_fkey` → `PosOrder(id)` ON DELETE SET NULL | Add after `PosOrder` exists (history skipped this) |
| Index already in `20260707140000` | Create if missing only |

No join tables beyond the models above (`StaffRole` is the staff↔role row table).

## PostgreSQL creation order

1. `ProductVariant`, `Warehouse`, `Supplier`, `CommerceCustomer`, `CommerceStaff`, `CommerceTable`, `CommercePromotion`, `TaxProfile`, `CommerceBusinessSettings`
2. `InventoryItem`, `PurchaseOrder`, `StaffRole`, `CommerceShift`
3. `InventoryMovement`, `PurchaseOrderItem`, `CashDrawer`, `PosOrder`
4. `PosOrderItem`, `Receipt`, `Reservation`, `LoyaltyAccount`
5. `Payment.posOrderId` column (if missing) + `Payment_posOrderId_fkey`

Defaults from schema: order `draft` / channel `pos` / currency `AUD` / booleans / `quantity` 1, etc. JSONB for `metadata` / `optionInfo` / `payload`. `@updatedAt` columns: `TIMESTAMP(3) NOT NULL` without DB default (matches other Prisma PG migrations).

Indexes/uniques: use **exact Prisma names** from `migrate diff` (`ProductVariant_storeId_sku_idx`, `Warehouse_storeId_code_key`, `CommerceTable_storeId_name_key`, `LoyaltyAccount_customerId_key`, `CommerceBusinessSettings_storeId_key`, `CashDrawer_shiftId_key`, …). Do not include Live Market 63-char rename noise.

FKs: `storeId` → `Business` **CASCADE**; product/variant **SET NULL** where optional; `PosOrderItem`/`Receipt` → `PosOrder` **CASCADE**; `Payment` → `PosOrder` **SET NULL**.

## Staging `db push` / orphan objects

Treat like Template Library: **read-only preflight** (tables, columns, indexes, FKs, `_prisma_migrations`). If objects exist without history → **stop**; do not `migrate resolve` automatically. Unique `(storeId, sku)` / `(storeId, name)` / `customerId` can fail if pushed data duplicates.

## Data risks

- Empty DB: create-only.
- Pushed DB with extra columns: additive only; no drops.
- Checkout currently appends `BusinessEvent` (excluded). Until that catch-up, keep event append tolerant of a missing delegate **or** accept checkout telemetry failure — decide in implementation ACK, do not silently create `BusinessEvent` here.
- Do not backfill inventory quantities.

## Roll-forward recovery

New timestamped folder only. Failed deploy: fix SQL, new forward migration if the failed one applied partially (Prisma marks failed). Never edit this batch after apply. Second `migrate deploy` must be history no-op.

## Can this deploy independently of other drift batches?

**Schema: yes** (needs `Business`/`Product`/`Payment` already in history — they are). **Does not need** Template Library, creator, OAuth, teacher, or Live Market. **Does not need** `BusinessEvent` for CREATE TABLE, but **checkout telemetry** currently expects it.

**Render:** still do not merge to auto-deploying `staging` until the catch-up sequence and deployment plan are approved.

## Recommended next ACK

`ACK PRISMA_PG_COMMERCE_POS_CATCHUP`

Implementation should copy the #144 pattern: reviewed `migrate diff` extract (no drops), forward-only SQL, disposable empty-chain proof, orphan preflight, Live Market regression, no SQLite migration.
