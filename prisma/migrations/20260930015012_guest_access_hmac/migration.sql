/*
  Warnings:

  - You are about to drop the column `accessTokenHash` on the `Reservation` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Reservation_accessTokenHash_key";

-- AlterTable
ALTER TABLE "Reservation" DROP COLUMN "accessTokenHash",
ADD COLUMN     "accessVersion" INTEGER NOT NULL DEFAULT 1;
