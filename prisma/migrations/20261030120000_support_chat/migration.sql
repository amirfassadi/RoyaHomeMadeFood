CREATE TABLE "SupportThread" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "userId" TEXT NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "lastSequence" INTEGER NOT NULL DEFAULT 0,
 "lastCustomerSequence" INTEGER NOT NULL DEFAULT 0,
 "lastAdminSequence" INTEGER NOT NULL DEFAULT 0,
 "customerReadSequence" INTEGER NOT NULL DEFAULT 0,
 "adminReadSequence" INTEGER NOT NULL DEFAULT 0,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "SupportThread_updatedAt_id_idx" ON "SupportThread"("updatedAt", "id");
CREATE TABLE "SupportMessage" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "threadId" TEXT NOT NULL REFERENCES "SupportThread"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "sequence" INTEGER NOT NULL,
 "senderId" TEXT NOT NULL,
 "fromAdmin" BOOLEAN NOT NULL,
 "clientId" UUID NOT NULL,
 "body" VARCHAR(2000) NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SupportMessage_threadId_sequence_key" ON "SupportMessage"("threadId", "sequence");
CREATE UNIQUE INDEX "SupportMessage_threadId_senderId_clientId_key" ON "SupportMessage"("threadId", "senderId", "clientId");
