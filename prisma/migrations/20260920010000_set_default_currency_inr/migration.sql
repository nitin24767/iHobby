INSERT INTO "ApplicationSetting" ("key", "value", "updatedAt")
VALUES ('application.currency', 'INR', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE
SET "value" = 'INR', "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "Listing"
SET "currency" = 'INR'
WHERE "currency" <> 'INR';

ALTER TABLE "Listing"
ALTER COLUMN "currency" SET DEFAULT 'INR';
