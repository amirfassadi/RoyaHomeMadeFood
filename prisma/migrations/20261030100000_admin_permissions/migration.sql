-- AlterTable
ALTER TABLE "User" ADD COLUMN     "adminOwner" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "adminPermissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "mobile" DROP NOT NULL;


-- Preserve current administrators as owners; newly created admins default to limited access.
UPDATE "User" SET "adminOwner" = true WHERE "role" = 'ADMIN';
