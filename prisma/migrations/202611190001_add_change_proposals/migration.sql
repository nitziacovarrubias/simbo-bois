CREATE TABLE "DesignChangeProposal" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "observation" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesignChangeProposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DesignChangeProposal_projectId_versionId_createdAt_idx"
ON "DesignChangeProposal"("projectId", "versionId", "createdAt");

ALTER TABLE "DesignChangeProposal"
ADD CONSTRAINT "DesignChangeProposal_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DesignChangeProposal"
ADD CONSTRAINT "DesignChangeProposal_versionId_fkey"
FOREIGN KEY ("versionId") REFERENCES "DesignVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DesignChangeProposal"
ADD CONSTRAINT "DesignChangeProposal_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
