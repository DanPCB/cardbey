/*
  Warnings:

  - A unique constraint covering the columns `[businessId,mode,key]` on the table `Section` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Business_userId_key";

-- DropIndex
DROP INDEX "Section_businessId_key_key";

-- CreateIndex
CREATE UNIQUE INDEX "Section_businessId_mode_key_key" ON "Section"("businessId", "mode", "key");
