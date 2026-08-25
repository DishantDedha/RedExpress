-- CreateEnum
CREATE TYPE "RequesterCallOutcome" AS ENUM ('PICKED_UP', 'NO_ANSWER', 'WRONG_NUMBER');

-- AlterTable: RequestMatch — the requester's own report of how their call to this donor
-- went. Separate from CallLog.outcome (staff-recorded); see schema.prisma for why.
ALTER TABLE "RequestMatch" ADD COLUMN "requesterCallOutcome" "RequesterCallOutcome";
ALTER TABLE "RequestMatch" ADD COLUMN "requesterCallOutcomeAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "RequestMatch_donorUserId_createdAt_idx" ON "RequestMatch"("donorUserId", "createdAt");
