-- DropIndex
DROP INDEX "DepreciationRun_year_month_key";

-- AlterTable
ALTER TABLE "AssetCategory" ADD COLUMN     "depreciationRate" DECIMAL(5,2);

-- CreateIndex
CREATE INDEX "DepreciationRun_year_month_idx" ON "DepreciationRun"("year", "month");

-- One live run per month. A reversed run keeps its row for the trail and frees the month.
CREATE UNIQUE INDEX "DepreciationRun_one_live_per_month" ON "DepreciationRun"("year", "month") WHERE "status" <> 'REVERSED';
