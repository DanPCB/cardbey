# Prisma PostgreSQL Commerce/POS Batch 1 — inventory & procurement

**Status:** implemented on `fix/prisma-pg-commerce-pos-catchup-batch1`; **not merged**.  
**Does not include Template Library (#144).** Schema-independent of that cluster. Apply #144 in sequence on a disposable DB if proving full catch-up order; do not copy its migration into this branch.

**Base:** current `origin/staging` `d99c55f5d` (includes #145 ClaimOtp map; after prior tip `430fc17a`).

## Tables (exact Prisma names)

| Model | Table |
|-------|--------|
| `ProductVariant` | `ProductVariant` |
| `Warehouse` | `Warehouse` |
| `InventoryItem` | `InventoryItem` |
| `InventoryMovement` | `InventoryMovement` |
| `Supplier` | `Supplier` |
| `PurchaseOrder` | `PurchaseOrder` |
| `PurchaseOrderItem` | `PurchaseOrderItem` |

**Not in this batch:** PosOrder, PosOrderItem, Receipt, Payment.posOrderId, customer/staff/shift/drawer, tables/reservations/promotions/loyalty/tax/settings, creator/OAuth/teacher, BusinessEvent, Template Library, Live Market, RTMPS, SQLite.

## Migration

- **Name:** `20260815213000_commerce_pos_inventory_catchup_batch1`
- **SQL:** additive CREATE TABLE / INDEX / FK only from reviewed `migrate diff` extract.
- No drops, no historical edits, no `db push`, no `migrate resolve`.

### Creation order

1. `ProductVariant`, `Warehouse`, `Supplier` (depend on existing `Business` / `Product`)
2. `InventoryItem` (optional FKs to variant/warehouse/product)
3. `PurchaseOrder` (optional supplier)
4. `InventoryMovement`, `PurchaseOrderItem`

### Foreign keys / delete

| FK | On delete |
|----|-----------|
| `ProductVariant.storeId` → `Business` | CASCADE |
| `ProductVariant.productId` → `Product` | CASCADE |
| `Warehouse.storeId` → `Business` | CASCADE |
| `InventoryItem.storeId` → `Business` | CASCADE |
| `InventoryItem.productId` → `Product` | SET NULL |
| `InventoryItem.variantId` → `ProductVariant` | SET NULL |
| `InventoryItem.warehouseId` → `Warehouse` | SET NULL |
| `InventoryMovement.storeId` → `Business` | CASCADE |
| `InventoryMovement.inventoryItemId` → `InventoryItem` | CASCADE |
| `Supplier.storeId` → `Business` | CASCADE |
| `PurchaseOrder.storeId` → `Business` | CASCADE |
| `PurchaseOrder.supplierId` → `Supplier` | SET NULL |
| `PurchaseOrderItem.purchaseOrderId` → `PurchaseOrder` | CASCADE |

`PurchaseOrderItem.productId` / `variantId` are unbound strings (no Prisma relation). Existing Product/Business rows are not rewritten.

### Uniques / indexes / defaults

- Unique: `Warehouse (storeId, code)` — multiple NULLs allowed in PostgreSQL.
- Indexes: storeId / productId / sku / warehouseId / movement createdAt / PO status / PO item PO id (Prisma names).
- Defaults: `ProductVariant.currency` AUD, `isActive` true; `Warehouse.isDefault` false; `InventoryItem.unit` each; `PurchaseOrder.status` draft; `PurchaseOrderItem.quantityReceived` 0.
- `updatedAt` TIMESTAMP(3) NOT NULL without DB default (Prisma client).

### Data / locks / recovery

- Empty tables after apply. **No backfill.**
- CREATE TABLE on empty relations is short ACCESS EXCLUSIVE on new objects only; existing Product/Business unchanged.
- Failed apply: do not edit this folder. Forward-fix with a new migration if partially applied.
- **Preflight required before staging.** Staging may already have these objects via `db push`.

## Preflight

`apps/core/cardbey-core/scripts/prisma-commerce-pos-batch1-preflight.mjs`  
`npm run prisma:commerce-pos-batch1:preflight`

Read-only `psql`. Never mutates.

| Case | Exit | Code |
|------|------|------|
| All 7 absent, no history | 0 | `PREFLIGHT_TABLES_ABSENT` |
| All 7 present + history + shape match | 0 | `PREFLIGHT_ALREADY_APPLIED` |
| Objects without history | 2 | `PREFLIGHT_ORPHAN_OBJECTS` |
| Partial set / history without tables / shape mismatch | 3 | `PREFLIGHT_PARTIAL` / `PREFLIGHT_SHAPE_MISMATCH` / `PREFLIGHT_HISTORY_WITHOUT_TABLES` |

## Verification (this machine)

- Prisma Postgres schema **validate** with dummy `postgresql://` URL: pass
- Prisma SQLite schema **validate**: pass
- Inventory unit tests: `inventoryMovementEngine` + `actionRegistry` **4/4 pass**
- Contracts: **18/18 pass**
- Live Market (this branch, no RTMPS files): **76/76 pass** after SQLite client generate
- **Disposable PostgreSQL 15 empty-chain was not executed** — Docker Desktop engine returned 500 after restart. Do not treat Batch 1 as deploy-ready until that proof runs.
- RTMPS owns no schema delta on this branch (no Live Market/RTMPS files).

## Remaining drift after Batch 1 (expected)

PosOrder cluster, Payment.posOrderId FK, customer/staff/shift/drawer/tables/reservations/promotions/loyalty/tax/settings, creator/OAuth/teacher_traces, BusinessEvent, Template Library (unless #144 applied separately), drops of `business_*_events`.

## Future batches (not implemented)

- Batch 2: PosOrder, PosOrderItem, Receipt, Payment.posOrderId
- Batch 3: customer/staff/shift/drawer/tables/reservations/promotions/loyalty/tax/settings

