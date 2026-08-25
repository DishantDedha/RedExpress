-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'BUSY', 'RECENTLY_DONATED', 'TEMPORARILY_UNAVAILABLE');

-- AlterEnum
ALTER TYPE "MatchResponse" ADD VALUE 'MAYBE_LATER';

-- AlterTable: DonorProfile — weight, emergency contact, and the availability enum
ALTER TABLE "DonorProfile" ADD COLUMN "weight" DOUBLE PRECISION;
ALTER TABLE "DonorProfile" ADD COLUMN "emergencyContact" TEXT;
ALTER TABLE "DonorProfile" ADD COLUMN "availabilityStatus" "AvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE';

-- Carry every donor's existing on/off switch into the new vocabulary before the old column
-- is dropped, rather than defaulting everyone back to AVAILABLE.
UPDATE "DonorProfile"
SET "availabilityStatus" = CASE WHEN "isAvailable" THEN 'AVAILABLE' ELSE 'TEMPORARILY_UNAVAILABLE' END::"AvailabilityStatus";

DROP INDEX "DonorProfile_bloodGroup_isAvailable_idx";
ALTER TABLE "DonorProfile" DROP COLUMN "isAvailable";
CREATE INDEX "DonorProfile_bloodGroup_availabilityStatus_idx" ON "DonorProfile"("bloodGroup", "availabilityStatus");

-- AlterTable: BloodRequest — patient name (nullable: requests posted before this field
-- existed have none on file; new requests are required to supply it)
ALTER TABLE "BloodRequest" ADD COLUMN "patientName" TEXT;

-- CreateTable: PasswordResetToken
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_userId_createdAt_idx" ON "PasswordResetToken"("userId", "createdAt");
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
