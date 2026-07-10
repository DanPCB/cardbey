-- Universal Artifact Factory canonical tables (SQLite)
CREATE TABLE IF NOT EXISTS "Artifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "storeId" TEXT,
    "missionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "contextJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS "Artifact_ownerUserId_createdAt_idx" ON "Artifact"("ownerUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "Artifact_missionId_idx" ON "Artifact"("missionId");
CREATE INDEX IF NOT EXISTS "Artifact_storeId_type_idx" ON "Artifact"("storeId", "type");

CREATE TABLE IF NOT EXISTS "ArtifactVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "artifactId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "payloadJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArtifactVersion_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ArtifactVersion_artifactId_version_key" ON "ArtifactVersion"("artifactId", "version");
CREATE INDEX IF NOT EXISTS "ArtifactVersion_artifactId_idx" ON "ArtifactVersion"("artifactId");

CREATE TABLE IF NOT EXISTS "ArtifactBlueprint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "artifactId" TEXT NOT NULL,
    "blueprintId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "payloadJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ArtifactBlueprint_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ArtifactBlueprint_artifactId_idx" ON "ArtifactBlueprint"("artifactId");

CREATE TABLE IF NOT EXISTS "ArtifactValidation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "artifactId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "findingsJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArtifactValidation_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ArtifactValidation_artifactId_createdAt_idx" ON "ArtifactValidation"("artifactId", "createdAt");

CREATE TABLE IF NOT EXISTS "ArtifactPublication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "artifactId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payloadJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArtifactPublication_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ArtifactPublication_artifactId_target_idx" ON "ArtifactPublication"("artifactId", "target");

CREATE TABLE IF NOT EXISTS "ArtifactLearning" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "artifactId" TEXT NOT NULL,
    "missionId" TEXT,
    "storeId" TEXT,
    "payloadJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArtifactLearning_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ArtifactLearning_artifactId_createdAt_idx" ON "ArtifactLearning"("artifactId", "createdAt");
CREATE INDEX IF NOT EXISTS "ArtifactLearning_missionId_idx" ON "ArtifactLearning"("missionId");
