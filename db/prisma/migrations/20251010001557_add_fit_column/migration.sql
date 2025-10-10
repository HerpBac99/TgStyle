-- CreateEnum
CREATE TYPE "ClothingCategory" AS ENUM ('OUTERWEAR', 'INNERWEAR', 'BODYWEAR', 'FULLBODY', 'LEGWEAR', 'FOOTWEAR', 'HEADWEAR', 'ACCESSORIES');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "username" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "analysesCount" INTEGER NOT NULL DEFAULT 3,
    "subscriptionType" TEXT NOT NULL DEFAULT 'free',
    "subscriptionEndDate" TIMESTAMP(3),
    "totalAnalyses" INTEGER NOT NULL DEFAULT 0,
    "weeklyResetDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "history_items" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "photoData" TEXT NOT NULL,
    "analysisText" TEXT,
    "technicalAnalysis" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "history_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ratings" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "historyItemId" INTEGER NOT NULL,
    "ratingType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "historyItemId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "parentCommentId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "relatedUserId" INTEGER,
    "historyItemId" INTEGER,
    "commentId" INTEGER,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wardrobe_items" (
    "id" SERIAL NOT NULL,
    "telegram_id" BIGINT NOT NULL,
    "image_path" VARCHAR(500) NOT NULL,
    "category" "ClothingCategory",
    "subtype" VARCHAR(100),
    "color" VARCHAR(50),
    "style" VARCHAR(100),
    "material" VARCHAR(100),
    "pattern" VARCHAR(100),
    "fit" VARCHAR(100),
    "description" VARCHAR(500),
    "name" VARCHAR(255),
    "tags" TEXT[],
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wardrobe_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_telegramId_key" ON "users"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "ratings_userId_historyItemId_key" ON "ratings"("userId", "historyItemId");

-- CreateIndex
CREATE INDEX "idx_wardrobe_category" ON "wardrobe_items"("category");

-- CreateIndex
CREATE INDEX "idx_wardrobe_subtype" ON "wardrobe_items"("subtype");

-- CreateIndex
CREATE INDEX "idx_wardrobe_created_at" ON "wardrobe_items"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_wardrobe_telegram_id" ON "wardrobe_items"("telegram_id");

-- AddForeignKey
ALTER TABLE "history_items" ADD CONSTRAINT "history_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_historyItemId_fkey" FOREIGN KEY ("historyItemId") REFERENCES "history_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_historyItemId_fkey" FOREIGN KEY ("historyItemId") REFERENCES "history_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parentCommentId_fkey" FOREIGN KEY ("parentCommentId") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_historyItemId_fkey" FOREIGN KEY ("historyItemId") REFERENCES "history_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_relatedUserId_fkey" FOREIGN KEY ("relatedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wardrobe_items" ADD CONSTRAINT "fk_wardrobe_user" FOREIGN KEY ("telegram_id") REFERENCES "users"("telegramId") ON DELETE CASCADE ON UPDATE NO ACTION;
