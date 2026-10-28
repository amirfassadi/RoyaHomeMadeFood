ALTER TYPE "PaymentMethod" ADD VALUE 'BANK_TRANSFER';
ALTER TABLE "Order" ADD COLUMN "invoiceNumber" TEXT, ADD COLUMN "paymentReference" TEXT, ADD COLUMN "paymentConfirmedAt" TIMESTAMPTZ(3), ADD COLUMN "transferReference" TEXT;
CREATE UNIQUE INDEX "Order_invoiceNumber_key" ON "Order"("invoiceNumber");
CREATE UNIQUE INDEX "Order_paymentReference_key" ON "Order"("paymentReference");
CREATE UNIQUE INDEX "Order_transferReference_key" ON "Order"("transferReference");
ALTER TABLE "Order" DROP CONSTRAINT "Order_refundRequired_check";
ALTER TABLE "Order" ADD CONSTRAINT "Order_refundRequired_check" CHECK (NOT "refundRequired" OR ("status"='CANCELLED' AND "paymentStatus"='PAID'));
