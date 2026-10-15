ALTER TYPE "PaymentMethod" ADD VALUE 'BTCPAY';
ALTER TABLE "Order" ADD COLUMN "buyerEmail" VARCHAR(254);
CREATE TABLE "CryptoPayment" (
 "id" TEXT PRIMARY KEY, "orderId" TEXT NOT NULL UNIQUE REFERENCES "Order"("id") ON DELETE RESTRICT,
 "invoiceId" TEXT UNIQUE, "amountUsdCents" INTEGER NOT NULL CHECK ("amountUsdCents">0),
 "tomanPerUsd" INTEGER NOT NULL CHECK ("tomanPerUsd">0), "rateExpiresAt" TIMESTAMPTZ(3) NOT NULL,
 "storeId" TEXT NOT NULL, "gatewayOrigin" TEXT NOT NULL, "requestState" TEXT NOT NULL DEFAULT 'NEW',
 "invoiceStatus" TEXT, "additionalStatus" TEXT, "checkoutUrl" TEXT, "verifiedAt" TIMESTAMPTZ(3),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
