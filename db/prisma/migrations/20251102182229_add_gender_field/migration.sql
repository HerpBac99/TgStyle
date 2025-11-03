/*
  Warnings:

  - A unique constraint covering the columns `[share_id]` on the table `history_items` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "capsules" ADD COLUMN     "metadata" JSONB;

-- AlterTable
ALTER TABLE "history_items" ADD COLUMN     "likes_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "share_id" VARCHAR(100),
ADD COLUMN     "views_count" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "isPublic" SET DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "gender" TEXT,
ALTER COLUMN "analysesCount" SET DEFAULT 10;

-- AlterTable
ALTER TABLE "wardrobe_items" ADD COLUMN     "season" VARCHAR(50);

-- CreateIndex
CREATE UNIQUE INDEX "history_items_share_id_key" ON "history_items"("share_id");

-- CreateIndex
CREATE INDEX "history_items_share_id_idx" ON "history_items"("share_id");
