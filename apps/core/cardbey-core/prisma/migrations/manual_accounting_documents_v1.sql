-- Accounting Documents V1
-- Apply via prisma migrate when promoting. Models also in postgres/sqlite schema.prisma.

CREATE TABLE IF NOT EXISTS "BusinessBillingProfile" (
  "id" TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL UNIQUE,
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
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "AccountingDocumentSequence" (
  "id" TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "nextValue" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("storeId", "documentType")
);

CREATE TABLE IF NOT EXISTS "AccountingDocument" (
  "id" TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "documentNumber" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'AUD',
  "gstMode" TEXT NOT NULL DEFAULT 'GST_EXCLUSIVE',
  "issueDate" TIMESTAMP(3),
  "expiryDate" TIMESTAMP(3),
  "dueDate" TIMESTAMP(3),
  "issuedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "acceptedBy" TEXT,
  "acceptedByUserId" TEXT,
  "purchaseOrderRef" TEXT,
  "notes" TEXT,
  "terms" TEXT,
  "buyerJson" JSONB,
  "issuedSnapshot" JSONB,
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
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("storeId", "documentNumber")
);

CREATE TABLE IF NOT EXISTS "AccountingDocumentLine" (
  "id" TEXT PRIMARY KEY,
  "documentId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "sku" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "quantity" DOUBLE PRECISION NOT NULL,
  "unitPriceCents" INTEGER NOT NULL,
  "lineSubtotalCents" INTEGER NOT NULL,
  "lineGstCents" INTEGER NOT NULL,
  "lineTotalCents" INTEGER NOT NULL,
  "productId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "AccountingDocumentShare" (
  "id" TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "AccountingDocument_storeId_type_status_idx" ON "AccountingDocument"("storeId", "type", "status");
CREATE INDEX IF NOT EXISTS "AccountingDocumentLine_documentId_idx" ON "AccountingDocumentLine"("documentId");
CREATE INDEX IF NOT EXISTS "AccountingDocumentShare_token_idx" ON "AccountingDocumentShare"("token");
