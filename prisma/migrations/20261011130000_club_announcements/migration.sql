CREATE TABLE "ClubAnnouncement" (
 "id" TEXT PRIMARY KEY,
 "titleFa" VARCHAR(150) NOT NULL, "titleEn" VARCHAR(150) NOT NULL,
 "bodyFa" TEXT NOT NULL, "bodyEn" TEXT NOT NULL,
 "startsAt" TIMESTAMPTZ(3), "expiresAt" TIMESTAMPTZ(3), "active" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "announcement_dates" CHECK ("startsAt" IS NULL OR "expiresAt" IS NULL OR "startsAt" < "expiresAt")
);
CREATE INDEX "ClubAnnouncement_active_createdAt_idx" ON "ClubAnnouncement"("active","createdAt");
