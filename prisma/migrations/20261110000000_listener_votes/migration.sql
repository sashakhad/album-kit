CREATE TABLE "VoteAttempt" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoteAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VoteAttempt_bucket_createdAt_idx" ON "VoteAttempt"("bucket", "createdAt");
