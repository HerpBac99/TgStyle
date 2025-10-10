-- CreateTable
CREATE TABLE "capsules" (
    "id" SERIAL NOT NULL,
    "telegram_id" BIGINT NOT NULL,
    "name" VARCHAR(255),
    "description" VARCHAR(500),
    "canvasData" JSONB NOT NULL,
    "analysis" TEXT,
    "analysis_date" TIMESTAMP(3),
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capsules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CapsuleToWardrobeItem" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE INDEX "idx_capsule_telegram_id" ON "capsules"("telegram_id");

-- CreateIndex
CREATE INDEX "idx_capsule_created_at" ON "capsules"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_capsule_is_public" ON "capsules"("is_public");

-- CreateIndex
CREATE UNIQUE INDEX "_CapsuleToWardrobeItem_AB_unique" ON "_CapsuleToWardrobeItem"("A", "B");

-- CreateIndex
CREATE INDEX "_CapsuleToWardrobeItem_B_index" ON "_CapsuleToWardrobeItem"("B");

-- AddForeignKey
ALTER TABLE "capsules" ADD CONSTRAINT "fk_capsule_user" FOREIGN KEY ("telegram_id") REFERENCES "users"("telegramId") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "_CapsuleToWardrobeItem" ADD CONSTRAINT "_CapsuleToWardrobeItem_A_fkey" FOREIGN KEY ("A") REFERENCES "capsules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CapsuleToWardrobeItem" ADD CONSTRAINT "_CapsuleToWardrobeItem_B_fkey" FOREIGN KEY ("B") REFERENCES "wardrobe_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
