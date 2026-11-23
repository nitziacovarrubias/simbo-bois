-- Campos opcionales: no afectan los proyectos ni diseños existentes.
ALTER TABLE "Project"
  ADD COLUMN "projectType" VARCHAR(24),
  ADD COLUMN "clientName" VARCHAR(160),
  ADD COLUMN "location" VARCHAR(240),
  ADD COLUMN "description" VARCHAR(1000),
  ADD COLUMN "responsibleId" TEXT;

CREATE INDEX "Project_responsibleId_idx" ON "Project"("responsibleId");
ALTER TABLE "Project" ADD CONSTRAINT "Project_responsibleId_fkey"
  FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_projectType_check"
  CHECK ("projectType" IS NULL OR "projectType" IN ('KITCHEN','CLOSET','MIXED','OTHER'));
