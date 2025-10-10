const { Client } = require('pg');
require('dotenv').config();

async function migrateAddClassification() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('✅ Подключено к PostgreSQL');

    // Создаем ENUM для категорий одежды
    console.log('📝 Создаем enum ClothingCategory...');
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE "ClothingCategory" AS ENUM (
          'OUTERWEAR',
          'INNERWEAR',
          'BODYWEAR',
          'FULLBODY',
          'LEGWEAR',
          'FOOTWEAR',
          'HEADWEAR',
          'ACCESSORIES'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('✅ Enum ClothingCategory создан');

    // Преобразуем старую колонку category в subtype
    console.log('📝 Переименовываем category → subtype...');
    await client.query(`
      ALTER TABLE wardrobe_items 
      RENAME COLUMN category TO subtype;
    `);
    console.log('✅ Колонка переименована');

    // Добавляем новую колонку category типа ENUM
    console.log('📝 Добавляем новую колонку category (enum)...');
    await client.query(`
      ALTER TABLE wardrobe_items 
      ADD COLUMN category "ClothingCategory";
    `);
    console.log('✅ Колонка category добавлена');

    // Добавляем колонки для атрибутов одежды
    console.log('📝 Добавляем колонки style, material, pattern...');
    await client.query(`
      ALTER TABLE wardrobe_items 
      ADD COLUMN IF NOT EXISTS style VARCHAR(100),
      ADD COLUMN IF NOT EXISTS material VARCHAR(100),
      ADD COLUMN IF NOT EXISTS pattern VARCHAR(100);
    `);
    console.log('✅ Колонки добавлены');

    // Обновляем индекс для новой структуры
    console.log('📝 Пересоздаем индекс для category...');
    await client.query(`
      DROP INDEX IF EXISTS idx_wardrobe_category;
      CREATE INDEX idx_wardrobe_category ON wardrobe_items(category);
      CREATE INDEX IF NOT EXISTS idx_wardrobe_subtype ON wardrobe_items(subtype);
    `);
    console.log('✅ Индексы созданы');

    console.log('\n✅ Миграция успешно выполнена!');
    console.log('\n📊 Новая структура таблицы:');
    console.log('   - category: ClothingCategory (enum) - основная категория');
    console.log('   - subtype: VARCHAR(100) - детализация (jacket, jeans, dress)');
    console.log('   - color: VARCHAR(50) - основной цвет');
    console.log('   - style: VARCHAR(100) - стиль (casual, formal, sport)');
    console.log('   - material: VARCHAR(100) - материал (cotton, denim, leather)');
    console.log('   - pattern: VARCHAR(100) - узор (plain, striped, checked)');

  } catch (error) {
    console.error('❌ Ошибка миграции:', error.message);
    throw error;
  } finally {
    await client.end();
    console.log('🔌 Отключено от PostgreSQL');
  }
}

// Запускаем миграцию
migrateAddClassification()
  .then(() => {
    console.log('\n🎉 Готово!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Фатальная ошибка:', error);
    process.exit(1);
  });
