-- La nueva membresía no cambia el propietario ni el responsable del proyecto.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'COLLABORATOR';

CREATE TABLE "ProjectCollaborator" (
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectCollaborator_pkey" PRIMARY KEY ("projectId", "userId")
);

CREATE INDEX "ProjectCollaborator_userId_idx" ON "ProjectCollaborator"("userId");

ALTER TABLE "ProjectCollaborator" ADD CONSTRAINT "ProjectCollaborator_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectCollaborator" ADD CONSTRAINT "ProjectCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
