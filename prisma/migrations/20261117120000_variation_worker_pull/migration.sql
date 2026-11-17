ALTER TABLE "VariationRequest"
ADD COLUMN "workerPayload" JSONB,
ADD COLUMN "claimToken" TEXT,
ADD COLUMN "claimExpiresAt" TIMESTAMP(3);
