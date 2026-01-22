-- Add DVLA snapshot columns to CustomerVehicle
-- NOTE: This assumes the CustomerVehicle table already exists in the target database.

ALTER TABLE "CustomerVehicle"
  ADD COLUMN IF NOT EXISTS "dvlaTaxStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "dvlaTaxDueDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dvlaMotStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "dvlaMotExpiryDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dvlaYearOfManufacture" INTEGER,
  ADD COLUMN IF NOT EXISTS "dvlaEngineCapacity" INTEGER,
  ADD COLUMN IF NOT EXISTS "dvlaCo2Emissions" INTEGER,
  ADD COLUMN IF NOT EXISTS "dvlaFuelType" TEXT,
  ADD COLUMN IF NOT EXISTS "dvlaMarkedForExport" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "dvlaColour" TEXT,
  ADD COLUMN IF NOT EXISTS "dvlaTypeApproval" TEXT,
  ADD COLUMN IF NOT EXISTS "dvlaDateOfLastV5CIssued" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dvlaWheelplan" TEXT,
  ADD COLUMN IF NOT EXISTS "dvlaMonthOfFirstRegistration" TEXT;


