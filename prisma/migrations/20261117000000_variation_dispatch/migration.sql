ALTER TABLE "VariationRequest"
ADD COLUMN "creditsReserved" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "dispatchError" TEXT,
ADD COLUMN "quotedModel" TEXT,
ADD COLUMN "quotedExpectedOutputs" INTEGER,
ADD COLUMN "quotedDownloadCredits" INTEGER,
ADD COLUMN "quotedExternalSpendUsd" DOUBLE PRECISION,
ADD COLUMN "quotedHostingChargeUsd" DOUBLE PRECISION;
