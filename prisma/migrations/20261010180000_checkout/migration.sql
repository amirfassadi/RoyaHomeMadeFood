BEGIN;
-- Phase 2 had no order-writing endpoints. Fail closed if externally created payments
-- exist: they must be reconciled before introducing the single-attempt contract.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM "PaymentAttempt") THEN
  RAISE EXCEPTION 'Reconcile legacy payment attempts before applying checkout migration';
 END IF;
END $$;
ALTER TABLE "Order" ADD COLUMN "capacityDay" VARCHAR(10),
 ADD COLUMN "inventoryReserved" BOOLEAN NOT NULL DEFAULT true,
 ADD COLUMN "locale" VARCHAR(2) NOT NULL DEFAULT 'fa',
 ADD COLUMN "requestFingerprint" VARCHAR(64);
UPDATE "Order" SET "capacityDay"=to_char("createdAt" AT TIME ZONE 'Asia/Tehran','YYYY-MM-DD'),
 "requestFingerprint"=md5('legacy:' || "id") || md5('legacy2:' || "id"), "inventoryReserved"=false;
ALTER TABLE "Order" ALTER COLUMN "capacityDay" SET NOT NULL,
 ALTER COLUMN "locale" DROP DEFAULT,
 ALTER COLUMN "requestFingerprint" SET NOT NULL,
 ADD CONSTRAINT "Order_locale_check" CHECK ("locale" IN ('fa','en'));
ALTER TABLE "OrderItem" ADD COLUMN "stockReserved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PaymentAttempt" ADD COLUMN "callbackNonce" TEXT NOT NULL,
 ADD COLUMN "merchantId" TEXT NOT NULL,
 ADD COLUMN "requestState" TEXT NOT NULL DEFAULT 'NEW',
 ADD COLUMN "sandbox" BOOLEAN NOT NULL,
 ADD CONSTRAINT "PaymentAttempt_requestState_check" CHECK ("requestState" IN ('NEW','REQUESTING','READY','UNKNOWN','REJECTED'));
CREATE UNIQUE INDEX "PaymentAttempt_orderId_key" ON "PaymentAttempt"("orderId");
CREATE TABLE "ProductDailyUsage" (
 "productId" TEXT NOT NULL,
 "day" VARCHAR(10) NOT NULL,
 "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
 CONSTRAINT "ProductDailyUsage_pkey" PRIMARY KEY ("productId","day"),
 CONSTRAINT "ProductDailyUsage_quantity_check" CHECK ("quantity" >= 0),
 CONSTRAINT "ProductDailyUsage_day_check" CHECK ("day" ~ '^\d{4}-\d{2}-\d{2}$')
);
ALTER TABLE "ProductDailyUsage" ADD CONSTRAINT "ProductDailyUsage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
