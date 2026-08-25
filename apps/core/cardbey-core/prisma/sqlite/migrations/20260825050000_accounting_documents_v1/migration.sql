-- Additive Accounting Documents V1 (SQLite twin). Rollback: drop tables in reverse order.

CREATE TABLE "BusinessBillingProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "legalBusinessName" TEXT,
    "tradingName" TEXT,
    "abn" TEXT,
    "acn" TEXT,
    "billingAddress" TEXT,
    "billingEmail" TEXT,
    "billingPhone" TEXT,
    "website" TEXT,
    "logoUrl" TEXT,
    "contactPerson" TEXT,
    "gstRegistered" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "defaultGstMode" TEXT NOT NULL DEFAULT 'GST_EXCLUSIVE',
    "defaultQuoteExpiryDays" INTEGER NOT NULL DEFAULT 30,
    "defaultPaymentTermsDays" INTEGER NOT NULL DEFAULT 14,
    "defaultNotes" TEXT,
    "defaultTerms" TEXT,
    "bankAccountName" TEXT,
    "bsb" TEXT,
    "accountNumber" TEXT,
    "bankName" TEXT,
    "paymentReferenceInstructions" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BusinessBillingProfile_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BusinessBillingProfile_storeId_key" ON "BusinessBillingProfile"("storeId");

CREATE TABLE "AccountingDocumentSequence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "nextValue" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AccountingDocumentSequence_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AccountingDocumentSequence_storeId_documentType_key" ON "AccountingDocumentSequence"("storeId", "documentType");
CREATE INDEX "AccountingDocumentSequence_storeId_idx" ON "AccountingDocumentSequence"("storeId");

CREATE TABLE "AccountingDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "documentNumber" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "gstMode" TEXT NOT NULL DEFAULT 'GST_EXCLUSIVE',
    "issueDate" DATETIME,
    "expiryDate" DATETIME,
    "dueDate" DATETIME,
    "issuedAt" DATETIME,
    "paidAt" DATETIME,
    "acceptedAt" DATETIME,
    "acceptedBy" TEXT,
    "acceptedByUserId" TEXT,
    "purchaseOrderRef" TEXT,
    "notes" TEXT,
    "terms" TEXT,
    "buyerJson" TEXT,
    "issuedSnapshot" TEXT,
    "sourceQuoteId" TEXT,
    "convertedInvoiceId" TEXT,
    "quoteRequestId" TEXT,
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "gstCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "amountPaidCents" INTEGER NOT NULL DEFAULT 0,
    "balanceDueCents" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AccountingDocument_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AccountingDocument_storeId_documentNumber_key" ON "AccountingDocument"("storeId", "documentNumber");
CREATE INDEX "AccountingDocument_storeId_type_status_idx" ON "AccountingDocument"("storeId", "type", "status");
CREATE INDEX "AccountingDocument_storeId_updatedAt_idx" ON "AccountingDocument"("storeId", "updatedAt");
CREATE INDEX "AccountingDocument_sourceQuoteId_idx" ON "AccountingDocument"("sourceQuoteId");
CREATE INDEX "AccountingDocument_quoteRequestId_idx" ON "AccountingDocument"("quoteRequestId");

CREATE TABLE "AccountingDocumentLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "sku" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quantity" REAL NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "lineSubtotalCents" INTEGER NOT NULL,
    "lineGstCents" INTEGER NOT NULL,
    "lineTotalCents" INTEGER NOT NULL,
    "productId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AccountingDocumentLine_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AccountingDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AccountingDocumentLine_documentId_idx" ON "AccountingDocumentLine"("documentId");

CREATE TABLE "AccountingDocumentShare" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "revokedAt" DATETIME,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountingDocumentShare_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AccountingDocumentShare_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AccountingDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AccountingDocumentShare_token_key" ON "AccountingDocumentShare"("token");
CREATE INDEX "AccountingDocumentShare_storeId_idx" ON "AccountingDocumentShare"("storeId");
CREATE INDEX "AccountingDocumentShare_documentId_idx" ON "AccountingDocumentShare"("documentId");
