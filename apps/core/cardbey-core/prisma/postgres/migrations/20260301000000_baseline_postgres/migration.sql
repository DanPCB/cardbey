-- CreateEnum
CREATE TYPE "JourneyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('PENDING', 'READY', 'RUNNING', 'DONE', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "StepKind" AS ENUM ('INFO', 'FORM', 'ACTION', 'REVIEW');

-- CreateEnum
CREATE TYPE "ActionKind" AS ENUM ('NONE', 'CREATE_STORE', 'OCR_MENU', 'DESIGN_FLYER', 'PUBLISH_SCREEN', 'CREATE_CAMPAIGN', 'SEND_EMAIL', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "DisplayOrientation" AS ENUM ('AUTO', 'LANDSCAPE', 'PORTRAIT');

-- CreateEnum
CREATE TYPE "PlaylistType" AS ENUM ('MEDIA', 'SIGNAGE', 'PROMO');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "WorkflowTrigger" AS ENUM ('MANUAL', 'ONCE', 'DAILY');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RUNNING', 'DONE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "fullName" TEXT,
    "handle" TEXT,
    "avatarUrl" TEXT,
    "accountType" TEXT,
    "tagline" TEXT,
    "hasBusiness" BOOLEAN NOT NULL DEFAULT false,
    "onboarding" TEXT,
    "roles" TEXT NOT NULL DEFAULT '["viewer"]',
    "role" TEXT NOT NULL DEFAULT 'owner',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationToken" TEXT,
    "verificationExpires" TIMESTAMP(3),
    "resetToken" TEXT,
    "resetExpires" TIMESTAMP(3),
    "aiCreditsBalance" INTEGER NOT NULL DEFAULT 0,
    "welcomeFullStoreRemaining" INTEGER NOT NULL DEFAULT 1,
    "aiCreditsUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "translations" JSONB,
    "logo" TEXT,
    "region" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tradingHours" JSONB,
    "address" TEXT,
    "suburb" TEXT,
    "postcode" TEXT,
    "country" TEXT,
    "phone" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "tagline" TEXT,
    "heroText" TEXT,
    "heroImageUrl" TEXT,
    "avatarImageUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "stylePreferences" JSONB,
    "storefrontSettings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorePromo" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT,
    "heroImage" TEXT,
    "heroImageUrl" TEXT,
    "ctaLabel" TEXT,
    "targetUrl" TEXT NOT NULL,
    "code" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "scanCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorePromo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT,
    "description" TEXT,
    "translations" JSONB,
    "price" DOUBLE PRECISION,
    "currency" TEXT DEFAULT 'USD',
    "category" TEXT,
    "imageUrl" TEXT,
    "sku" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "images" JSONB,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "hasSam3Cutout" BOOLEAN NOT NULL DEFAULT false,
    "cutoutPath" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Demand" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "context" TEXT,
    "fulfilled" BOOLEAN NOT NULL DEFAULT false,
    "fulfilledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Demand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyTemplate" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "category" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JourneyTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyStepTemplate" (
    "id" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "hint" TEXT,
    "kind" "StepKind" NOT NULL DEFAULT 'INFO',
    "action" "ActionKind" NOT NULL DEFAULT 'NONE',
    "templateId" TEXT NOT NULL,
    "paramsJson" TEXT,

    CONSTRAINT "JourneyStepTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyInstance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "status" "JourneyStatus" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JourneyInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyStep" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "stepTemplateId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "status" "StepStatus" NOT NULL DEFAULT 'PENDING',
    "kind" "StepKind" NOT NULL DEFAULT 'INFO',
    "action" "ActionKind" NOT NULL DEFAULT 'NONE',
    "paramsJson" TEXT,
    "resultJson" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "JourneyStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannerTask" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlannerTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantSuggestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "templateId" TEXT,
    "title" TEXT NOT NULL,
    "reason" TEXT,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventLog" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" TEXT,

    CONSTRAINT "EventLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuggestionLog" (
    "id" TEXT NOT NULL,
    "node" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "impact" TEXT,
    "actions" TEXT NOT NULL,
    "sourceEvent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "appliedBy" TEXT,
    "appliedAt" TIMESTAMP(3),
    "latencyZoneAMs" INTEGER,
    "latencyZoneBMs" INTEGER,
    "latencyEndToEndMs" INTEGER,
    "tenantId" TEXT,

    CONSTRAINT "SuggestionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "correlationId" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceChange" (
    "id" TEXT NOT NULL,
    "suggestionId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "oldPrice" DOUBLE PRECISION,
    "newPrice" DOUBLE PRECISION,
    "deltaPercent" DOUBLE PRECISION NOT NULL,
    "duration" TEXT NOT NULL,
    "testGroup" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PriceChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReorderRequest" (
    "id" TEXT NOT NULL,
    "suggestionId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "priority" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),

    CONSTRAINT "ReorderRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeRefreshTask" (
    "id" TEXT NOT NULL,
    "suggestionId" TEXT NOT NULL,
    "banner" TEXT,
    "reason" TEXT NOT NULL,
    "currentCTR" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CreativeRefreshTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Screen" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "name" TEXT,
    "location" TEXT,
    "paired" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "statusText" TEXT,
    "lastSeen" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "orientation" TEXT NOT NULL DEFAULT 'horizontal',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "assignedPlaylistId" TEXT,
    "currentAsset" TEXT,
    "currentPlaylistId" TEXT,

    CONSTRAINT "Screen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "storageKey" TEXT,
    "optimizedUrl" TEXT,
    "optimizedKey" TEXT,
    "isOptimized" BOOLEAN NOT NULL DEFAULT false,
    "optimizedAt" TIMESTAMP(3),
    "kind" "MediaKind" NOT NULL,
    "mime" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationS" DOUBLE PRECISION,
    "sizeBytes" INTEGER NOT NULL,
    "missingFile" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Playlist" (
    "id" TEXT NOT NULL,
    "type" "PlaylistType" NOT NULL DEFAULT 'MEDIA',
    "name" TEXT NOT NULL,
    "tenantId" TEXT,
    "storeId" TEXT,
    "description" TEXT,
    "translations" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Playlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaylistItem" (
    "id" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "durationS" INTEGER NOT NULL DEFAULT 8,
    "mediaId" TEXT,
    "fit" TEXT DEFAULT 'cover',
    "muted" BOOLEAN DEFAULT false,
    "loop" BOOLEAN DEFAULT false,
    "displayOrientation" "DisplayOrientation" DEFAULT 'AUTO',
    "assetId" TEXT,

    CONSTRAINT "PlaylistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "trigger" "WorkflowTrigger" NOT NULL DEFAULT 'MANUAL',
    "actions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "productId" TEXT,
    "data" JSONB NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "workflowId" TEXT,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendProfile" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "season" TEXT,
    "domain" TEXT,
    "goal" TEXT,
    "source" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrendProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PairingSession" (
    "sessionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'showing_code',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "deviceToken" TEXT,
    "fingerprint" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "screenId" TEXT,
    "claimedBy" TEXT,
    "origin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PairingSession_pkey" PRIMARY KEY ("sessionId")
);

-- CreateTable
CREATE TABLE "PairCode" (
    "code" TEXT NOT NULL,
    "fingerprint" TEXT,
    "screenId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PairCode_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Content" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "elements" JSONB NOT NULL,
    "settings" JSONB NOT NULL,
    "renderSlide" JSONB,
    "thumbnailUrl" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyProgram" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stampsRequired" INTEGER NOT NULL,
    "reward" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyStamp" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "rewarded" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyStamp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyReward" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "reward" TEXT NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "value" DOUBLE PRECISION NOT NULL,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "usageLimit" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoRedemption" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "promoId" TEXT NOT NULL,
    "customerId" TEXT,
    "deviceId" TEXT,
    "orderId" TEXT,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignageAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "durationS" INTEGER NOT NULL,
    "tags" TEXT,
    "translations" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignageAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaylistSchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "deviceId" TEXT,
    "deviceGroupId" TEXT,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "daysOfWeek" TEXT,
    "timeRange" TEXT,

    CONSTRAINT "PlaylistSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "pairingCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'offline',
    "type" TEXT,
    "name" TEXT,
    "model" TEXT,
    "location" TEXT,
    "appVersion" TEXT,
    "platform" TEXT,
    "orientation" TEXT DEFAULT 'horizontal',
    "lastSeenAt" TIMESTAMP(3),
    "lastScreenshotBase64" TEXT,
    "lastScreenshotAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevicePairing" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "pairingCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "deviceId" TEXT,
    "deviceLabel" TEXT,

    CONSTRAINT "DevicePairing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceCapability" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceStateSnapshot" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "playlistVersion" TEXT,
    "storageFreeMb" INTEGER,
    "wifiStrength" INTEGER,
    "errorCodes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceStateSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevicePlaylistBinding" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "lastPushedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "DevicePlaylistBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceCommand" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemEvent" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "deviceId" TEXT,
    "tenantId" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemInsight" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "category" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceLog" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceAlert" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "message" TEXT,
    "deviceType" TEXT,
    "ip" TEXT,
    "engineVersion" TEXT,
    "env" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "DeviceAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RagChunk" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "sourcePath" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" BYTEA,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RagChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "deviceId" TEXT,
    "storeId" TEXT,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contentMd" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "tags" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantInsight" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reportId" TEXT,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summaryMd" TEXT NOT NULL,
    "tags" TEXT,
    "periodKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrchestratorTask" (
    "id" TEXT NOT NULL,
    "entryPoint" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "insightId" TEXT,
    "status" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrchestratorTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LlmCache" (
    "id" TEXT NOT NULL,
    "promptHash" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT '',
    "response" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrchestratorRunReward" (
    "id" TEXT NOT NULL,
    "orchestratorTaskId" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "toolCompletenessScore" DOUBLE PRECISION NOT NULL,
    "outcomeQualityScore" DOUBLE PRECISION NOT NULL,
    "overallReward" DOUBLE PRECISION NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrchestratorRunReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaidAiJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "actionName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaidAiJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "triggerMessageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTask" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "userMessageId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentProfile" (
    "id" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "skills" JSONB,
    "baseQuality" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "baseCost" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "baseLatency" INTEGER NOT NULL DEFAULT 5000,
    "reliabilityScore" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "maxConcurrency" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bid" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "components" JSONB,
    "rationale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "agentRunId" TEXT,
    "matchedScore" DOUBLE PRECISION NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "success" BOOLEAN,
    "metrics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteractionFeedback" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "userMessageId" TEXT,
    "assignmentId" TEXT NOT NULL,
    "userRating" TEXT,
    "systemQualityScore" DOUBLE PRECISION,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InteractionFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationThread" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT,
    "missionId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "kind" TEXT,
    "scopeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThreadParticipant" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "participantType" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThreadParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatThread" (
    "id" TEXT NOT NULL,
    "missionId" TEXT,
    "title" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatThreadParticipant" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "participantType" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatThreadParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentMessage" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "visibleToUser" BOOLEAN NOT NULL DEFAULT true,
    "channel" TEXT NOT NULL,
    "performative" TEXT,
    "messageType" TEXT NOT NULL DEFAULT 'text',
    "content" JSONB NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taskId" TEXT,
    "threadId" TEXT,

    CONSTRAINT "AgentMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentChatConfig" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "useResearchAgent" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentChatConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionTask" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "normalizedLabel" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sourceMessageId" TEXT NOT NULL,
    "chainId" TEXT,
    "suggestionId" TEXT,
    "agentKey" TEXT,
    "agentKeyRecommended" TEXT,
    "intent" TEXT,
    "risk" TEXT,
    "lastRunId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MissionTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MIEntity" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "previewUrl" TEXT,
    "dimensions" TEXT,
    "orientation" TEXT,
    "durationSec" INTEGER,
    "createdByUserId" TEXT NOT NULL,
    "createdByEngine" TEXT NOT NULL,
    "sourceProjectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT,
    "storeId" TEXT,
    "campaignId" TEXT,
    "creativeAssetId" TEXT,
    "reportId" TEXT,
    "screenItemId" TEXT,
    "packagingId" TEXT,
    "miBrain" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "templateId" TEXT,

    CONSTRAINT "MIEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "storeId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "thumbnailUrl" TEXT,
    "baseContentId" TEXT,
    "channels" TEXT NOT NULL DEFAULT '[]',
    "role" TEXT,
    "primaryIntent" TEXT,
    "orientation" TEXT,
    "minDurationS" INTEGER,
    "maxDurationS" INTEGER,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "businessCategories" JSONB,
    "useCases" JSONB,
    "styleTags" JSONB,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "fields" JSONB,
    "aiContext" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreativeTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GreetingCard" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "title" TEXT,
    "message" TEXT,
    "coverImageUrl" TEXT,
    "mediaUrl" TEXT,
    "payloadJson" JSONB,
    "shareSlug" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GreetingCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiVideoTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "occasionType" TEXT NOT NULL,
    "orientation" TEXT NOT NULL,
    "backgroundUrl" TEXT NOT NULL,
    "posterUrl" TEXT NOT NULL,
    "textZonesJson" JSONB NOT NULL,
    "textStylesJson" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MiVideoTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiMusicTrack" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "audioUrl" TEXT NOT NULL,
    "duration" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MiMusicTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftStore" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "generationRunId" TEXT,
    "input" JSONB NOT NULL,
    "preview" JSONB,
    "error" TEXT,
    "errorCode" TEXT,
    "recommendedAction" TEXT,
    "committedAt" TIMESTAMP(3),
    "committedStoreId" TEXT,
    "committedUserId" TEXT,
    "ownerUserId" TEXT,
    "guestSessionId" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "DraftStore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "workflowKey" TEXT NOT NULL,
    "draftStoreId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "failureCode" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowIncident" (
    "id" TEXT NOT NULL,
    "workflowKey" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "draftStoreId" TEXT,
    "runId" TEXT,
    "reasonKey" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "WorkflowIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowReport" (
    "id" TEXT NOT NULL,
    "workflowKey" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "draftId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "meta" JSONB,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeedCatalog" (
    "id" TEXT NOT NULL,
    "verticalSlug" TEXT NOT NULL,
    "subIntent" TEXT NOT NULL DEFAULT '',
    "itemsJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeedCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentIngestSample" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generationRunId" TEXT,
    "jobId" TEXT,
    "draftId" TEXT,
    "sourceType" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "includeImages" BOOLEAN NOT NULL DEFAULT true,
    "templateKey" TEXT,
    "websiteDomain" TEXT,
    "vertical" TEXT,
    "rawInputSanitized" TEXT,
    "ocrTextSanitized" TEXT,
    "outputCatalog" JSONB NOT NULL,
    "meta" JSONB,

    CONSTRAINT "ContentIngestSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmartObject" (
    "id" TEXT NOT NULL,
    "publicCode" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'print_bag',
    "status" TEXT NOT NULL DEFAULT 'active',
    "activePromoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmartObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DynamicQr" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "targetPath" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DynamicQr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanEvent" (
    "id" TEXT NOT NULL,
    "dynamicQrId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "referer" TEXT,

    CONSTRAINT "ScanEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeedAsset" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAssetId" TEXT NOT NULL,
    "sourcePageUrl" TEXT,
    "photographerName" TEXT,
    "photographerUrl" TEXT,
    "licenseName" TEXT,
    "licenseUrl" TEXT,
    "attributionText" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "orientation" TEXT,
    "tags" JSONB,
    "vertical" TEXT,
    "categoryKey" TEXT,
    "sha256" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ingestionJobId" TEXT,

    CONSTRAINT "SeedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeedAssetFile" (
    "id" TEXT NOT NULL,
    "seedAssetId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'full',
    "width" INTEGER,
    "height" INTEGER,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeedAssetFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeedIngestionJob" (
    "id" TEXT NOT NULL,
    "provider" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "meta" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeedIngestionJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_handle_idx" ON "User"("handle");

-- CreateIndex
CREATE INDEX "User_verificationToken_idx" ON "User"("verificationToken");

-- CreateIndex
CREATE INDEX "User_resetToken_idx" ON "User"("resetToken");

-- CreateIndex
CREATE UNIQUE INDEX "Business_userId_key" ON "Business"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Business_slug_key" ON "Business"("slug");

-- CreateIndex
CREATE INDEX "Business_slug_idx" ON "Business"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "StorePromo_slug_key" ON "StorePromo"("slug");

-- CreateIndex
CREATE INDEX "StorePromo_storeId_idx" ON "StorePromo"("storeId");

-- CreateIndex
CREATE INDEX "StorePromo_slug_idx" ON "StorePromo"("slug");

-- CreateIndex
CREATE INDEX "StorePromo_isActive_idx" ON "StorePromo"("isActive");

-- CreateIndex
CREATE INDEX "Product_businessId_idx" ON "Product"("businessId");

-- CreateIndex
CREATE INDEX "Product_businessId_isPublished_idx" ON "Product"("businessId", "isPublished");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE INDEX "Product_deletedAt_idx" ON "Product"("deletedAt");

-- CreateIndex
CREATE INDEX "Product_hasSam3Cutout_idx" ON "Product"("hasSam3Cutout");

-- CreateIndex
CREATE UNIQUE INDEX "Product_businessId_normalizedName_key" ON "Product"("businessId", "normalizedName");

-- CreateIndex
CREATE INDEX "Demand_userId_idx" ON "Demand"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyTemplate_slug_key" ON "JourneyTemplate"("slug");

-- CreateIndex
CREATE INDEX "JourneyTemplate_slug_idx" ON "JourneyTemplate"("slug");

-- CreateIndex
CREATE INDEX "JourneyTemplate_category_idx" ON "JourneyTemplate"("category");

-- CreateIndex
CREATE INDEX "JourneyStepTemplate_templateId_orderIndex_idx" ON "JourneyStepTemplate"("templateId", "orderIndex");

-- CreateIndex
CREATE INDEX "JourneyInstance_userId_idx" ON "JourneyInstance"("userId");

-- CreateIndex
CREATE INDEX "JourneyInstance_status_idx" ON "JourneyInstance"("status");

-- CreateIndex
CREATE INDEX "JourneyStep_instanceId_orderIndex_idx" ON "JourneyStep"("instanceId", "orderIndex");

-- CreateIndex
CREATE INDEX "JourneyStep_status_idx" ON "JourneyStep"("status");

-- CreateIndex
CREATE INDEX "PlannerTask_userId_idx" ON "PlannerTask"("userId");

-- CreateIndex
CREATE INDEX "PlannerTask_status_runAt_idx" ON "PlannerTask"("status", "runAt");

-- CreateIndex
CREATE INDEX "AssistantSuggestion_userId_mode_idx" ON "AssistantSuggestion"("userId", "mode");

-- CreateIndex
CREATE INDEX "AssistantSuggestion_score_idx" ON "AssistantSuggestion"("score");

-- CreateIndex
CREATE INDEX "EventLog_kind_idx" ON "EventLog"("kind");

-- CreateIndex
CREATE INDEX "EventLog_zone_idx" ON "EventLog"("zone");

-- CreateIndex
CREATE INDEX "EventLog_occurredAt_idx" ON "EventLog"("occurredAt");

-- CreateIndex
CREATE INDEX "SuggestionLog_node_idx" ON "SuggestionLog"("node");

-- CreateIndex
CREATE INDEX "SuggestionLog_status_idx" ON "SuggestionLog"("status");

-- CreateIndex
CREATE INDEX "SuggestionLog_createdAt_idx" ON "SuggestionLog"("createdAt");

-- CreateIndex
CREATE INDEX "SuggestionLog_tenantId_idx" ON "SuggestionLog"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_keyHash_key" ON "IdempotencyKey"("keyHash");

-- CreateIndex
CREATE INDEX "IdempotencyKey_keyHash_idx" ON "IdempotencyKey"("keyHash");

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_createdAt_idx" ON "AuditEvent"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_correlationId_idx" ON "AuditEvent"("correlationId");

-- CreateIndex
CREATE INDEX "PriceChange_suggestionId_idx" ON "PriceChange"("suggestionId");

-- CreateIndex
CREATE INDEX "PriceChange_sku_idx" ON "PriceChange"("sku");

-- CreateIndex
CREATE INDEX "PriceChange_status_idx" ON "PriceChange"("status");

-- CreateIndex
CREATE INDEX "ReorderRequest_suggestionId_idx" ON "ReorderRequest"("suggestionId");

-- CreateIndex
CREATE INDEX "ReorderRequest_sku_idx" ON "ReorderRequest"("sku");

-- CreateIndex
CREATE INDEX "ReorderRequest_status_idx" ON "ReorderRequest"("status");

-- CreateIndex
CREATE INDEX "CreativeRefreshTask_suggestionId_idx" ON "CreativeRefreshTask"("suggestionId");

-- CreateIndex
CREATE INDEX "CreativeRefreshTask_status_idx" ON "CreativeRefreshTask"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Screen_fingerprint_key" ON "Screen"("fingerprint");

-- CreateIndex
CREATE INDEX "Screen_deletedAt_idx" ON "Screen"("deletedAt");

-- CreateIndex
CREATE INDEX "Media_missingFile_idx" ON "Media"("missingFile");

-- CreateIndex
CREATE INDEX "Media_isOptimized_idx" ON "Media"("isOptimized");

-- CreateIndex
CREATE INDEX "Media_storageKey_idx" ON "Media"("storageKey");

-- CreateIndex
CREATE INDEX "Playlist_type_idx" ON "Playlist"("type");

-- CreateIndex
CREATE INDEX "Playlist_tenantId_storeId_idx" ON "Playlist"("tenantId", "storeId");

-- CreateIndex
CREATE INDEX "Playlist_active_idx" ON "Playlist"("active");

-- CreateIndex
CREATE INDEX "Playlist_type_active_idx" ON "Playlist"("type", "active");

-- CreateIndex
CREATE INDEX "PlaylistItem_playlistId_orderIndex_idx" ON "PlaylistItem"("playlistId", "orderIndex");

-- CreateIndex
CREATE INDEX "PlaylistItem_mediaId_idx" ON "PlaylistItem"("mediaId");

-- CreateIndex
CREATE INDEX "PlaylistItem_assetId_idx" ON "PlaylistItem"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "TrendProfile_slug_key" ON "TrendProfile"("slug");

-- CreateIndex
CREATE INDEX "TrendProfile_slug_idx" ON "TrendProfile"("slug");

-- CreateIndex
CREATE INDEX "TrendProfile_isActive_goal_idx" ON "TrendProfile"("isActive", "goal");

-- CreateIndex
CREATE INDEX "TrendProfile_season_idx" ON "TrendProfile"("season");

-- CreateIndex
CREATE UNIQUE INDEX "PairingSession_code_key" ON "PairingSession"("code");

-- CreateIndex
CREATE INDEX "PairingSession_code_idx" ON "PairingSession"("code");

-- CreateIndex
CREATE INDEX "PairingSession_expiresAt_idx" ON "PairingSession"("expiresAt");

-- CreateIndex
CREATE INDEX "PairingSession_status_idx" ON "PairingSession"("status");

-- CreateIndex
CREATE INDEX "PairingSession_fingerprint_idx" ON "PairingSession"("fingerprint");

-- CreateIndex
CREATE INDEX "PairCode_fingerprint_idx" ON "PairCode"("fingerprint");

-- CreateIndex
CREATE INDEX "Content_userId_idx" ON "Content"("userId");

-- CreateIndex
CREATE INDEX "Content_createdAt_idx" ON "Content"("createdAt");

-- CreateIndex
CREATE INDEX "LoyaltyProgram_tenantId_idx" ON "LoyaltyProgram"("tenantId");

-- CreateIndex
CREATE INDEX "LoyaltyProgram_storeId_idx" ON "LoyaltyProgram"("storeId");

-- CreateIndex
CREATE INDEX "LoyaltyProgram_expiresAt_idx" ON "LoyaltyProgram"("expiresAt");

-- CreateIndex
CREATE INDEX "LoyaltyStamp_tenantId_idx" ON "LoyaltyStamp"("tenantId");

-- CreateIndex
CREATE INDEX "LoyaltyStamp_storeId_idx" ON "LoyaltyStamp"("storeId");

-- CreateIndex
CREATE INDEX "LoyaltyStamp_programId_idx" ON "LoyaltyStamp"("programId");

-- CreateIndex
CREATE INDEX "LoyaltyStamp_customerId_idx" ON "LoyaltyStamp"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyStamp_tenantId_storeId_programId_customerId_key" ON "LoyaltyStamp"("tenantId", "storeId", "programId", "customerId");

-- CreateIndex
CREATE INDEX "LoyaltyReward_tenantId_idx" ON "LoyaltyReward"("tenantId");

-- CreateIndex
CREATE INDEX "LoyaltyReward_storeId_idx" ON "LoyaltyReward"("storeId");

-- CreateIndex
CREATE INDEX "LoyaltyReward_programId_idx" ON "LoyaltyReward"("programId");

-- CreateIndex
CREATE INDEX "LoyaltyReward_customerId_idx" ON "LoyaltyReward"("customerId");

-- CreateIndex
CREATE INDEX "LoyaltyReward_redeemedAt_idx" ON "LoyaltyReward"("redeemedAt");

-- CreateIndex
CREATE INDEX "PromoRule_tenantId_idx" ON "PromoRule"("tenantId");

-- CreateIndex
CREATE INDEX "PromoRule_storeId_idx" ON "PromoRule"("storeId");

-- CreateIndex
CREATE INDEX "PromoRule_active_idx" ON "PromoRule"("active");

-- CreateIndex
CREATE INDEX "PromoRule_startAt_endAt_idx" ON "PromoRule"("startAt", "endAt");

-- CreateIndex
CREATE INDEX "PromoRedemption_tenantId_idx" ON "PromoRedemption"("tenantId");

-- CreateIndex
CREATE INDEX "PromoRedemption_storeId_idx" ON "PromoRedemption"("storeId");

-- CreateIndex
CREATE INDEX "PromoRedemption_promoId_idx" ON "PromoRedemption"("promoId");

-- CreateIndex
CREATE INDEX "PromoRedemption_customerId_idx" ON "PromoRedemption"("customerId");

-- CreateIndex
CREATE INDEX "PromoRedemption_redeemedAt_idx" ON "PromoRedemption"("redeemedAt");

-- CreateIndex
CREATE INDEX "SignageAsset_tenantId_idx" ON "SignageAsset"("tenantId");

-- CreateIndex
CREATE INDEX "SignageAsset_storeId_idx" ON "SignageAsset"("storeId");

-- CreateIndex
CREATE INDEX "SignageAsset_type_idx" ON "SignageAsset"("type");

-- CreateIndex
CREATE INDEX "PlaylistSchedule_tenantId_idx" ON "PlaylistSchedule"("tenantId");

-- CreateIndex
CREATE INDEX "PlaylistSchedule_storeId_idx" ON "PlaylistSchedule"("storeId");

-- CreateIndex
CREATE INDEX "PlaylistSchedule_playlistId_idx" ON "PlaylistSchedule"("playlistId");

-- CreateIndex
CREATE INDEX "PlaylistSchedule_deviceId_idx" ON "PlaylistSchedule"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_pairingCode_key" ON "Device"("pairingCode");

-- CreateIndex
CREATE INDEX "Device_tenantId_idx" ON "Device"("tenantId");

-- CreateIndex
CREATE INDEX "Device_storeId_idx" ON "Device"("storeId");

-- CreateIndex
CREATE INDEX "Device_status_idx" ON "Device"("status");

-- CreateIndex
CREATE INDEX "Device_pairingCode_idx" ON "Device"("pairingCode");

-- CreateIndex
CREATE INDEX "Device_lastSeenAt_idx" ON "Device"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "DevicePairing_pairingCode_key" ON "DevicePairing"("pairingCode");

-- CreateIndex
CREATE INDEX "DevicePairing_pairingCode_idx" ON "DevicePairing"("pairingCode");

-- CreateIndex
CREATE INDEX "DevicePairing_tenantId_storeId_idx" ON "DevicePairing"("tenantId", "storeId");

-- CreateIndex
CREATE INDEX "DevicePairing_status_idx" ON "DevicePairing"("status");

-- CreateIndex
CREATE INDEX "DevicePairing_expiresAt_idx" ON "DevicePairing"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceCapability_deviceId_key" ON "DeviceCapability"("deviceId");

-- CreateIndex
CREATE INDEX "DeviceStateSnapshot_deviceId_createdAt_idx" ON "DeviceStateSnapshot"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "DevicePlaylistBinding_deviceId_idx" ON "DevicePlaylistBinding"("deviceId");

-- CreateIndex
CREATE INDEX "DevicePlaylistBinding_playlistId_idx" ON "DevicePlaylistBinding"("playlistId");

-- CreateIndex
CREATE INDEX "DevicePlaylistBinding_status_idx" ON "DevicePlaylistBinding"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DevicePlaylistBinding_deviceId_playlistId_key" ON "DevicePlaylistBinding"("deviceId", "playlistId");

-- CreateIndex
CREATE INDEX "DeviceCommand_deviceId_idx" ON "DeviceCommand"("deviceId");

-- CreateIndex
CREATE INDEX "DeviceCommand_deviceId_status_idx" ON "DeviceCommand"("deviceId", "status");

-- CreateIndex
CREATE INDEX "DeviceCommand_status_idx" ON "DeviceCommand"("status");

-- CreateIndex
CREATE INDEX "DeviceCommand_createdAt_idx" ON "DeviceCommand"("createdAt");

-- CreateIndex
CREATE INDEX "SystemEvent_source_idx" ON "SystemEvent"("source");

-- CreateIndex
CREATE INDEX "SystemEvent_type_idx" ON "SystemEvent"("type");

-- CreateIndex
CREATE INDEX "SystemEvent_deviceId_idx" ON "SystemEvent"("deviceId");

-- CreateIndex
CREATE INDEX "SystemEvent_tenantId_idx" ON "SystemEvent"("tenantId");

-- CreateIndex
CREATE INDEX "SystemEvent_severity_idx" ON "SystemEvent"("severity");

-- CreateIndex
CREATE INDEX "SystemEvent_createdAt_idx" ON "SystemEvent"("createdAt");

-- CreateIndex
CREATE INDEX "SystemInsight_severity_idx" ON "SystemInsight"("severity");

-- CreateIndex
CREATE INDEX "SystemInsight_category_idx" ON "SystemInsight"("category");

-- CreateIndex
CREATE INDEX "SystemInsight_createdAt_idx" ON "SystemInsight"("createdAt");

-- CreateIndex
CREATE INDEX "DeviceLog_deviceId_idx" ON "DeviceLog"("deviceId");

-- CreateIndex
CREATE INDEX "DeviceLog_deviceId_createdAt_idx" ON "DeviceLog"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "DeviceLog_source_idx" ON "DeviceLog"("source");

-- CreateIndex
CREATE INDEX "DeviceLog_level_idx" ON "DeviceLog"("level");

-- CreateIndex
CREATE INDEX "DeviceLog_createdAt_idx" ON "DeviceLog"("createdAt");

-- CreateIndex
CREATE INDEX "DeviceAlert_deviceId_idx" ON "DeviceAlert"("deviceId");

-- CreateIndex
CREATE INDEX "DeviceAlert_deviceId_createdAt_idx" ON "DeviceAlert"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "DeviceAlert_type_idx" ON "DeviceAlert"("type");

-- CreateIndex
CREATE INDEX "DeviceAlert_status_idx" ON "DeviceAlert"("status");

-- CreateIndex
CREATE INDEX "DeviceAlert_createdAt_idx" ON "DeviceAlert"("createdAt");

-- CreateIndex
CREATE INDEX "RagChunk_scope_idx" ON "RagChunk"("scope");

-- CreateIndex
CREATE INDEX "RagChunk_scope_tenantId_idx" ON "RagChunk"("scope", "tenantId");

-- CreateIndex
CREATE INDEX "RagChunk_sourcePath_chunkIndex_idx" ON "RagChunk"("sourcePath", "chunkIndex");

-- CreateIndex
CREATE UNIQUE INDEX "RagChunk_sourcePath_chunkIndex_key" ON "RagChunk"("sourcePath", "chunkIndex");

-- CreateIndex
CREATE INDEX "ActivityEvent_tenantId_occurredAt_idx" ON "ActivityEvent"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_deviceId_occurredAt_idx" ON "ActivityEvent"("deviceId", "occurredAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_storeId_occurredAt_idx" ON "ActivityEvent"("storeId", "occurredAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_type_occurredAt_idx" ON "ActivityEvent"("type", "occurredAt");

-- CreateIndex
CREATE INDEX "TenantReport_tenantId_kind_periodKey_idx" ON "TenantReport"("tenantId", "kind", "periodKey");

-- CreateIndex
CREATE INDEX "TenantInsight_tenantId_kind_idx" ON "TenantInsight"("tenantId", "kind");

-- CreateIndex
CREATE INDEX "TenantInsight_tenantId_createdAt_idx" ON "TenantInsight"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "TenantInsight_reportId_idx" ON "TenantInsight"("reportId");

-- CreateIndex
CREATE INDEX "OrchestratorTask_tenantId_createdAt_idx" ON "OrchestratorTask"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "OrchestratorTask_tenantId_status_idx" ON "OrchestratorTask"("tenantId", "status");

-- CreateIndex
CREATE INDEX "OrchestratorTask_entryPoint_idx" ON "OrchestratorTask"("entryPoint");

-- CreateIndex
CREATE INDEX "OrchestratorTask_insightId_idx" ON "OrchestratorTask"("insightId");

-- CreateIndex
CREATE INDEX "LlmCache_promptHash_idx" ON "LlmCache"("promptHash");

-- CreateIndex
CREATE UNIQUE INDEX "LlmCache_promptHash_provider_model_key" ON "LlmCache"("promptHash", "provider", "model");

-- CreateIndex
CREATE INDEX "OrchestratorRunReward_orchestratorTaskId_idx" ON "OrchestratorRunReward"("orchestratorTaskId");

-- CreateIndex
CREATE INDEX "OrchestratorRunReward_missionId_idx" ON "OrchestratorRunReward"("missionId");

-- CreateIndex
CREATE INDEX "OrchestratorRunReward_tenantId_idx" ON "OrchestratorRunReward"("tenantId");

-- CreateIndex
CREATE INDEX "OrchestratorRunReward_createdAt_idx" ON "OrchestratorRunReward"("createdAt");

-- CreateIndex
CREATE INDEX "PaidAiJob_userId_status_idx" ON "PaidAiJob"("userId", "status");

-- CreateIndex
CREATE INDEX "PaidAiJob_refId_idx" ON "PaidAiJob"("refId");

-- CreateIndex
CREATE UNIQUE INDEX "PaidAiJob_userId_refId_actionName_key" ON "PaidAiJob"("userId", "refId", "actionName");

-- CreateIndex
CREATE INDEX "Mission_tenantId_updatedAt_idx" ON "Mission"("tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX "Mission_createdByUserId_updatedAt_idx" ON "Mission"("createdByUserId", "updatedAt");

-- CreateIndex
CREATE INDEX "AgentRun_missionId_createdAt_idx" ON "AgentRun"("missionId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_tenantId_createdAt_idx" ON "AgentRun"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_status_updatedAt_idx" ON "AgentRun"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "AgentTask_missionId_createdAt_idx" ON "AgentTask"("missionId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentTask_status_idx" ON "AgentTask"("status");

-- CreateIndex
CREATE INDEX "AgentTask_type_idx" ON "AgentTask"("type");

-- CreateIndex
CREATE UNIQUE INDEX "AgentProfile_agentKey_key" ON "AgentProfile"("agentKey");

-- CreateIndex
CREATE INDEX "AgentProfile_agentKey_idx" ON "AgentProfile"("agentKey");

-- CreateIndex
CREATE INDEX "Bid_taskId_idx" ON "Bid"("taskId");

-- CreateIndex
CREATE INDEX "Bid_agentKey_idx" ON "Bid"("agentKey");

-- CreateIndex
CREATE UNIQUE INDEX "Bid_taskId_agentKey_key" ON "Bid"("taskId", "agentKey");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_agentRunId_key" ON "Assignment"("agentRunId");

-- CreateIndex
CREATE INDEX "Assignment_taskId_idx" ON "Assignment"("taskId");

-- CreateIndex
CREATE INDEX "Assignment_agentKey_idx" ON "Assignment"("agentKey");

-- CreateIndex
CREATE INDEX "Assignment_agentRunId_idx" ON "Assignment"("agentRunId");

-- CreateIndex
CREATE INDEX "Assignment_assignedAt_idx" ON "Assignment"("assignedAt");

-- CreateIndex
CREATE INDEX "InteractionFeedback_missionId_idx" ON "InteractionFeedback"("missionId");

-- CreateIndex
CREATE INDEX "InteractionFeedback_assignmentId_idx" ON "InteractionFeedback"("assignmentId");

-- CreateIndex
CREATE INDEX "ConversationThread_tenantId_createdAt_idx" ON "ConversationThread"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ConversationThread_tenantId_updatedAt_idx" ON "ConversationThread"("tenantId", "updatedAt");

-- CreateIndex
CREATE INDEX "ConversationThread_missionId_idx" ON "ConversationThread"("missionId");

-- CreateIndex
CREATE INDEX "ConversationThread_createdByUserId_idx" ON "ConversationThread"("createdByUserId");

-- CreateIndex
CREATE INDEX "ConversationThread_kind_idx" ON "ConversationThread"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationThread_scopeKey_key" ON "ConversationThread"("scopeKey");

-- CreateIndex
CREATE INDEX "ThreadParticipant_threadId_idx" ON "ThreadParticipant"("threadId");

-- CreateIndex
CREATE INDEX "ThreadParticipant_threadId_participantType_idx" ON "ThreadParticipant"("threadId", "participantType");

-- CreateIndex
CREATE INDEX "ThreadParticipant_threadId_createdAt_idx" ON "ThreadParticipant"("threadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ThreadParticipant_threadId_participantType_participantId_key" ON "ThreadParticipant"("threadId", "participantType", "participantId");

-- CreateIndex
CREATE INDEX "ChatThread_missionId_idx" ON "ChatThread"("missionId");

-- CreateIndex
CREATE INDEX "ChatThread_createdByUserId_idx" ON "ChatThread"("createdByUserId");

-- CreateIndex
CREATE INDEX "ChatThreadParticipant_threadId_idx" ON "ChatThreadParticipant"("threadId");

-- CreateIndex
CREATE INDEX "ChatThreadParticipant_threadId_participantType_idx" ON "ChatThreadParticipant"("threadId", "participantType");

-- CreateIndex
CREATE INDEX "AgentMessage_missionId_idx" ON "AgentMessage"("missionId");

-- CreateIndex
CREATE INDEX "AgentMessage_missionId_channel_idx" ON "AgentMessage"("missionId", "channel");

-- CreateIndex
CREATE INDEX "AgentMessage_createdAt_idx" ON "AgentMessage"("createdAt");

-- CreateIndex
CREATE INDEX "AgentMessage_threadId_idx" ON "AgentMessage"("threadId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentChatConfig_missionId_key" ON "AgentChatConfig"("missionId");

-- CreateIndex
CREATE INDEX "AgentChatConfig_missionId_idx" ON "AgentChatConfig"("missionId");

-- CreateIndex
CREATE INDEX "MissionTask_missionId_createdAt_idx" ON "MissionTask"("missionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MissionTask_missionId_sourceMessageId_normalizedLabel_key" ON "MissionTask"("missionId", "sourceMessageId", "normalizedLabel");

-- CreateIndex
CREATE INDEX "MIEntity_productId_idx" ON "MIEntity"("productId");

-- CreateIndex
CREATE INDEX "MIEntity_productType_idx" ON "MIEntity"("productType");

-- CreateIndex
CREATE INDEX "MIEntity_tenantId_idx" ON "MIEntity"("tenantId");

-- CreateIndex
CREATE INDEX "MIEntity_storeId_idx" ON "MIEntity"("storeId");

-- CreateIndex
CREATE INDEX "MIEntity_campaignId_idx" ON "MIEntity"("campaignId");

-- CreateIndex
CREATE INDEX "MIEntity_creativeAssetId_idx" ON "MIEntity"("creativeAssetId");

-- CreateIndex
CREATE INDEX "MIEntity_reportId_idx" ON "MIEntity"("reportId");

-- CreateIndex
CREATE INDEX "MIEntity_screenItemId_idx" ON "MIEntity"("screenItemId");

-- CreateIndex
CREATE INDEX "MIEntity_status_idx" ON "MIEntity"("status");

-- CreateIndex
CREATE INDEX "MIEntity_createdByUserId_idx" ON "MIEntity"("createdByUserId");

-- CreateIndex
CREATE INDEX "MIEntity_templateId_idx" ON "MIEntity"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "MIEntity_creativeAssetId_key" ON "MIEntity"("creativeAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "MIEntity_reportId_key" ON "MIEntity"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "MIEntity_screenItemId_key" ON "MIEntity"("screenItemId");

-- CreateIndex
CREATE UNIQUE INDEX "MIEntity_packagingId_key" ON "MIEntity"("packagingId");

-- CreateIndex
CREATE UNIQUE INDEX "MIEntity_templateId_key" ON "MIEntity"("templateId");

-- CreateIndex
CREATE INDEX "CreativeTemplate_tenantId_storeId_idx" ON "CreativeTemplate"("tenantId", "storeId");

-- CreateIndex
CREATE INDEX "CreativeTemplate_role_primaryIntent_idx" ON "CreativeTemplate"("role", "primaryIntent");

-- CreateIndex
CREATE INDEX "CreativeTemplate_orientation_idx" ON "CreativeTemplate"("orientation");

-- CreateIndex
CREATE INDEX "CreativeTemplate_isActive_idx" ON "CreativeTemplate"("isActive");

-- CreateIndex
CREATE INDEX "CreativeTemplate_isSystem_idx" ON "CreativeTemplate"("isSystem");

-- CreateIndex
CREATE UNIQUE INDEX "GreetingCard_shareSlug_key" ON "GreetingCard"("shareSlug");

-- CreateIndex
CREATE INDEX "GreetingCard_ownerId_idx" ON "GreetingCard"("ownerId");

-- CreateIndex
CREATE INDEX "GreetingCard_shareSlug_idx" ON "GreetingCard"("shareSlug");

-- CreateIndex
CREATE INDEX "GreetingCard_isPublished_idx" ON "GreetingCard"("isPublished");

-- CreateIndex
CREATE INDEX "GreetingCard_type_idx" ON "GreetingCard"("type");

-- CreateIndex
CREATE UNIQUE INDEX "MiVideoTemplate_key_key" ON "MiVideoTemplate"("key");

-- CreateIndex
CREATE INDEX "MiVideoTemplate_occasionType_idx" ON "MiVideoTemplate"("occasionType");

-- CreateIndex
CREATE INDEX "MiVideoTemplate_orientation_idx" ON "MiVideoTemplate"("orientation");

-- CreateIndex
CREATE INDEX "MiVideoTemplate_isActive_idx" ON "MiVideoTemplate"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "MiMusicTrack_key_key" ON "MiMusicTrack"("key");

-- CreateIndex
CREATE INDEX "MiMusicTrack_category_idx" ON "MiMusicTrack"("category");

-- CreateIndex
CREATE INDEX "MiMusicTrack_isActive_idx" ON "MiMusicTrack"("isActive");

-- CreateIndex
CREATE INDEX "MiMusicTrack_key_idx" ON "MiMusicTrack"("key");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_tokenHash_idx" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "DraftStore_generationRunId_key" ON "DraftStore"("generationRunId");

-- CreateIndex
CREATE INDEX "DraftStore_expiresAt_idx" ON "DraftStore"("expiresAt");

-- CreateIndex
CREATE INDEX "DraftStore_status_idx" ON "DraftStore"("status");

-- CreateIndex
CREATE INDEX "DraftStore_createdAt_idx" ON "DraftStore"("createdAt");

-- CreateIndex
CREATE INDEX "DraftStore_updatedAt_idx" ON "DraftStore"("updatedAt");

-- CreateIndex
CREATE INDEX "DraftStore_committedStoreId_idx" ON "DraftStore"("committedStoreId");

-- CreateIndex
CREATE INDEX "DraftStore_committedUserId_idx" ON "DraftStore"("committedUserId");

-- CreateIndex
CREATE INDEX "DraftStore_ownerUserId_idx" ON "DraftStore"("ownerUserId");

-- CreateIndex
CREATE INDEX "DraftStore_guestSessionId_idx" ON "DraftStore"("guestSessionId");

-- CreateIndex
CREATE INDEX "WorkflowRun_workflowKey_idx" ON "WorkflowRun"("workflowKey");

-- CreateIndex
CREATE INDEX "WorkflowRun_draftStoreId_idx" ON "WorkflowRun"("draftStoreId");

-- CreateIndex
CREATE INDEX "WorkflowRun_startedAt_idx" ON "WorkflowRun"("startedAt");

-- CreateIndex
CREATE INDEX "WorkflowRun_status_idx" ON "WorkflowRun"("status");

-- CreateIndex
CREATE INDEX "WorkflowIncident_workflowKey_idx" ON "WorkflowIncident"("workflowKey");

-- CreateIndex
CREATE INDEX "WorkflowIncident_draftStoreId_idx" ON "WorkflowIncident"("draftStoreId");

-- CreateIndex
CREATE INDEX "WorkflowIncident_runId_idx" ON "WorkflowIncident"("runId");

-- CreateIndex
CREATE INDEX "WorkflowIncident_createdAt_idx" ON "WorkflowIncident"("createdAt");

-- CreateIndex
CREATE INDEX "WorkflowReport_workflowKey_idx" ON "WorkflowReport"("workflowKey");

-- CreateIndex
CREATE INDEX "WorkflowReport_periodStart_periodEnd_idx" ON "WorkflowReport"("periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SeedCatalog_verticalSlug_idx" ON "SeedCatalog"("verticalSlug");

-- CreateIndex
CREATE INDEX "SeedCatalog_updatedAt_idx" ON "SeedCatalog"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SeedCatalog_verticalSlug_subIntent_key" ON "SeedCatalog"("verticalSlug", "subIntent");

-- CreateIndex
CREATE INDEX "ContentIngestSample_createdAt_idx" ON "ContentIngestSample"("createdAt");

-- CreateIndex
CREATE INDEX "ContentIngestSample_sourceType_idx" ON "ContentIngestSample"("sourceType");

-- CreateIndex
CREATE INDEX "ContentIngestSample_goal_idx" ON "ContentIngestSample"("goal");

-- CreateIndex
CREATE INDEX "ContentIngestSample_draftId_idx" ON "ContentIngestSample"("draftId");

-- CreateIndex
CREATE UNIQUE INDEX "SmartObject_publicCode_key" ON "SmartObject"("publicCode");

-- CreateIndex
CREATE INDEX "SmartObject_storeId_idx" ON "SmartObject"("storeId");

-- CreateIndex
CREATE INDEX "SmartObject_publicCode_idx" ON "SmartObject"("publicCode");

-- CreateIndex
CREATE INDEX "SmartObject_status_idx" ON "SmartObject"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DynamicQr_code_key" ON "DynamicQr"("code");

-- CreateIndex
CREATE INDEX "DynamicQr_storeId_idx" ON "DynamicQr"("storeId");

-- CreateIndex
CREATE INDEX "DynamicQr_code_idx" ON "DynamicQr"("code");

-- CreateIndex
CREATE INDEX "DynamicQr_isActive_idx" ON "DynamicQr"("isActive");

-- CreateIndex
CREATE INDEX "ScanEvent_dynamicQrId_idx" ON "ScanEvent"("dynamicQrId");

-- CreateIndex
CREATE INDEX "ScanEvent_storeId_idx" ON "ScanEvent"("storeId");

-- CreateIndex
CREATE INDEX "ScanEvent_scannedAt_idx" ON "ScanEvent"("scannedAt");

-- CreateIndex
CREATE INDEX "SeedAsset_provider_idx" ON "SeedAsset"("provider");

-- CreateIndex
CREATE INDEX "SeedAsset_vertical_idx" ON "SeedAsset"("vertical");

-- CreateIndex
CREATE INDEX "SeedAsset_categoryKey_idx" ON "SeedAsset"("categoryKey");

-- CreateIndex
CREATE INDEX "SeedAsset_status_idx" ON "SeedAsset"("status");

-- CreateIndex
CREATE INDEX "SeedAsset_ingestionJobId_idx" ON "SeedAsset"("ingestionJobId");

-- CreateIndex
CREATE UNIQUE INDEX "SeedAsset_provider_providerAssetId_key" ON "SeedAsset"("provider", "providerAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "SeedAsset_sha256_key" ON "SeedAsset"("sha256");

-- CreateIndex
CREATE INDEX "SeedAssetFile_seedAssetId_idx" ON "SeedAssetFile"("seedAssetId");

-- CreateIndex
CREATE INDEX "SeedAssetFile_role_idx" ON "SeedAssetFile"("role");

-- CreateIndex
CREATE INDEX "SeedIngestionJob_provider_idx" ON "SeedIngestionJob"("provider");

-- CreateIndex
CREATE INDEX "SeedIngestionJob_status_idx" ON "SeedIngestionJob"("status");

-- CreateIndex
CREATE INDEX "SeedIngestionJob_startedAt_idx" ON "SeedIngestionJob"("startedAt");

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorePromo" ADD CONSTRAINT "StorePromo_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Demand" ADD CONSTRAINT "Demand_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyStepTemplate" ADD CONSTRAINT "JourneyStepTemplate_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "JourneyTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyInstance" ADD CONSTRAINT "JourneyInstance_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "JourneyTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyStep" ADD CONSTRAINT "JourneyStep_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "JourneyInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyStep" ADD CONSTRAINT "JourneyStep_stepTemplateId_fkey" FOREIGN KEY ("stepTemplateId") REFERENCES "JourneyStepTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerTask" ADD CONSTRAINT "PlannerTask_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "JourneyInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Screen" ADD CONSTRAINT "Screen_assignedPlaylistId_fkey" FOREIGN KEY ("assignedPlaylistId") REFERENCES "Playlist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistItem" ADD CONSTRAINT "PlaylistItem_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistItem" ADD CONSTRAINT "PlaylistItem_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistItem" ADD CONSTRAINT "PlaylistItem_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "SignageAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PairingSession" ADD CONSTRAINT "PairingSession_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "Screen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PairCode" ADD CONSTRAINT "PairCode_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "Screen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Content" ADD CONSTRAINT "Content_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyStamp" ADD CONSTRAINT "LoyaltyStamp_programId_fkey" FOREIGN KEY ("programId") REFERENCES "LoyaltyProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_promoId_fkey" FOREIGN KEY ("promoId") REFERENCES "PromoRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistSchedule" ADD CONSTRAINT "PlaylistSchedule_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceCapability" ADD CONSTRAINT "DeviceCapability_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceStateSnapshot" ADD CONSTRAINT "DeviceStateSnapshot_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevicePlaylistBinding" ADD CONSTRAINT "DevicePlaylistBinding_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceCommand" ADD CONSTRAINT "DeviceCommand_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceLog" ADD CONSTRAINT "DeviceLog_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceAlert" ADD CONSTRAINT "DeviceAlert_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AgentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AgentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteractionFeedback" ADD CONSTRAINT "InteractionFeedback_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationThread" ADD CONSTRAINT "ConversationThread_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadParticipant" ADD CONSTRAINT "ThreadParticipant_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ConversationThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThreadParticipant" ADD CONSTRAINT "ChatThreadParticipant_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "OrchestratorTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreetingCard" ADD CONSTRAINT "GreetingCard_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftStore" ADD CONSTRAINT "DraftStore_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_draftStoreId_fkey" FOREIGN KEY ("draftStoreId") REFERENCES "DraftStore"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowIncident" ADD CONSTRAINT "WorkflowIncident_draftStoreId_fkey" FOREIGN KEY ("draftStoreId") REFERENCES "DraftStore"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowIncident" ADD CONSTRAINT "WorkflowIncident_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanEvent" ADD CONSTRAINT "ScanEvent_dynamicQrId_fkey" FOREIGN KEY ("dynamicQrId") REFERENCES "DynamicQr"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedAsset" ADD CONSTRAINT "SeedAsset_ingestionJobId_fkey" FOREIGN KEY ("ingestionJobId") REFERENCES "SeedIngestionJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedAssetFile" ADD CONSTRAINT "SeedAssetFile_seedAssetId_fkey" FOREIGN KEY ("seedAssetId") REFERENCES "SeedAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

