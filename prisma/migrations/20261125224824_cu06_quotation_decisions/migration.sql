-- CreateEnum
CREATE TYPE "QuotationDecisionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decidedById" TEXT,
ADD COLUMN     "decisionStatus" "QuotationDecisionStatus" NOT NULL DEFAULT 'PENDING';

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
