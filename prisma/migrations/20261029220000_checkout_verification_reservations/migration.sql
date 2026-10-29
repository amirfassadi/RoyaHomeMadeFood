ALTER TABLE "Order" ADD COLUMN "reservationExpiresAt" TIMESTAMPTZ(3), ADD COLUMN "reservationExpiredAt" TIMESTAMPTZ(3);
-- Give legacy unpaid reservations a full grace period after rollout.
UPDATE "Order" SET "reservationExpiresAt"=NOW()+INTERVAL '1 hour' WHERE "status"='PENDING' AND "paymentStatus" IN ('UNPAID','PENDING','FAILED') AND "inventoryReserved"=true;
CREATE INDEX "Order_status_reservationExpiresAt_idx" ON "Order"("status","reservationExpiresAt");
CREATE TABLE "CheckoutMobileChallenge" (
 "id" UUID PRIMARY KEY, "mobile" VARCHAR(16) NOT NULL, "verifier" VARCHAR(64) NOT NULL,
 "ready" BOOLEAN NOT NULL DEFAULT false, "attempts" INTEGER NOT NULL DEFAULT 0,
 "expiresAt" TIMESTAMPTZ(3) NOT NULL, "verifiedAt" TIMESTAMPTZ(3), "proofHash" VARCHAR(64),
 "proofExpiresAt" TIMESTAMPTZ(3), "consumedAt" TIMESTAMPTZ(3), "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "CheckoutMobileChallenge_mobile_createdAt_idx" ON "CheckoutMobileChallenge"("mobile","createdAt");
CREATE INDEX "CheckoutMobileChallenge_expiresAt_idx" ON "CheckoutMobileChallenge"("expiresAt");
CREATE TABLE "SmsTestBudget" ("id" TEXT PRIMARY KEY,"used" INTEGER NOT NULL DEFAULT 0 CHECK ("used">=0 AND "used"<=5));
