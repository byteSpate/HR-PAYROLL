-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('BDT', 'USD');

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "base" "Currency" NOT NULL,
    "quote" "Currency" NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExchangeRate_base_quote_effectiveFrom_idx" ON "ExchangeRate"("base", "quote", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_base_quote_effectiveFrom_key" ON "ExchangeRate"("base", "quote", "effectiveFrom");
