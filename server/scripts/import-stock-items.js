/**
 * Скрипт для импорта товаров из стока
 * 
 * Структура папок:
 * server/uploads/stock/
 *   ├── man/
 *   │   ├── FOOTWEAR/
 *   │   │   ├── белые_кроссовки_найк.png
 *   │   │   └── черные_ботинки_тимберленд.png
 *   │   ├── OUTERWEAR/
 *   │   └── ...
 *   └── woman/
 *       ├── FOOTWEAR/
 *       └── ...
 * 
 * Использование:
 * node server/scripts/import-stock-items.js --gender=man --category=FOOTWEAR
 * node server/scripts/import-stock-items.js --gender=woman --all
 * node server/scripts/import-stock-items.js --all
 */

const fs = require('fs');
const path = require('path');
// Используем Prisma Client из папки db
const { PrismaClient } = require('../../db/node_modules/@prisma/client');

const prisma = new PrismaClient();

// Конфигурация
const CONFIG = {
  stockDir: path.join(__dirname, '..', 'uploads', 'stock'),
  fastvlmUrl: 'http://127.0.0.1:3001',
  supportedExtensions: ['.png', '.jpg', '.jpeg', '.webp'],
  categories: [
    'OUTERWEAR', 'INNERWEAR', 'BODYWEAR', 'FULLBODY',
    'LEGWEAR', 'FOOTWEAR', 'HEADWEAR', 'ACCESSORIES'
  ]
};

/**
 * Парсит название файла для извлечения информации
 * Формат: цвет_тип_бренд.png
 * Пример: белые_кроссовки_найк.png
 */
function parseFileName(fileName) {
  const nameWithoutExt = path.parse(fileName).name;
  const parts = nameWithoutExt.split('_');
  
  return {
    productName: nameWithoutExt.replace(/_/g, ' '),
    subtype: parts[0] || null,
    color: parts[1] || null,
  };
}

/**
 * Классифицирует изображение через FastVLM и удаляет фон
 */
async function classifyAndProcessImage(imagePath) {
  try {
    console.log(`  📸 Обработка: ${path.basename(imagePath)}`);
    
    // Читаем изображение
    const imageBuffer = fs.readFileSync(imagePath);
    const imageBase64 = imageBuffer.toString('base64');
    
    // Отправляем на FastVLM для классификации (с удалением фона)
    console.log(`  🔄 Классификация и удаление фона...`);
    const response = await fetch(`${CONFIG.fastvlmUrl}/classify_clothing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ image_base64: imageBase64 }),
      signal: AbortSignal.timeout(60000)
    });
    
    const data = await response.json();
    
    if (data.success) {
      const classification = data.classification;
      console.log(`  ✅ Классифицировано: ${classification.category} - ${classification.subtype}`);
      
      // Получаем обработанное изображение (с удаленным фоном)
      let processedImageBase64 = data.processed_image_base64;
      
      // Удаляем префикс data:image/png;base64, если есть
      if (processedImageBase64 && processedImageBase64.startsWith('data:image')) {
        processedImageBase64 = processedImageBase64.split(',')[1];
      }
      
      if (processedImageBase64) {
        console.log(`  🖼️  Фон удален, изображение готово`);
      } else {
        console.log(`  ⚠️  Используем оригинальное изображение`);
        processedImageBase64 = imageBase64;
      }
      
      return {
        classification,
        processedImageBase64
      };
    } else {
      console.error(`  ❌ Ошибка классификации: ${data.error}`);
      return null;
    }
  } catch (error) {
    console.error(`  ❌ Ошибка обработки: ${error.message}`);
    return null;
  }
}

/**
 * Импортирует один файл
 */
async function importFile(filePath, gender, category) {
  try {
    // Относительный путь от server/uploads/stock
    const relativePath = path.relative(CONFIG.stockDir, filePath).replace(/\\/g, '/');
    
    // Проверяем существует ли уже в БД
    const existing = await prisma.stockItem.findFirst({
      where: { imagePath: relativePath }
    });
    
    if (existing) {
      console.log(`  ⏭️  Пропускаем (уже существует): ${relativePath}`);
      return { skipped: true };
    }
    
    // Парсим название файла
    const fileInfo = parseFileName(path.basename(filePath));
    
    // Классифицируем и обрабатываем изображение (удаление фона)
    const result = await classifyAndProcessImage(filePath);
    
    if (!result) {
      console.log(`  ⚠️  Пропускаем (ошибка обработки): ${relativePath}`);
      return { error: true };
    }
    
    const { classification, processedImageBase64 } = result;
    
    // Сохраняем обработанное изображение как PNG (с тем же именем)
    const processedFileName = path.parse(filePath).name + '.png';
    const processedDir = path.dirname(filePath);
    const processedPath = path.join(processedDir, processedFileName);
    
    // Конвертируем base64 в buffer и сохраняем
    const imageBuffer = Buffer.from(processedImageBase64, 'base64');
    fs.writeFileSync(processedPath, imageBuffer);
    
    // Относительный путь для обработанного изображения
    const processedRelativePath = path.relative(CONFIG.stockDir, processedPath).replace(/\\/g, '/');
    
    console.log(`  💾 Сохранено: ${processedRelativePath}`);
    
    // Удаляем исходный файл после успешной обработки
    try {
      fs.unlinkSync(filePath);
      console.log(`  🗑️  Удален исходный файл: ${path.basename(filePath)}`);
    } catch (deleteError) {
      console.log(`  ⚠️  Не удалось удалить исходный файл: ${deleteError.message}`);
    }
    
    // Создаем запись в БД с путем к обработанному изображению
    const stockItem = await prisma.stockItem.create({
      data: {
        imagePath: processedRelativePath, // Используем обработанное изображение
        gender: gender,
        category: classification.category || category,
        subtype: classification.subtype || fileInfo.subtype,
        color: classification.color || fileInfo.color,
        style: classification.style,
        material: classification.material,
        pattern: classification.pattern,
        fit: classification.fit,
        season: classification.season,
        description: classification.description,
        productName: fileInfo.productName,
        // embedding будет добавлен через raw SQL если есть
        isActive: true,
        priority: 0
      }
    });
    
    // Если есть embedding, добавляем через raw SQL
    if (classification.embedding && Array.isArray(classification.embedding)) {
      const vectorString = `[${classification.embedding.join(',')}]`;
      await prisma.$executeRaw`
        UPDATE stock_items 
        SET embedding = ${vectorString}::vector 
        WHERE id = ${stockItem.id}
      `;
      console.log(`  🔢 Embedding добавлен (${classification.embedding.length} измерений)`);
    }
    
    console.log(`  ✅ Импортировано: ${processedRelativePath}`);
    return { success: true, item: stockItem };
    
  } catch (error) {
    console.error(`  ❌ Ошибка импорта: ${error.message}`);
    return { error: true };
  }
}

/**
 * Импортирует все файлы из папки
 */
async function importDirectory(dirPath, gender, category) {
  console.log(`\n📁 Обработка папки: ${path.relative(CONFIG.stockDir, dirPath)}`);
  
  const files = fs.readdirSync(dirPath);
  const stats = { success: 0, skipped: 0, errors: 0 };
  
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const fileStat = fs.statSync(filePath);
    
    if (fileStat.isDirectory()) {
      // Рекурсивно обрабатываем подпапки
      const subStats = await importDirectory(filePath, gender, category);
      stats.success += subStats.success;
      stats.skipped += subStats.skipped;
      stats.errors += subStats.errors;
    } else {
      // Проверяем расширение файла
      const ext = path.extname(file).toLowerCase();
      if (CONFIG.supportedExtensions.includes(ext)) {
        const result = await importFile(filePath, gender, category);
        if (result.success) stats.success++;
        else if (result.skipped) stats.skipped++;
        else if (result.error) stats.errors++;
      }
    }
  }
  
  return stats;
}

/**
 * Главная функция
 */
async function main() {
  console.log('🚀 ИМПОРТ ТОВАРОВ ИЗ СТОКА\n');
  
  // Парсим аргументы командной строки
  const args = process.argv.slice(2);
  const options = {};
  
  args.forEach(arg => {
    const [key, value] = arg.replace('--', '').split('=');
    options[key] = value || true;
  });
  
  console.log('⚙️  Параметры:', options);
  
  // Определяем что импортировать
  const genders = options.all ? ['man', 'woman'] : 
                  options.gender ? [options.gender] : 
                  ['man', 'woman'];
  
  const categories = options.all ? CONFIG.categories :
                     options.category ? [options.category] :
                     CONFIG.categories;
  
  console.log(`📊 Будет обработано: ${genders.join(', ')} / ${categories.join(', ')}\n`);
  
  // Проверяем существование папки stock
  if (!fs.existsSync(CONFIG.stockDir)) {
    console.error(`❌ Папка не найдена: ${CONFIG.stockDir}`);
    console.log(`\n💡 Создайте структуру папок:`);
    console.log(`   server/uploads/stock/man/FOOTWEAR/`);
    console.log(`   server/uploads/stock/woman/FOOTWEAR/`);
    process.exit(1);
  }
  
  // Импортируем
  const totalStats = { success: 0, skipped: 0, errors: 0 };
  
  for (const gender of genders) {
    const genderDir = path.join(CONFIG.stockDir, gender);
    
    if (!fs.existsSync(genderDir)) {
      console.log(`⚠️  Пропускаем ${gender} (папка не найдена)`);
      continue;
    }
    
    console.log(`\n👤 Обработка: ${gender.toUpperCase()}`);
    console.log('─'.repeat(50));
    
    for (const category of categories) {
      const categoryDir = path.join(genderDir, category);
      
      if (!fs.existsSync(categoryDir)) {
        console.log(`  ⏭️  Пропускаем ${category} (папка не найдена)`);
        continue;
      }
      
      const stats = await importDirectory(categoryDir, gender, category);
      totalStats.success += stats.success;
      totalStats.skipped += stats.skipped;
      totalStats.errors += stats.errors;
    }
  }
  
  // Итоговая статистика
  console.log('\n' + '='.repeat(50));
  console.log('📊 ИТОГОВАЯ СТАТИСТИКА:');
  console.log('='.repeat(50));
  console.log(`✅ Импортировано: ${totalStats.success}`);
  console.log(`⏭️  Пропущено:    ${totalStats.skipped}`);
  console.log(`❌ Ошибок:        ${totalStats.errors}`);
  console.log(`📦 Всего:         ${totalStats.success + totalStats.skipped + totalStats.errors}`);
  
  // Показываем общее количество в БД
  const totalInDb = await prisma.stockItem.count();
  console.log(`\n💾 Всего в БД:    ${totalInDb} товаров`);
  
  console.log('\n✅ Импорт завершен!');
}

// Запуск
main()
  .catch(error => {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
