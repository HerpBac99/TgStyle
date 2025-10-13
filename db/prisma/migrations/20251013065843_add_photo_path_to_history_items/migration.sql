-- AlterTable
ALTER TABLE "history_items" ADD COLUMN     "photo_path" VARCHAR(500),
ALTER COLUMN "photoData" DROP NOT NULL;
