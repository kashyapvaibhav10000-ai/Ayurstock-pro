-- Username login: optional, globally unique, stored lowercase. Login history
-- records the identifier typed (username or email).

-- AlterTable
ALTER TABLE "LoginHistory" ADD COLUMN     "identifier" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "username" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");


-- Uniqueness is case-insensitive only because values are lowercase; enforce it.
ALTER TABLE "User" ADD CONSTRAINT "User_username_lowercase" CHECK ("username" = lower("username"));
