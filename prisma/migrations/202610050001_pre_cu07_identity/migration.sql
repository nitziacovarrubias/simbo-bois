CREATE TYPE "UserRole" AS ENUM ('ARCHITECT', 'SUPERVISOR');
CREATE TYPE "DesignApprovalStatus" AS ENUM ('DRAFT', 'APPROVED');
CREATE TABLE "User" (
  "id" TEXT NOT NULL PRIMARY KEY, "email" TEXT NOT NULL, "name" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL, "role" "UserRole" NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE TABLE "Session" (
  "id" TEXT NOT NULL PRIMARY KEY, "tokenHash" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
ALTER TABLE "Project" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Project_ownerId_idx" ON "Project"("ownerId");
ALTER TABLE "DesignVersion" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "approvalStatus" "DesignApprovalStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "approvedAt" TIMESTAMP(3), ADD COLUMN "approvedById" TEXT;
ALTER TABLE "DesignVersion" ADD CONSTRAINT "DesignVersion_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Recuperar sólo metadatos históricos numéricos representables; nunca inferir aprobación.
UPDATE "DesignVersion" SET "revision" = ("designJson" #>> '{metadata,draftRevision}')::integer
WHERE ("designJson" #>> '{metadata,draftRevision}') ~ '^[0-9]{1,9}$';
