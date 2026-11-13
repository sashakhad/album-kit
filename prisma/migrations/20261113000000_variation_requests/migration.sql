ALTER TABLE "TakeProvenance"
  ADD COLUMN "parentTakeFilename" TEXT,
  ADD COLUMN "variationRequestId" TEXT,
  ADD COLUMN "promptInstructions" TEXT;

CREATE TABLE "VariationRequest" (
  "id" TEXT NOT NULL,
  "trackNumber" INTEGER NOT NULL,
  "parentTakeFilename" TEXT NOT NULL,
  "requestedTakes" INTEGER NOT NULL,
  "instructions" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'requested',
  "roundId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VariationRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VariationRequest_roundId_key" ON "VariationRequest"("roundId");
CREATE INDEX "VariationRequest_trackNumber_createdAt_idx" ON "VariationRequest"("trackNumber", "createdAt");
