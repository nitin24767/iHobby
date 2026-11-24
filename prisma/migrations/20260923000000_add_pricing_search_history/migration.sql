CREATE TABLE "PricingSearch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vehicleFamily" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "itemModel" TEXT NOT NULL,
    "scale" TEXT,
    "versionModelYear" TEXT,
    "cellCount" INTEGER,
    "condition" TEXT NOT NULL,
    "targetPriceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "providerModel" TEXT,
    "summary" TEXT,
    "conservativeCents" INTEGER,
    "recommendedCents" INTEGER,
    "buyNowCents" INTEGER,
    "confidence" TEXT,
    "evidenceCount" INTEGER,
    "webComparables" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PricingSearch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PricingSearch_userId_createdAt_idx" ON "PricingSearch"("userId", "createdAt");
CREATE INDEX "PricingSearch_createdAt_idx" ON "PricingSearch"("createdAt");

ALTER TABLE "PricingSearch"
ADD CONSTRAINT "PricingSearch_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
