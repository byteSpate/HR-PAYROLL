-- CreateTable
CREATE TABLE "EmailChangeRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "newEmail" TEXT NOT NULL,
    "approveTokenHash" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "confirmTokenHash" TEXT,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailChangeRequest_approveTokenHash_key" ON "EmailChangeRequest"("approveTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "EmailChangeRequest_confirmTokenHash_key" ON "EmailChangeRequest"("confirmTokenHash");

-- CreateIndex
CREATE INDEX "EmailChangeRequest_userId_expiresAt_idx" ON "EmailChangeRequest"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "EmailChangeRequest_approveTokenHash_idx" ON "EmailChangeRequest"("approveTokenHash");

-- CreateIndex
CREATE INDEX "EmailChangeRequest_confirmTokenHash_idx" ON "EmailChangeRequest"("confirmTokenHash");

-- AddForeignKey
ALTER TABLE "EmailChangeRequest" ADD CONSTRAINT "EmailChangeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
