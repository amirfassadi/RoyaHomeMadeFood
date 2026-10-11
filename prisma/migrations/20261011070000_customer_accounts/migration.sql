ALTER TABLE "User" ADD COLUMN "mobileVerifiedAt" TIMESTAMPTZ(3), ADD COLUMN "marketingSms" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "CustomerLoginChallenge" (
 "id" UUID PRIMARY KEY, "mobile" VARCHAR(16) NOT NULL, "name" VARCHAR(100) NOT NULL,
 "verifier" VARCHAR(64) NOT NULL, "marketingSms" BOOLEAN NOT NULL DEFAULT false,
 "ready" BOOLEAN NOT NULL DEFAULT false, "attempts" INTEGER NOT NULL DEFAULT 0,
 "expiresAt" TIMESTAMPTZ(3) NOT NULL, "consumedAt" TIMESTAMPTZ(3), "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "challenge_attempts" CHECK ("attempts" BETWEEN 0 AND 5)
);
CREATE INDEX "CustomerLoginChallenge_mobile_createdAt_idx" ON "CustomerLoginChallenge"("mobile","createdAt");
CREATE INDEX "CustomerLoginChallenge_expiresAt_idx" ON "CustomerLoginChallenge"("expiresAt");
CREATE TABLE "MarketingConsentEvent" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "allowed" BOOLEAN NOT NULL, "policyVersion" VARCHAR(32) NOT NULL, "source" VARCHAR(32) NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "MarketingConsentEvent_userId_createdAt_idx" ON "MarketingConsentEvent"("userId","createdAt");

ALTER TABLE "DiscountCode" ADD COLUMN "showInCustomerClub" BOOLEAN NOT NULL DEFAULT false;
