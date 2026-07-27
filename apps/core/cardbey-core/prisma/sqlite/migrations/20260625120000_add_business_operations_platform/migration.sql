-- Business Operations Platform — Phase 1 commerce domain (additive)

CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT,
    "name" TEXT,
    "price" REAL,
    "currency" TEXT DEFAULT 'AUD',
    "metadata" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductVariant_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ProductVariant_storeId_idx" ON "ProductVariant"("storeId");
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");
CREATE INDEX "ProductVariant_storeId_sku_idx" ON "ProductVariant"("storeId", "sku");

CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Warehouse_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Warehouse_storeId_code_key" ON "Warehouse"("storeId", "code");
CREATE INDEX "Warehouse_storeId_idx" ON "Warehouse"("storeId");

CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "warehouseId" TEXT,
    "sku" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT DEFAULT 'each',
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InventoryItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InventoryItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InventoryItem_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "InventoryItem_storeId_idx" ON "InventoryItem"("storeId");
CREATE INDEX "InventoryItem_storeId_sku_idx" ON "InventoryItem"("storeId", "sku");
CREATE INDEX "InventoryItem_warehouseId_idx" ON "InventoryItem"("warehouseId");

CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "movementType" TEXT NOT NULL,
    "quantityDelta" REAL NOT NULL,
    "reason" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "destinationType" TEXT,
    "destinationId" TEXT,
    "referenceEntityType" TEXT,
    "referenceEntityId" TEXT,
    "runtimeExecutionId" TEXT,
    "missionId" TEXT,
    "actorUserId" TEXT,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryMovement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryMovement_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "InventoryMovement_storeId_createdAt_idx" ON "InventoryMovement"("storeId", "createdAt");
CREATE INDEX "InventoryMovement_inventoryItemId_createdAt_idx" ON "InventoryMovement"("inventoryItemId", "createdAt");
CREATE INDEX "InventoryMovement_referenceEntityType_referenceEntityId_idx" ON "InventoryMovement"("referenceEntityType", "referenceEntityId");
CREATE INDEX "InventoryMovement_movementType_idx" ON "InventoryMovement"("movementType");

CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Supplier_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Supplier_storeId_idx" ON "Supplier"("storeId");

CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "supplierId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "reference" TEXT,
    "expectedAt" DATETIME,
    "receivedAt" DATETIME,
    "runtimeExecutionId" TEXT,
    "missionId" TEXT,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PurchaseOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "PurchaseOrder_storeId_status_idx" ON "PurchaseOrder"("storeId", "status");

CREATE TABLE "PurchaseOrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purchaseOrderId" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "sku" TEXT,
    "name" TEXT NOT NULL,
    "quantityOrdered" REAL NOT NULL,
    "quantityReceived" REAL NOT NULL DEFAULT 0,
    "unitCost" REAL,
    "metadata" JSONB,
    CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PurchaseOrderItem_purchaseOrderId_idx" ON "PurchaseOrderItem"("purchaseOrderId");

CREATE TABLE "CommerceCustomer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommerceCustomer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CommerceCustomer_storeId_idx" ON "CommerceCustomer"("storeId");
CREATE INDEX "CommerceCustomer_storeId_email_idx" ON "CommerceCustomer"("storeId", "email");

CREATE TABLE "CommerceStaff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommerceStaff_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CommerceStaff_storeId_idx" ON "CommerceStaff"("storeId");
CREATE INDEX "CommerceStaff_userId_idx" ON "CommerceStaff"("userId");

CREATE TABLE "StaffRole" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "staffId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    CONSTRAINT "StaffRole_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "CommerceStaff" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "StaffRole_staffId_idx" ON "StaffRole"("staffId");

CREATE TABLE "CommerceShift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "staffId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    "metadata" JSONB,
    CONSTRAINT "CommerceShift_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommerceShift_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "CommerceStaff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "CommerceShift_storeId_status_idx" ON "CommerceShift"("storeId", "status");

CREATE TABLE "CashDrawer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "shiftId" TEXT,
    "openingFloat" REAL NOT NULL DEFAULT 0,
    "closingBalance" REAL,
    "status" TEXT NOT NULL DEFAULT 'closed',
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CashDrawer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CashDrawer_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "CommerceShift" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CashDrawer_shiftId_key" ON "CashDrawer"("shiftId");
CREATE INDEX "CashDrawer_storeId_idx" ON "CashDrawer"("storeId");

CREATE TABLE "CommerceTable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "zone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'available',
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommerceTable_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CommerceTable_storeId_name_key" ON "CommerceTable"("storeId", "name");
CREATE INDEX "CommerceTable_storeId_idx" ON "CommerceTable"("storeId");

CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "tableId" TEXT,
    "customerId" TEXT,
    "partySize" INTEGER,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Reservation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Reservation_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "CommerceTable" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "Reservation_storeId_startsAt_idx" ON "Reservation"("storeId", "startsAt");

CREATE TABLE "PosOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "orderNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "channel" TEXT NOT NULL DEFAULT 'pos',
    "deliveryMethod" TEXT,
    "tableId" TEXT,
    "customerId" TEXT,
    "staffId" TEXT,
    "shiftId" TEXT,
    "subtotalAmount" REAL NOT NULL DEFAULT 0,
    "taxAmount" REAL NOT NULL DEFAULT 0,
    "discountAmount" REAL NOT NULL DEFAULT 0,
    "totalAmount" REAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "notes" TEXT,
    "runtimeExecutionId" TEXT,
    "missionId" TEXT,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    CONSTRAINT "PosOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PosOrder_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "CommerceTable" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PosOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CommerceCustomer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PosOrder_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "CommerceStaff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PosOrder_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "CommerceShift" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "PosOrder_storeId_status_idx" ON "PosOrder"("storeId", "status");
CREATE INDEX "PosOrder_storeId_createdAt_idx" ON "PosOrder"("storeId", "createdAt");
CREATE INDEX "PosOrder_orderNumber_idx" ON "PosOrder"("orderNumber");

CREATE TABLE "PosOrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "posOrderId" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" REAL NOT NULL DEFAULT 1,
    "unitPrice" REAL NOT NULL DEFAULT 0,
    "taxAmount" REAL NOT NULL DEFAULT 0,
    "discountAmount" REAL NOT NULL DEFAULT 0,
    "lineTotal" REAL NOT NULL DEFAULT 0,
    "optionInfo" JSONB,
    "metadata" JSONB,
    CONSTRAINT "PosOrderItem_posOrderId_fkey" FOREIGN KEY ("posOrderId") REFERENCES "PosOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PosOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PosOrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "PosOrderItem_posOrderId_idx" ON "PosOrderItem"("posOrderId");

CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "posOrderId" TEXT,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "externalRef" TEXT,
    "runtimeExecutionId" TEXT,
    "missionId" TEXT,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Payment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Payment_posOrderId_fkey" FOREIGN KEY ("posOrderId") REFERENCES "PosOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "Payment_storeId_createdAt_idx" ON "Payment"("storeId", "createdAt");
CREATE INDEX "Payment_posOrderId_idx" ON "Payment"("posOrderId");

CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "posOrderId" TEXT NOT NULL,
    "receiptNumber" TEXT,
    "printedAt" DATETIME,
    "payload" JSONB,
    "runtimeExecutionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Receipt_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Receipt_posOrderId_fkey" FOREIGN KEY ("posOrderId") REFERENCES "PosOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Receipt_storeId_createdAt_idx" ON "Receipt"("storeId", "createdAt");
CREATE INDEX "Receipt_posOrderId_idx" ON "Receipt"("posOrderId");

CREATE TABLE "CommercePromotion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "type" TEXT NOT NULL DEFAULT 'discount',
    "value" REAL,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommercePromotion_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CommercePromotion_storeId_isActive_idx" ON "CommercePromotion"("storeId", "isActive");

CREATE TABLE "LoyaltyAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "tier" TEXT,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LoyaltyAccount_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LoyaltyAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CommerceCustomer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "LoyaltyAccount_customerId_key" ON "LoyaltyAccount"("customerId");
CREATE INDEX "LoyaltyAccount_storeId_idx" ON "LoyaltyAccount"("storeId");

CREATE TABLE "TaxProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" REAL NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaxProfile_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TaxProfile_storeId_idx" ON "TaxProfile"("storeId");

CREATE TABLE "CommerceBusinessSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "timezone" TEXT,
    "taxInclusive" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommerceBusinessSettings_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CommerceBusinessSettings_storeId_key" ON "CommerceBusinessSettings"("storeId");

CREATE TABLE "BusinessEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT,
    "aggregateId" TEXT,
    "payload" JSONB NOT NULL,
    "actorUserId" TEXT,
    "runtimeExecutionId" TEXT,
    "missionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BusinessEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "BusinessEvent_storeId_eventType_idx" ON "BusinessEvent"("storeId", "eventType");
CREATE INDEX "BusinessEvent_storeId_createdAt_idx" ON "BusinessEvent"("storeId", "createdAt");
CREATE INDEX "BusinessEvent_aggregateType_aggregateId_idx" ON "BusinessEvent"("aggregateType", "aggregateId");
