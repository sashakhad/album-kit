CREATE TABLE "ListenSelection" (
    "trackNumber" INTEGER NOT NULL,
    "slot" TEXT NOT NULL,
    "setId" TEXT,
    "takeLabel" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListenSelection_pkey" PRIMARY KEY ("trackNumber","slot")
);
