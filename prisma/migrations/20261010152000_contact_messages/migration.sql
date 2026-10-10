CREATE TABLE "ContactMessage" (
  "id" TEXT NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "mobile" VARCHAR(16) NOT NULL,
  "message" TEXT NOT NULL,
  "locale" VARCHAR(2) NOT NULL,
  "readAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContactMessage_valid_content" CHECK (char_length("name") BETWEEN 2 AND 100 AND char_length("message") BETWEEN 10 AND 3000 AND "locale" IN ('fa', 'en'))
);
CREATE INDEX "ContactMessage_createdAt_idx" ON "ContactMessage"("createdAt");
