CREATE TABLE "CourierDispatch" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "orderId" TEXT NOT NULL UNIQUE REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "requestState" TEXT NOT NULL DEFAULT 'REQUESTING' CHECK ("requestState" IN ('REQUESTING','UNKNOWN','ACTIVE','COMPLETED','CANCELLED')),
 "environment" TEXT NOT NULL CHECK ("environment" IN ('sandbox','production')),
 "externalId" TEXT UNIQUE,
 "externalStatus" TEXT,
 "requestSnapshot" JSONB NOT NULL,
 "quotedFeeToman" INTEGER NOT NULL CHECK ("quotedFeeToman" >= 0),
 "actualFeeToman" INTEGER CHECK ("actualFeeToman" >= 0),
 "readyAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "requestedBy" TEXT NOT NULL,
 "lastSyncedAt" TIMESTAMPTZ(3),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL
);
