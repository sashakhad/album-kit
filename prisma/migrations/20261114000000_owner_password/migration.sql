CREATE TABLE "OwnerPassword" (
    "id" TEXT NOT NULL DEFAULT 'owner',
    "password" TEXT NOT NULL,
    "envAtChange" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnerPassword_pkey" PRIMARY KEY ("id")
);
