-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "SaleUnit" AS ENUM ('KG', 'GRAM', 'PIECE', 'PACK');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PREPARING', 'SHIPPED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('ZARINPAL', 'CASH_ON_DELIVERY');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'FIXED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" VARCHAR(16) NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "twoFactorSecretEnc" TEXT,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "descriptionFa" TEXT,
    "descriptionEn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "descriptionFa" TEXT NOT NULL,
    "descriptionEn" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "priceToman" INTEGER NOT NULL,
    "unit" "SaleUnit" NOT NULL,
    "priceBasisQuantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "minOrderQuantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "orderStepQuantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "stockQuantity" DECIMAL(12,3),
    "dailyCapacity" DECIMAL(12,3),
    "preparationMinutes" INTEGER NOT NULL,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductMedia" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "MediaType" NOT NULL,
    "cloudinaryId" TEXT NOT NULL,
    "secureUrl" TEXT NOT NULL,
    "altFa" TEXT NOT NULL,
    "altEn" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "durationSeconds" DECIMAL(8,3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryZone" (
    "id" TEXT NOT NULL,
    "cityFa" TEXT NOT NULL,
    "cityEn" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "feeToman" INTEGER NOT NULL,
    "deliveryMinutes" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "DiscountType" NOT NULL,
    "value" INTEGER NOT NULL,
    "minSubtotalToman" INTEGER NOT NULL DEFAULT 0,
    "maxDiscountToman" INTEGER,
    "usageLimit" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DiscountCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "trackingCode" VARCHAR(32) NOT NULL,
    "idempotencyKey" VARCHAR(64) NOT NULL,
    "userId" TEXT,
    "customerName" TEXT NOT NULL,
    "mobile" VARCHAR(16) NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "deliveryNotes" TEXT,
    "deliveryZoneId" TEXT NOT NULL,
    "deliveryZoneNameSnapshot" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "subtotalToman" INTEGER NOT NULL,
    "discountToman" INTEGER NOT NULL DEFAULT 0,
    "deliveryFeeToman" INTEGER NOT NULL,
    "totalToman" INTEGER NOT NULL,
    "discountCodeId" TEXT,
    "discountCodeSnapshot" TEXT,
    "longestPreparationMinutes" INTEGER NOT NULL,
    "zoneDeliveryMinutes" INTEGER NOT NULL,
    "estimatedDeliveryAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "productNameFa" TEXT NOT NULL,
    "productNameEn" TEXT NOT NULL,
    "unit" "SaleUnit" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "priceBasisQuantity" DECIMAL(12,3) NOT NULL,
    "unitPriceToman" INTEGER NOT NULL,
    "lineTotalToman" INTEGER NOT NULL,
    "preparationMinutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusHistory" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "authority" TEXT,
    "referenceId" TEXT,
    "amountToman" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_mobile_key" ON "User"("mobile");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE INDEX "Product_active_categoryId_idx" ON "Product"("active", "categoryId");

-- CreateIndex
CREATE INDEX "Product_featured_active_idx" ON "Product"("featured", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ProductMedia_cloudinaryId_key" ON "ProductMedia"("cloudinaryId");

-- CreateIndex
CREATE INDEX "ProductMedia_productId_sortOrder_idx" ON "ProductMedia"("productId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryZone_cityFa_nameFa_key" ON "DeliveryZone"("cityFa", "nameFa");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountCode_code_key" ON "DiscountCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Order_trackingCode_key" ON "Order"("trackingCode");

-- CreateIndex
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_mobile_createdAt_idx" ON "Order"("mobile", "createdAt");

-- CreateIndex
CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_orderId_createdAt_idx" ON "OrderStatusHistory"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_authority_key" ON "PaymentAttempt"("authority");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_referenceId_key" ON "PaymentAttempt"("referenceId");

-- CreateIndex
CREATE INDEX "PaymentAttempt_orderId_createdAt_idx" ON "PaymentAttempt"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMedia" ADD CONSTRAINT "ProductMedia_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryZoneId_fkey" FOREIGN KEY ("deliveryZoneId") REFERENCES "DeliveryZone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_discountCodeId_fkey" FOREIGN KEY ("discountCodeId") REFERENCES "DiscountCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Application invariants also enforced for direct database writes.
ALTER TABLE "Product" ADD CONSTRAINT "Product_valid_price_quantity" CHECK (
  "priceToman" >= 0 AND "priceBasisQuantity" > 0 AND "minOrderQuantity" > 0 AND "orderStepQuantity" > 0
  AND "preparationMinutes" >= 0 AND ("stockQuantity" IS NULL OR "stockQuantity" >= 0)
  AND ("dailyCapacity" IS NULL OR "dailyCapacity" >= 0)
);
ALTER TABLE "Product" ADD CONSTRAINT "Product_discrete_units" CHECK (
  "unit" NOT IN ('PIECE', 'PACK') OR (
    "priceBasisQuantity" = trunc("priceBasisQuantity") AND "minOrderQuantity" = trunc("minOrderQuantity")
    AND "orderStepQuantity" = trunc("orderStepQuantity")
    AND ("stockQuantity" IS NULL OR "stockQuantity" = trunc("stockQuantity"))
    AND ("dailyCapacity" IS NULL OR "dailyCapacity" = trunc("dailyCapacity"))
  )
);
ALTER TABLE "ProductMedia" ADD CONSTRAINT "ProductMedia_valid_size" CHECK (
  "width" > 0 AND "height" > 0 AND "bytes" > 0
  AND ("type" <> 'VIDEO' OR ("bytes" <= 20000000 AND "durationSeconds" IS NOT NULL AND "durationSeconds" > 0))
);
ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_nonnegative" CHECK ("feeToman" >= 0 AND "deliveryMinutes" >= 0);
ALTER TABLE "DiscountCode" ADD CONSTRAINT "DiscountCode_valid_value" CHECK (
  "value" > 0 AND ("type" <> 'PERCENT' OR "value" <= 100)
  AND "minSubtotalToman" >= 0 AND "usedCount" >= 0
  AND ("usageLimit" IS NULL OR "usageLimit" > 0)
  AND ("maxDiscountToman" IS NULL OR "maxDiscountToman" > 0)
  AND ("expiresAt" IS NULL OR "startsAt" IS NULL OR "expiresAt" > "startsAt")
);
ALTER TABLE "Order" ADD CONSTRAINT "Order_valid_totals" CHECK (
  "subtotalToman" >= 0 AND "discountToman" >= 0 AND "discountToman" <= "subtotalToman"
  AND "deliveryFeeToman" >= 0 AND "totalToman" = "subtotalToman" - "discountToman" + "deliveryFeeToman"
  AND "longestPreparationMinutes" >= 0 AND "zoneDeliveryMinutes" >= 0
);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_valid_quantities" CHECK (
  "quantity" > 0 AND "priceBasisQuantity" > 0 AND "unitPriceToman" >= 0
  AND "lineTotalToman" >= 0 AND "preparationMinutes" >= 0
  AND ("unit" NOT IN ('PIECE', 'PACK') OR ("quantity" = trunc("quantity") AND "priceBasisQuantity" = trunc("priceBasisQuantity")))
);
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_valid_amount" CHECK ("amountToman" >= 0);
ALTER TABLE "RateLimitBucket" ADD CONSTRAINT "RateLimitBucket_valid_count" CHECK ("count" >= 0);
