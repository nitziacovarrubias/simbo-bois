-- CreateTable
CREATE TABLE "CuttingListAuthorization" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "authorizedById" TEXT NOT NULL,
    "authorizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cuttingListJson" JSONB NOT NULL,

    CONSTRAINT "CuttingListAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CuttingListAuthorization_versionId_key" ON "CuttingListAuthorization"("versionId");

-- CreateIndex
CREATE INDEX "CuttingListAuthorization_projectId_authorizedAt_idx" ON "CuttingListAuthorization"("projectId", "authorizedAt");

-- AddForeignKey
ALTER TABLE "CuttingListAuthorization" ADD CONSTRAINT "CuttingListAuthorization_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuttingListAuthorization" ADD CONSTRAINT "CuttingListAuthorization_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DesignVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuttingListAuthorization" ADD CONSTRAINT "CuttingListAuthorization_authorizedById_fkey" FOREIGN KEY ("authorizedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
