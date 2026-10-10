BEGIN;
ALTER TABLE "Order" ADD COLUMN "refundRequired" BOOLEAN NOT NULL DEFAULT false,
 ADD CONSTRAINT "Order_refundRequired_check" CHECK (NOT "refundRequired" OR ("status"='CANCELLED' AND "paymentMethod"='ZARINPAL' AND "paymentStatus"='PAID'));
CREATE TABLE "MediaUpload" (
 "id" TEXT NOT NULL, "publicId" TEXT NOT NULL, "type" "MediaType" NOT NULL,
 "adminId" TEXT NOT NULL, "consumed" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "MediaUpload_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MediaUpload_publicId_key" ON "MediaUpload"("publicId");
CREATE TABLE "AdminAudit" (
 "id" TEXT NOT NULL, "adminId" TEXT NOT NULL, "action" TEXT NOT NULL, "targetId" TEXT NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "AdminAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AdminAudit_createdAt_idx" ON "AdminAudit"("createdAt");
COMMIT;
