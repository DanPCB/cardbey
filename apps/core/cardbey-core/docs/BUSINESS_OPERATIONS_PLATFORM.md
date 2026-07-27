# Business Operations Platform (Phase 1)

**POS = Point of Business Operations** inside Cardbey — not a legacy POS migration.

## Architecture

```
User intent (Performer / API)
        ↓
Runtime Authority (toolDispatcher)
        ↓
businessSkill tools (create_order, checkout_order, …)
        ↓
Domain services (lib/business/)
        ↓
Repositories (Prisma commerce models)
        ↓
BusinessEvent timeline (immutable)
        ↓
Signals / reporting / AI (future)
```

**Rule:** No React or route handler may mutate commercial data directly. Routes call `dispatchTool` only.

## Domain models (Prisma)

| Model | Purpose |
|-------|---------|
| `Business` | Store (existing) |
| `Product` | Catalog item (existing) |
| `ProductVariant` | SKU / price variant |
| `InventoryItem` | Stock identity |
| `InventoryMovement` | **Source of truth for quantity** |
| `Warehouse` | Stock location |
| `Supplier` | Vendor |
| `PurchaseOrder` / `PurchaseOrderItem` | Inbound PO |
| `PosOrder` / `PosOrderItem` | Sales order aggregate |
| `Payment` | Payment record |
| `Receipt` | Receipt artifact |
| `CommerceCustomer` | Customer |
| `CommerceStaff` / `StaffRole` / `CommerceShift` / `CashDrawer` | Staff & register |
| `CommerceTable` / `Reservation` | Restaurant tables |
| `CommercePromotion` / `LoyaltyAccount` / `TaxProfile` | Promos & tax |
| `CommerceBusinessSettings` | Store commerce config |
| `BusinessEvent` | Immutable commercial event log |

Schemas: `prisma/sqlite/schema.prisma`, `prisma/postgres/schema.prisma`

## Runtime tools (Phase 1 implemented)

| Tool | Status |
|------|--------|
| `create_order` | ✅ |
| `checkout_order` | ✅ |
| `cancel_order` | ✅ |
| `receive_inventory` | ✅ |
| `adjust_inventory` | ✅ |
| `record_payment` | ✅ |
| `print_receipt` | ✅ |
| Others (shift, PO, merge, split, …) | Registered — Phase 2 honest blocker |

Registry: `src/lib/business/actionRegistry.js`  
Tool defs: `src/lib/business/businessToolRegistry.js`  
Executors: `src/lib/toolExecutors/business/`

## Performer integration

- Legacy skill: `BusinessOperationsSkill` (`business_operations`)
- Runtime intent: `business_operations` in `skill_runtime/patterns.ts`
- Triggers: sell, stock, inventory, checkout, receipt, refund, register, …

## APIs

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/business-operations/actions` | Action registry |
| POST | `/api/business-operations/execute` | `{ toolName, input }` → `dispatchTool` |
| GET | `/api/business-operations/events?storeId=` | Business event timeline |

## Inventory principle

Quantity is **never** stored as a mutable counter on `InventoryItem`.  
`calculateOnHandQuantity()` sums `InventoryMovement.quantityDelta`.

Movement types: Purchase, Sale, Return, Waste, Adjustment, Transfer, Production, Consumption, Correction.

## Order checkout flow

1. `create_order` → `PosOrder` (draft) + `OrderCreated` event  
2. `checkout_order` → `Payment` + `Receipt` + Sale movements + `OrderCompleted` event  
3. Inventory deducted via `InventoryMovement` (never direct field update)

## Governance

Every write validates:

- `storeId` present  
- Actor `userId` (except test)  
- Store ownership (or platform admin)  
- `runtimeExecutionId` / `missionId` recorded on events  

## Tests

```bash
cd apps/core/cardbey-core
npm run test -- src/lib/business/__tests__
```

## Phase 2 (not in scope)

- POS UI screens  
- Full shift / PO / merge / split implementations  
- Payment gateway integrations  
- Analytics projection from events  

## Impact

Additive only: new tables, new routes, new tools. No changes to legacy checkout or existing order facade behavior.
