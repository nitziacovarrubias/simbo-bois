-- Mantener los proyectos y cuentas anteriores sin perder datos.
CREATE TYPE "ProjectStage" AS ENUM ('DESIGN','CUTTING','QUOTING','MANUFACTURING','INSTALLATION','COMPLETED');
ALTER TABLE "Project" ADD COLUMN "stage" "ProjectStage" NOT NULL DEFAULT 'DESIGN';
ALTER TABLE "Project" ADD COLUMN "clientId" TEXT;
CREATE TABLE "Client" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" VARCHAR(160) NOT NULL,
  "phone" VARCHAR(32), "email" VARCHAR(160),
  "address" VARCHAR(240), "placeId" VARCHAR(240),
  "taxId" VARCHAR(32), "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Client_name_idx" ON "Client"("name");
-- Migrar nombres de cliente previos a registros compartidos sin duplicar nombres.
INSERT INTO "Client" ("id", "name")
SELECT 'legacy-' || md5(lower(trim("clientName"))), min(trim("clientName"))
FROM "Project" WHERE nullif(trim("clientName"), '') IS NOT NULL
GROUP BY lower(trim("clientName"));
UPDATE "Project" AS p SET "clientId" = c."id" FROM "Client" AS c
WHERE p."clientName" IS NOT NULL AND c."id" = 'legacy-' || md5(lower(trim(p."clientName")));
CREATE INDEX "Project_clientId_idx" ON "Project"("clientId");
CREATE INDEX "Project_stage_idx" ON "Project"("stage");
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "User" ADD COLUMN "username" VARCHAR(40);
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
