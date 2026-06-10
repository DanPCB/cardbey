-- Fleet-wide intelligence foundation kill switch (singleton)

CREATE TABLE IF NOT EXISTS "intelligence_override" (
    "id" TEXT NOT NULL,
    "overridesJson" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "intelligence_override_pkey" PRIMARY KEY ("id")
);
