-- AlterTable
ALTER TABLE "_CapsuleToWardrobeItem" ADD CONSTRAINT "_CapsuleToWardrobeItem_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_CapsuleToWardrobeItem_AB_unique";

-- CreateTable
CREATE TABLE "stock_items" (
    "id" SERIAL NOT NULL,
    "image_path" VARCHAR(500) NOT NULL,
    "gender" VARCHAR(10) NOT NULL,
    "category" "ClothingCategory",
    "subtype" VARCHAR(100),
    "color" VARCHAR(50),
    "style" VARCHAR(100),
    "material" VARCHAR(100),
    "pattern" VARCHAR(100),
    "fit" VARCHAR(100),
    "season" VARCHAR(50),
    "description" VARCHAR(500),
    "embedding" vector(512),
    "productName" VARCHAR(255),
    "brand" VARCHAR(100),
    "price" DECIMAL(10,2),
    "currency" VARCHAR(3),
    "productUrl" VARCHAR(500),
    "merchant" VARCHAR(50),
    "affiliateLink" VARCHAR(500),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "views_count" INTEGER NOT NULL DEFAULT 0,
    "clicks_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_stock_gender" ON "stock_items"("gender");

-- CreateIndex
CREATE INDEX "idx_stock_category" ON "stock_items"("category");

-- CreateIndex
CREATE INDEX "idx_stock_subtype" ON "stock_items"("subtype");

-- CreateIndex
CREATE INDEX "idx_stock_color" ON "stock_items"("color");

-- CreateIndex
CREATE INDEX "idx_stock_season" ON "stock_items"("season");

-- CreateIndex
CREATE INDEX "idx_stock_is_active" ON "stock_items"("isActive");

-- CreateIndex
CREATE INDEX "idx_stock_merchant" ON "stock_items"("merchant");

-- CreateIndex
CREATE INDEX "idx_stock_priority" ON "stock_items"("priority" DESC);
