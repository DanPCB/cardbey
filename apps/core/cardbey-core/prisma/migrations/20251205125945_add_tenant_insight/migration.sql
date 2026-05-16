-- CreateTable
CREATE TABLE "TenantInsight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "reportId" TEXT,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summaryMd" TEXT NOT NULL,
    "tags" TEXT,
    "periodKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "TenantInsight_tenantId_kind_idx" ON "TenantInsight"("tenantId", "kind");

-- CreateIndex
CREATE INDEX "TenantInsight_tenantId_createdAt_idx" ON "TenantInsight"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "TenantInsight_reportId_idx" ON "TenantInsight"("reportId");
