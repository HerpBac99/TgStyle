-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "wardrobe_items" ADD COLUMN "embedding" vector(512);

-- CreateTable
CREATE TABLE "style_outfits" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "image_path" VARCHAR(500) NOT NULL,
    "gender" VARCHAR(10),
    "season" VARCHAR(50),
    "style" VARCHAR(100),
    "theme" VARCHAR(100),
    "embedding" vector(512),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "style_outfits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "style_outfit_items" (
    "id" SERIAL NOT NULL,
    "outfit_id" INTEGER NOT NULL,
    "category" "ClothingCategory" NOT NULL,
    "subtype" VARCHAR(100),
    "color" VARCHAR(50),
    "material" VARCHAR(100),
    "season" VARCHAR(50),
    "image_path" VARCHAR(500) NOT NULL,
    "embedding" vector(512),
    "priority" INTEGER NOT NULL DEFAULT 1,
    "style" VARCHAR(100),
    "pattern" VARCHAR(100),
    "fit" VARCHAR(100),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "style_outfit_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_style_outfit_gender" ON "style_outfits"("gender");

-- CreateIndex
CREATE INDEX "idx_style_outfit_season" ON "style_outfits"("season");

-- CreateIndex
CREATE INDEX "idx_style_outfit_style" ON "style_outfits"("style");

-- CreateIndex
CREATE INDEX "idx_style_outfit_theme" ON "style_outfits"("theme");

-- CreateIndex
CREATE INDEX "idx_style_outfit_item_outfit" ON "style_outfit_items"("outfit_id");

-- CreateIndex
CREATE INDEX "idx_style_outfit_item_category" ON "style_outfit_items"("category");

-- CreateIndex
CREATE INDEX "idx_style_outfit_item_priority" ON "style_outfit_items"("priority");

-- CreateIndex
CREATE INDEX "idx_style_outfit_item_color" ON "style_outfit_items"("color");

-- CreateIndex
CREATE INDEX "idx_style_outfit_item_season" ON "style_outfit_items"("season");

-- AddForeignKey
ALTER TABLE "style_outfit_items" ADD CONSTRAINT "style_outfit_items_outfit_id_fkey" FOREIGN KEY ("outfit_id") REFERENCES "style_outfits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
