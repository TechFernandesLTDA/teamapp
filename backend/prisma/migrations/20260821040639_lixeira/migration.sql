-- AlterTable
ALTER TABLE "Card" ADD COLUMN "deletedAt" DATETIME;

-- AlterTable
ALTER TABLE "List" ADD COLUMN "deletedAt" DATETIME;

-- CreateIndex
CREATE INDEX "Card_deletedAt_idx" ON "Card"("deletedAt");

-- CreateIndex
CREATE INDEX "List_deletedAt_idx" ON "List"("deletedAt");
