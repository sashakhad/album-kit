CREATE TABLE "OwnerSignInLink" (
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnerSignInLink_pkey" PRIMARY KEY ("tokenHash")
);
