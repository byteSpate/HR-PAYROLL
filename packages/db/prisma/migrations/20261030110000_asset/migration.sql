-- CreateEnum
CREATE TYPE "AssetClassification" AS ENUM ('IT', 'NON_IT');

-- CreateEnum
CREATE TYPE "AssetLifecycle" AS ENUM ('IN_SERVICE', 'LOST', 'RETIRED');

-- CreateEnum
CREATE TYPE "AssetCondition" AS ENUM ('NEW', 'GOOD', 'FAIR', 'DAMAGED');

-- CreateEnum
CREATE TYPE "AssetAttachmentKind" AS ENUM ('PHOTO', 'INVOICE', 'WARRANTY', 'CONDITION_OUT', 'CONDITION_IN');

-- CreateEnum
CREATE TYPE "AssetRequestKind" AS ENUM ('NEW_ITEM', 'REPAIR', 'RETURN');

-- CreateEnum
CREATE TYPE "AssetRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'ORDERED', 'REJECTED', 'CANCELLED', 'FULFILLED');

-- CreateEnum
CREATE TYPE "AssetRecoveryKind" AS ENUM ('NOT_RETURNED', 'DAMAGED', 'LOST');

-- CreateEnum
CREATE TYPE "AssetRecoveryStatus" AS ENUM ('PENDING', 'RECOVERED', 'WAIVED');

-- CreateEnum
CREATE TYPE "DepreciationRunStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');

-- CreateTable
CREATE TABLE "AssetCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requiresSerial" BOOLEAN NOT NULL DEFAULT true,
    "isConsumable" BOOLEAN NOT NULL DEFAULT false,
    "classification" "AssetClassification" NOT NULL,
    "tracksIndividually" BOOLEAN NOT NULL DEFAULT true,
    "usefulLifeMonths" INTEGER,

    CONSTRAINT "AssetCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "assetTag" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serialNumber" TEXT,
    "model" TEXT,
    "notes" TEXT,
    "purchaseDate" DATE,
    "purchaseCost" DECIMAL(14,2),
    "currency" "Currency" NOT NULL DEFAULT 'BDT',
    "vendor" TEXT,
    "warrantyExpiry" DATE,
    "fxRateToBdt" DECIMAL(18,6),
    "purchaseCostBdt" DECIMAL(14,2),
    "capitalisedAt" TIMESTAMP(3),
    "capitalisedBy" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidBy" TEXT,
    "departmentId" TEXT,
    "location" TEXT,
    "lifecycle" "AssetLifecycle" NOT NULL DEFAULT 'IN_SERVICE',
    "retiredAt" TIMESTAMP(3),
    "retiredBy" TEXT,
    "retirementNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetAssignment" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL,
    "assignedBy" TEXT NOT NULL,
    "conditionOut" "AssetCondition" NOT NULL,
    "issueNote" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "returnedTo" TEXT,
    "conditionIn" "AssetCondition",
    "returnNote" TEXT,

    CONSTRAINT "AssetAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetAttachment" (
    "id" TEXT NOT NULL,
    "assetId" TEXT,
    "assignmentId" TEXT,
    "kind" "AssetAttachmentKind" NOT NULL,
    "publicId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "format" TEXT NOT NULL,
    "uploadedBy" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetRequest" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" "AssetRequestKind" NOT NULL DEFAULT 'NEW_ITEM',
    "categoryId" TEXT,
    "assetId" TEXT,
    "quantity" INTEGER,
    "reason" TEXT NOT NULL,
    "status" "AssetRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "orderedAt" TIMESTAMP(3),
    "orderedBy" TEXT,
    "expectedBy" DATE,
    "orderNote" TEXT,
    "repairId" TEXT,
    "fulfilledAt" TIMESTAMP(3),
    "fulfilledBy" TEXT,
    "fulfilledAssetId" TEXT,
    "fulfilledNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetRepair" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "sentBy" TEXT NOT NULL,
    "vendor" TEXT,
    "fault" TEXT NOT NULL,
    "expectedBack" DATE,
    "isWarranty" BOOLEAN NOT NULL DEFAULT false,
    "returnedAt" TIMESTAMP(3),
    "cost" DECIMAL(14,2),
    "currency" "Currency" NOT NULL DEFAULT 'BDT',
    "outcome" TEXT,
    "conditionAfter" "AssetCondition",

    CONSTRAINT "AssetRepair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetRecovery" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "kind" "AssetRecoveryKind" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'BDT',
    "reason" TEXT NOT NULL,
    "status" "AssetRecoveryStatus" NOT NULL DEFAULT 'PENDING',
    "waivedBy" TEXT,
    "waivedAt" TIMESTAMP(3),
    "waiverReason" TEXT,
    "adjustmentId" TEXT,
    "settlementId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetRecovery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepreciationRun" (
    "id" TEXT NOT NULL,
    "runNo" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "DepreciationRunStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedBy" TEXT,
    "postedAt" TIMESTAMP(3),
    "reversedBy" TEXT,
    "reversedAt" TIMESTAMP(3),

    CONSTRAINT "DepreciationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetDepreciation" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "openingBookValue" DECIMAL(14,2) NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "months" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "AssetDepreciation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdCounter" (
    "id" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "IdCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssetCategory_code_key" ON "AssetCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "AssetCategory_name_key" ON "AssetCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_assetTag_key" ON "Asset"("assetTag");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_serialNumber_key" ON "Asset"("serialNumber");

-- CreateIndex
CREATE INDEX "Asset_categoryId_idx" ON "Asset"("categoryId");

-- CreateIndex
CREATE INDEX "Asset_lifecycle_idx" ON "Asset"("lifecycle");

-- CreateIndex
CREATE INDEX "AssetAssignment_assetId_assignedAt_idx" ON "AssetAssignment"("assetId", "assignedAt");

-- CreateIndex
CREATE INDEX "AssetAssignment_employeeId_returnedAt_idx" ON "AssetAssignment"("employeeId", "returnedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssetAttachment_publicId_key" ON "AssetAttachment"("publicId");

-- CreateIndex
CREATE INDEX "AssetAttachment_assetId_uploadedAt_idx" ON "AssetAttachment"("assetId", "uploadedAt");

-- CreateIndex
CREATE INDEX "AssetAttachment_assignmentId_uploadedAt_idx" ON "AssetAttachment"("assignmentId", "uploadedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssetRequest_repairId_key" ON "AssetRequest"("repairId");

-- CreateIndex
CREATE INDEX "AssetRequest_status_idx" ON "AssetRequest"("status");

-- CreateIndex
CREATE INDEX "AssetRequest_employeeId_createdAt_idx" ON "AssetRequest"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "AssetRequest_kind_status_idx" ON "AssetRequest"("kind", "status");

-- CreateIndex
CREATE INDEX "AssetRepair_assetId_sentAt_idx" ON "AssetRepair"("assetId", "sentAt");

-- CreateIndex
CREATE INDEX "AssetRepair_returnedAt_idx" ON "AssetRepair"("returnedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssetRecovery_adjustmentId_key" ON "AssetRecovery"("adjustmentId");

-- CreateIndex
CREATE INDEX "AssetRecovery_employeeId_status_idx" ON "AssetRecovery"("employeeId", "status");

-- CreateIndex
CREATE INDEX "AssetRecovery_assetId_idx" ON "AssetRecovery"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "DepreciationRun_runNo_key" ON "DepreciationRun"("runNo");

-- CreateIndex
CREATE INDEX "DepreciationRun_status_idx" ON "DepreciationRun"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DepreciationRun_year_month_key" ON "DepreciationRun"("year", "month");

-- CreateIndex
CREATE INDEX "AssetDepreciation_assetId_idx" ON "AssetDepreciation"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetDepreciation_runId_assetId_key" ON "AssetDepreciation"("runId", "assetId");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AssetCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetAssignment" ADD CONSTRAINT "AssetAssignment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetAssignment" ADD CONSTRAINT "AssetAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetAttachment" ADD CONSTRAINT "AssetAttachment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetAttachment" ADD CONSTRAINT "AssetAttachment_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "AssetAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetRequest" ADD CONSTRAINT "AssetRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetRequest" ADD CONSTRAINT "AssetRequest_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AssetCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetRequest" ADD CONSTRAINT "AssetRequest_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetRequest" ADD CONSTRAINT "AssetRequest_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "AssetRepair"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetRequest" ADD CONSTRAINT "AssetRequest_fulfilledAssetId_fkey" FOREIGN KEY ("fulfilledAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetRepair" ADD CONSTRAINT "AssetRepair_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetRecovery" ADD CONSTRAINT "AssetRecovery_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetRecovery" ADD CONSTRAINT "AssetRecovery_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetRecovery" ADD CONSTRAINT "AssetRecovery_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "AssetAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetDepreciation" ADD CONSTRAINT "AssetDepreciation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DepreciationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetDepreciation" ADD CONSTRAINT "AssetDepreciation_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One open custody row per asset. The service answers with a sentence naming the holder; this is the guarantee behind it.
CREATE UNIQUE INDEX "AssetAssignment_open_per_asset" ON "AssetAssignment"("assetId") WHERE "returnedAt" IS NULL;

-- An attachment belongs to an asset or to a handover, never both and never neither.
ALTER TABLE "AssetAttachment" ADD CONSTRAINT "AssetAttachment_one_owner" CHECK (("assetId" IS NULL) <> ("assignmentId" IS NULL));

-- A new-item request names a category; a repair or return names the asset the requester holds.
ALTER TABLE "AssetRequest" ADD CONSTRAINT "AssetRequest_kind_target" CHECK (
  ("kind" = 'NEW_ITEM' AND "categoryId" IS NOT NULL AND "assetId" IS NULL)
  OR ("kind" IN ('REPAIR', 'RETURN') AND "assetId" IS NOT NULL AND "categoryId" IS NULL)
);

-- Quantity is a supply concept and belongs to nothing else.
ALTER TABLE "AssetRequest" ADD CONSTRAINT "AssetRequest_quantity_kind" CHECK ("quantity" IS NULL OR ("kind" = 'NEW_ITEM' AND "quantity" > 0));

-- One live repair or return request per asset: asking again about the same laptop is a duplicate, not a new fact.
CREATE UNIQUE INDEX "AssetRequest_one_live_per_asset" ON "AssetRequest"("assetId", "kind") WHERE "status" IN ('PENDING', 'APPROVED', 'ORDERED');
