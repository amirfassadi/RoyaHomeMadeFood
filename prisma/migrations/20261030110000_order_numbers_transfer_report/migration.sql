ALTER TABLE "Order" ADD COLUMN "transferReport" JSONB;
CREATE TABLE "OrderDailySequence" ("day" VARCHAR(10) NOT NULL, "last" INTEGER NOT NULL, CONSTRAINT "OrderDailySequence_pkey" PRIMARY KEY ("day"));
