-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerifiedAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "CustomerRegistration" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "mobile" VARCHAR(16) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "marketingSms" BOOLEAN NOT NULL DEFAULT false,
    "mobileVerifier" VARCHAR(64) NOT NULL,
    "mobileReady" BOOLEAN NOT NULL DEFAULT false,
    "mobileAttempts" INTEGER NOT NULL DEFAULT 0,
    "mobileVerifiedAt" TIMESTAMPTZ(3),
    "emailVerifier" VARCHAR(64),
    "emailReady" BOOLEAN NOT NULL DEFAULT false,
    "emailAttempts" INTEGER NOT NULL DEFAULT 0,
    "emailExpiresAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAddress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" VARCHAR(50) NOT NULL,
    "recipientName" VARCHAR(100) NOT NULL,
    "mobile" VARCHAR(16) NOT NULL,
    "zoneId" VARCHAR(100) NOT NULL,
    "address" VARCHAR(1000) NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerRegistration_mobile_createdAt_idx" ON "CustomerRegistration"("mobile", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerRegistration_expiresAt_idx" ON "CustomerRegistration"("expiresAt");

-- CreateIndex
CREATE INDEX "CustomerAddress_userId_createdAt_idx" ON "CustomerAddress"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
