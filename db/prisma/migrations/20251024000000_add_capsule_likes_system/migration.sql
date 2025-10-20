-- AlterTable: Add new columns to capsules
ALTER TABLE "capsules" 
ADD COLUMN "share_id" VARCHAR(100),
ADD COLUMN "likes_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "views_count" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex: Create unique index on share_id
CREATE UNIQUE INDEX "capsules_share_id_key" ON "capsules"("share_id");

-- CreateIndex: Create index on share_id for queries
CREATE INDEX "idx_capsule_share_id" ON "capsules"("share_id");

-- CreateTable: Create capsule_likes table
CREATE TABLE "capsule_likes" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "capsuleId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capsule_likes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Unique constraint on userId + capsuleId
CREATE UNIQUE INDEX "capsule_likes_userId_capsuleId_key" ON "capsule_likes"("userId", "capsuleId");

-- AddForeignKey: Add foreign key to users
ALTER TABLE "capsule_likes" ADD CONSTRAINT "capsule_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Add foreign key to capsules
ALTER TABLE "capsule_likes" ADD CONSTRAINT "capsule_likes_capsuleId_fkey" FOREIGN KEY ("capsuleId") REFERENCES "capsules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
