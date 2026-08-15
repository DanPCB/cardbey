-- Template Library cluster catch-up (PostgreSQL, additive only).
-- Reviewed from `prisma migrate diff --from-migrations --to-schema-datamodel`.
-- Excluded from that diff: DROP TABLE/INDEX/FK, commerce/POS, creator/OAuth,
-- teacher_traces, BusinessEvent, business_*_events, updatedAt/default cleanup,
-- Live Market index renames, and any other unrelated objects.
-- Data-preserving: CREATE TABLE / INDEX / FK only. No drops, no renames.

-- CreateTable
CREATE TABLE "TemplateLibrary" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "thumbnailUrl" TEXT,
    "category" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentTemplate" (
    "id" TEXT NOT NULL,
    "libraryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "contentType" TEXT NOT NULL,
    "industry" TEXT,
    "useCase" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
    "currentVersionId" TEXT,
    "thumbnailUrl" TEXT,
    "previewUrls" TEXT NOT NULL DEFAULT '[]',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "supportedChannels" TEXT NOT NULL DEFAULT '[]',
    "supportedLocales" TEXT NOT NULL DEFAULT '["en"]',
    "qualityScore" INTEGER NOT NULL DEFAULT 0,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "legacyCreativeTemplateId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "schemaVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "definition" JSONB NOT NULL,
    "defaultData" JSONB,
    "fieldDefinitions" JSONB,
    "themeDefinition" JSONB,
    "layoutDefinition" JSONB,
    "assetManifest" JSONB,
    "supportedVariants" TEXT NOT NULL DEFAULT '[]',
    "renderPolicy" JSONB,
    "validationRules" JSONB,
    "changelog" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "immutableAfterPublish" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ContentTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateInstance" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "storeId" TEXT,
    "name" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "data" JSONB NOT NULL,
    "themeOverrides" JSONB,
    "layoutOverrides" JSONB,
    "assetBindings" JSONB,
    "selectedVariant" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "generatedArtifactId" TEXT,
    "sourceMissionId" TEXT,
    "idempotencyKey" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "TemplateInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateAsset" (
    "id" TEXT NOT NULL,
    "templateVersionId" TEXT,
    "templateInstanceId" TEXT,
    "assetType" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "publicUrl" TEXT,
    "storageKey" TEXT,
    "mimeType" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "duration" DOUBLE PRECISION,
    "attribution" TEXT,
    "licence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TemplateLibrary_slug_key" ON "TemplateLibrary"("slug");

-- CreateIndex
CREATE INDEX "TemplateLibrary_ownerType_ownerId_idx" ON "TemplateLibrary"("ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "TemplateLibrary_status_visibility_idx" ON "TemplateLibrary"("status", "visibility");

-- CreateIndex
CREATE INDEX "TemplateLibrary_category_idx" ON "TemplateLibrary"("category");

-- CreateIndex
CREATE INDEX "ContentTemplate_contentType_status_idx" ON "ContentTemplate"("contentType", "status");

-- CreateIndex
CREATE INDEX "ContentTemplate_industry_idx" ON "ContentTemplate"("industry");

-- CreateIndex
CREATE INDEX "ContentTemplate_status_visibility_idx" ON "ContentTemplate"("status", "visibility");

-- CreateIndex
CREATE UNIQUE INDEX "ContentTemplate_libraryId_slug_key" ON "ContentTemplate"("libraryId", "slug");

-- CreateIndex
CREATE INDEX "ContentTemplateVersion_templateId_idx" ON "ContentTemplateVersion"("templateId");

-- CreateIndex
CREATE INDEX "ContentTemplateVersion_publishedAt_idx" ON "ContentTemplateVersion"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContentTemplateVersion_templateId_versionNumber_key" ON "ContentTemplateVersion"("templateId", "versionNumber");

-- CreateIndex
CREATE INDEX "TemplateInstance_templateId_idx" ON "TemplateInstance"("templateId");

-- CreateIndex
CREATE INDEX "TemplateInstance_templateVersionId_idx" ON "TemplateInstance"("templateVersionId");

-- CreateIndex
CREATE INDEX "TemplateInstance_ownerType_ownerId_idx" ON "TemplateInstance"("ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "TemplateInstance_storeId_idx" ON "TemplateInstance"("storeId");

-- CreateIndex
CREATE INDEX "TemplateInstance_status_idx" ON "TemplateInstance"("status");

-- CreateIndex
CREATE INDEX "TemplateInstance_createdBy_idx" ON "TemplateInstance"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateInstance_idempotencyKey_key" ON "TemplateInstance"("idempotencyKey");

-- CreateIndex
CREATE INDEX "TemplateAsset_templateVersionId_idx" ON "TemplateAsset"("templateVersionId");

-- CreateIndex
CREATE INDEX "TemplateAsset_templateInstanceId_idx" ON "TemplateAsset"("templateInstanceId");

-- CreateIndex
CREATE INDEX "TemplateFavorite_userId_idx" ON "TemplateFavorite"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateFavorite_userId_templateId_key" ON "TemplateFavorite"("userId", "templateId");

-- AddForeignKey
ALTER TABLE "ContentTemplate" ADD CONSTRAINT "ContentTemplate_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "TemplateLibrary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentTemplateVersion" ADD CONSTRAINT "ContentTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ContentTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateInstance" ADD CONSTRAINT "TemplateInstance_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ContentTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateInstance" ADD CONSTRAINT "TemplateInstance_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "ContentTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateAsset" ADD CONSTRAINT "TemplateAsset_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "ContentTemplateVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateAsset" ADD CONSTRAINT "TemplateAsset_templateInstanceId_fkey" FOREIGN KEY ("templateInstanceId") REFERENCES "TemplateInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
