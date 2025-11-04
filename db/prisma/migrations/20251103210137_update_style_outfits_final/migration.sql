/*
  Warnings:

  - You are about to drop the column `priority` on the `style_outfit_items` table. All the data in the column will be lost.
  - You are about to drop the column `theme` on the `style_outfits` table. All the data in the column will be lost.
  - You are about to alter the column `description` on the `style_outfits` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(500)`.

*/
-- DropIndex
DROP INDEX "idx_style_outfit_item_priority";

-- DropIndex
DROP INDEX "idx_style_outfit_theme";

-- AlterTable
ALTER TABLE "style_outfit_items" DROP COLUMN "priority",
ADD COLUMN     "description" VARCHAR(500),
ADD COLUMN     "gender" VARCHAR(10),
ADD COLUMN     "mandatory" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "category" DROP NOT NULL;

-- AlterTable
ALTER TABLE "style_outfits" DROP COLUMN "theme",
ADD COLUMN     "category" "ClothingCategory",
ADD COLUMN     "color" VARCHAR(50),
ADD COLUMN     "fit" VARCHAR(100),
ADD COLUMN     "material" VARCHAR(100),
ADD COLUMN     "pattern" VARCHAR(100),
ADD COLUMN     "subtype" VARCHAR(100),
ALTER COLUMN "description" SET DATA TYPE VARCHAR(500);

-- CreateIndex
CREATE INDEX "idx_style_outfit_item_mandatory" ON "style_outfit_items"("mandatory");
