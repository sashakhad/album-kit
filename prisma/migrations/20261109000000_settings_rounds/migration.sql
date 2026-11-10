CREATE TABLE "AlbumSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "version" INTEGER NOT NULL DEFAULT 1,
    "defaults" JSONB NOT NULL,
    "overrides" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AlbumSettings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Vote" ADD COLUMN "detailsExposed" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "GenerationRound" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'preparing',
    "snapshot" JSONB NOT NULL,
    "estimate" JSONB NOT NULL,
    "authorization" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GenerationRound_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProviderJob" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "providerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "output" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProviderJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderJob_operationId_key" ON "ProviderJob"("operationId");
CREATE INDEX "ProviderJob_roundId_idx" ON "ProviderJob"("roundId");
ALTER TABLE "ProviderJob" ADD CONSTRAINT "ProviderJob_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "GenerationRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "BlindOrder" (
    "round" INTEGER NOT NULL,
    "trackNumber" INTEGER NOT NULL,
    "filenames" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BlindOrder_pkey" PRIMARY KEY ("round","trackNumber")
);

CREATE TABLE "ListeningExposure" (
    "visitorId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "exposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ListeningExposure_pkey" PRIMARY KEY ("visitorId","round")
);

CREATE TABLE "TakeProvenance" (
    "filename" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "style" TEXT NOT NULL,
    "writerHost" TEXT NOT NULL,
    "writerProvider" TEXT,
    "requestedModel" TEXT,
    "observedModel" TEXT,
    "attribution" TEXT NOT NULL,
    "promptRevision" INTEGER NOT NULL,
    "executionId" TEXT,
    "sunoModel" TEXT,
    "generationId" TEXT,
    "generationSettings" JSONB NOT NULL,
    "outputId" TEXT,
    "roundId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TakeProvenance_pkey" PRIMARY KEY ("filename")
);

CREATE TABLE "AccessInvite" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redeemedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccessInvite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccessInvite_tokenHash_key" ON "AccessInvite"("tokenHash");
