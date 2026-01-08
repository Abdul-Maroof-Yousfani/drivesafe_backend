/*
  Warnings:

  - Added the required column `durationValue` to the `WarrantyPackage` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "WarrantyPackage" ADD COLUMN     "context" TEXT NOT NULL DEFAULT 'drive_safe',
ADD COLUMN     "durationUnit" TEXT NOT NULL DEFAULT 'months',
ADD COLUMN     "durationValue" INTEGER NOT NULL,
ADD COLUMN     "includedFeatures" JSONB,
ALTER COLUMN "price" DROP NOT NULL;
