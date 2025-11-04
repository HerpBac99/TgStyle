/*
  Warnings:

  - Added the required column `key_id` to the `style_outfits` table without a default value. There are 1 rows in this table, it is not possible to execute this step.
  - Added the required column `key_id` to the `style_outfit_items` table without a default value. There are 6 rows in this table, it is not possible to execute this step.
  - Added the required column `set_id` to the `style_outfit_items` table without a default value. There are 6 rows in this table, it is not possible to execute this step.

*/
-- AlterTable: Добавляем поле key_id в style_outfits с временным дефолтом
ALTER TABLE "style_outfits" ADD COLUMN "key_id" VARCHAR(100) DEFAULT 'temp_default';

-- AlterTable: Добавляем поля key_id и set_id в style_outfit_items с временными дефолтами
ALTER TABLE "style_outfit_items" ADD COLUMN "key_id" VARCHAR(100) DEFAULT 'temp_default';
ALTER TABLE "style_outfit_items" ADD COLUMN "set_id" VARCHAR(100) DEFAULT 'temp_default';

-- Обновляем существующие записи в style_outfits
-- Генерируем уникальные key_id на основе id и названия
UPDATE "style_outfits" 
SET "key_id" = 'outfit_key_' || id::text || '_' || LOWER(REPLACE(REPLACE(name, ' ', '_'), '-', '_'))
WHERE "key_id" = 'temp_default';

-- Обновляем существующие записи в style_outfit_items
-- Связываем с key_id родительского outfit и создаем уникальные set_id
UPDATE "style_outfit_items" 
SET 
    "key_id" = (
        SELECT 'outfit_key_' || so.id::text || '_' || LOWER(REPLACE(REPLACE(so.name, ' ', '_'), '-', '_'))
        FROM "style_outfits" so 
        WHERE so.id = "style_outfit_items"."outfit_id"
    ),
    "set_id" = 'set_' || "outfit_id"::text || '_' || id::text
WHERE "key_id" = 'temp_default' OR "set_id" = 'temp_default';

-- Убираем дефолтные значения и делаем поля обязательными
ALTER TABLE "style_outfits" ALTER COLUMN "key_id" DROP DEFAULT;
ALTER TABLE "style_outfits" ALTER COLUMN "key_id" SET NOT NULL;

ALTER TABLE "style_outfit_items" ALTER COLUMN "key_id" DROP DEFAULT;
ALTER TABLE "style_outfit_items" ALTER COLUMN "key_id" SET NOT NULL;
ALTER TABLE "style_outfit_items" ALTER COLUMN "set_id" DROP DEFAULT;
ALTER TABLE "style_outfit_items" ALTER COLUMN "set_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "idx_style_outfit_key_id" ON "style_outfits"("key_id");

-- CreateIndex
CREATE INDEX "idx_style_outfit_item_key_id" ON "style_outfit_items"("key_id");

-- CreateIndex
CREATE INDEX "idx_style_outfit_item_set_id" ON "style_outfit_items"("set_id");

-- CreateIndex
CREATE INDEX "idx_style_outfit_item_key_set" ON "style_outfit_items"("key_id", "set_id");