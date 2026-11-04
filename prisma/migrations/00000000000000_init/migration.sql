-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "trackNumber" INTEGER NOT NULL,
    "versionSlug" TEXT NOT NULL,
    "takeLabel" TEXT NOT NULL DEFAULT 'A',
    "value" INTEGER NOT NULL DEFAULT 1,
    "round" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Download" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "trackNumber" INTEGER NOT NULL,
    "versionSlug" TEXT NOT NULL,
    "takeLabel" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Download_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitorRound" (
    "visitorId" TEXT NOT NULL,
    "currentRound" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitorRound_pkey" PRIMARY KEY ("visitorId")
);

-- CreateTable
CREATE TABLE "JudgingState" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "latestRound" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "JudgingState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TakeSighting" (
    "id" TEXT NOT NULL,
    "versionSlug" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "addedInRound" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TakeSighting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParkedTake" (
    "id" TEXT NOT NULL,
    "versionSlug" TEXT NOT NULL,
    "trackNumber" INTEGER NOT NULL,
    "takeLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParkedTake_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vote_trackNumber_versionSlug_takeLabel_idx" ON "Vote"("trackNumber", "versionSlug", "takeLabel");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_visitorId_trackNumber_versionSlug_takeLabel_round_key" ON "Vote"("visitorId", "trackNumber", "versionSlug", "takeLabel", "round");

-- CreateIndex
CREATE INDEX "Download_visitorId_idx" ON "Download"("visitorId");

-- CreateIndex
CREATE UNIQUE INDEX "Download_visitorId_trackNumber_versionSlug_takeLabel_key" ON "Download"("visitorId", "trackNumber", "versionSlug", "takeLabel");

-- CreateIndex
CREATE UNIQUE INDEX "TakeSighting_versionSlug_filename_key" ON "TakeSighting"("versionSlug", "filename");

-- CreateIndex
CREATE INDEX "ParkedTake_trackNumber_idx" ON "ParkedTake"("trackNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ParkedTake_versionSlug_trackNumber_takeLabel_key" ON "ParkedTake"("versionSlug", "trackNumber", "takeLabel");

