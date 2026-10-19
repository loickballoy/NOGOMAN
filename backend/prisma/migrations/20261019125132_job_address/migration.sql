-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "address" TEXT,
ADD COLUMN     "locationVerified" BOOLEAN NOT NULL DEFAULT false;
