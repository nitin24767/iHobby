CREATE TABLE "ApplicationSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationSetting_pkey" PRIMARY KEY ("key")
);

INSERT INTO "ApplicationSetting" ("key", "value", "updatedAt")
VALUES ('application.currency', 'USD', CURRENT_TIMESTAMP);
