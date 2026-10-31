ALTER TABLE "ContactMessage" ADD COLUMN "email" VARCHAR(254);
CREATE TABLE "ContactReply" (
 "id" TEXT NOT NULL,
 "contactMessageId" TEXT NOT NULL,
 "requestKey" UUID NOT NULL,
 "adminId" TEXT NOT NULL,
 "userId" TEXT,
 "channel" VARCHAR(10) NOT NULL,
 "body" TEXT NOT NULL,
 "status" VARCHAR(16) NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "ContactReply_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ContactReply_contactMessageId_fkey" FOREIGN KEY ("contactMessageId") REFERENCES "ContactMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ContactReply_requestKey_key" ON "ContactReply"("requestKey");
CREATE INDEX "ContactReply_contactMessageId_createdAt_idx" ON "ContactReply"("contactMessageId","createdAt");
