/**
 * Скрипт для оптимизации уже загруженных товаров из стока
 * Обрабатывает все PNG файлы в server/uploads/stock/man и server/uploads/stock/woman
 * Оптимизирует до 800x800 с сохранением пропорций
 * 
 * Использование:
 * node server/scripts/optimize-existing-stock.js
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Конфигурация
const CONFIG = {
  stockDir: path.join(__dirname, '..', 'uploads', 'stock'),
  maxSize: 800,
  backupDir: path.join(__dirname, '..', 'uploads', 'stock_backup'),
  supportedExtensions: ['.png', '.jpg', '.jpeg', '.webp']
};

/**
 * Оптимизирует изображение до 800x800 с сохранением пропорций
 * Аналогично FileService.saveWardrobeImage
 */
async function optimizeImage(imageBuffer) {
  try {
    // Получаем метаданные изображения
    const metadata = await sharp(imageBuffer).metadata();
    const hasAlpha = metadata.hasAlpha || metadata.channels === 4;
    const { width: origWidth, height: origHeight } = metadata;

    // Масштабируем большую сторону до 800
    const maxDimension = Math.max(origWidth, origHeight);
    const scale = CONFIG.maxSize / maxDimension;
    const scaledWidth = Math.round(origWidth * scale);
    const scaledHeight = Math.round(origHeight * scale);

    // Вычисляем padding для центрирования
    const paddingLeft = Math.floor((CONFIG.maxSize - scaledWidth) / 2);
    const paddingTop = Math.floor((CONFIG.maxSize - scaledHeight) / 2);
    const paddingRight = CONFIG.maxSize - scaledWidth - paddingLeft;
    const paddingBottom = CONFIG.maxSize - scaledHeight - paddingTop;

    let optimizedBuffer;

    if (hasAlpha) {
      // Для изображений с прозрачностью используем PNG
      optimizedBuffer = await sharp(imageBuffer)
        .rotate() // Применяет EXIF orientation автоматически
        .resize(scaledWidth, scaledHeight, {
          fit: 'fill'
        })
        .extend({
          top: paddingTop,
          bottom: paddingBottom,
          left: paddingLeft,
          right: paddingRight,
          background: { r: 0, g: 0, b: 0, alpha: 0 } // Прозрачный фон
        })
        .png({
          quality: 90,
          compressionLevel: 9
        })
        .toBuffer();
    } else {
      // Для обычных изображений используем PNG с белым фоном
      optimizedBuffer = await sharp(imageBuffer)
        .rotate()
        .resize(scaledWidth, scaledHeight, {
          fit: 'fill'
        })
        .extend({
          top: paddingTop,
          bottom: paddingBottom,
          left: paddingLeft,
          right: paddingRight,
          background: { r: 255, g: 255, b: 255, alpha: 1 } // Белый фон
        })
        .png({
          quality: 90,
          compressionLevel: 9
        })
        .toBuffer();
    }

    return {
      buffer: optimizedBuffer,
      originalSize: imageBuffer.length,
      optimizedSize: optimizedBuffer.length,
      originalDimensions: `${origWidth}x${origHeight}`,
      optimizedDimensions: `${CONFIG.maxSize}x${CONFIG.maxSize}`,
      compressionRatio: ((1 - optimizedBuffer.length / imageBuffer.length) * 100).toFixed(1)
    };

  } catch (error) {
    throw new Error(`Ошибка оптимизации: ${error.message}`);
  }
}

/**
 * Обрабатывает один файл
 */
async function processFile(filePath) {
  try {
    const fileName = path.basename(filePath);
    const relativePath = path.relative(CONFIG.stockDir, filePath);
    
    console.log(`\n📸 Обработка: ${relativePath}`);
    
    // Читаем файл
    const originalBuffer = fs.readFileSync(filePath);
    const originalSizeKB = (originalBuffer.length / 1024).toFixed(2);
    
    console.log(`   Исходный размер: ${originalSizeKB} KB`);
    
    // Проверяем размер изображения
    const metadata = await sharp(originalBuffer).metadata();
    console.log(`   Исходное разрешение: ${metadata.width}x${metadata.height}`);
    
    // Если изображение уже 800x800, пропускаем
    if (metadata.width === CONFIG.maxSize && metadata.height === CONFIG.maxSize) {
      console.log(`   ⏭️  Пропускаем (уже оптимизировано)`);
      return { skipped: true };
    }
    
    // Создаем резервную копию
    const backupPath = path.join(CONFIG.backupDir, relativePath);
    const backupDir = path.dirname(backupPath);
    fs.mkdirSync(backupDir, { recursive: true });
    fs.copyFileSync(filePath, backupPath);
    console.log(`   💾 Резервная копия: ${path.relative(CONFIG.stockDir, backupPath)}`);
    
    // Оптимизируем
    console.log(`   🔄 Оптимизация до ${CONFIG.maxSize}x${CONFIG.maxSize}...`);
    const result = await optimizeImage(originalBuffer);
    
    // Сохраняем оптимизированное изображение
    fs.writeFileSync(filePath, result.buffer);
    
    const optimizedSizeKB = (result.optimizedSize / 1024).toFixed(2);
    console.log(`   ✅ Готово!`);
    console.log(`   📊 Новый размер: ${optimizedSizeKB} KB (сжатие ${result.compressionRatio}%)`);
    console.log(`   📐 Новое разрешение: ${result.optimizedDimensions}`);
    
    return { 
      success: true, 
      originalSize: originalBuffer.length,
      optimizedSize: result.optimizedSize,
      compressionRatio: result.compressionRatio
    };
    
  } catch (error) {
    console.error(`   ❌ Ошибка: ${error.message}`);
    return { error: true };
  }
}

/**
 * Обрабатывает все файлы в директории рекурсивно
 */
async function processDirectory(dirPath) {
  const files = fs.readdirSync(dirPath);
  const stats = { 
    success: 0, 
    skipped: 0, 
    errors: 0,
    totalOriginalSize: 0,
    totalOptimizedSize: 0
  };
  
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const fileStat = fs.statSync(filePath);
    
    if (fileStat.isDirectory()) {
      // Рекурсивно обрабатываем подпапки
      const subStats = await processDirectory(filePath);
      stats.success += subStats.success;
      stats.skipped += subStats.skipped;
      stats.errors += subStats.errors;
      stats.totalOriginalSize += subStats.totalOriginalSize;
      stats.totalOptimizedSize += subStats.totalOptimizedSize;
    } else {
      // Проверяем расширение файла
      const ext = path.extname(file).toLowerCase();
      if (CONFIG.supportedExtensions.includes(ext)) {
        const result = await processFile(filePath);
        if (result.success) {
          stats.success++;
          stats.totalOriginalSize += result.originalSize;
          stats.totalOptimizedSize += result.optimizedSize;
        } else if (result.skipped) {
          stats.skipped++;
        } else if (result.error) {
          stats.errors++;
        }
      }
    }
  }
  
  return stats;
}

/**
 * Главная функция
 */
async function main() {
  console.log('🚀 ОПТИМИЗАЦИЯ СУЩЕСТВУЮЩИХ ТОВАРОВ ИЗ СТОКА\n');
  console.log(`📁 Директория: ${CONFIG.stockDir}`);
  console.log(`📐 Целевой размер: ${CONFIG.maxSize}x${CONFIG.maxSize}`);
  console.log(`💾 Резервные копии: ${CONFIG.backupDir}\n`);
  
  // Проверяем существование папки stock
  if (!fs.existsSync(CONFIG.stockDir)) {
    console.error(`❌ Папка не найдена: ${CONFIG.stockDir}`);
    process.exit(1);
  }
  
  // Создаем папку для резервных копий
  fs.mkdirSync(CONFIG.backupDir, { recursive: true });
  
  // Обрабатываем мужские товары
  console.log('\n' + '='.repeat(70));
  console.log('👨 ОБРАБОТКА МУЖСКИХ ТОВАРОВ');
  console.log('='.repeat(70));
  
  const manDir = path.join(CONFIG.stockDir, 'man');
  const manStats = fs.existsSync(manDir) 
    ? await processDirectory(manDir)
    : { success: 0, skipped: 0, errors: 0, totalOriginalSize: 0, totalOptimizedSize: 0 };
  
  // Обрабатываем женские товары
  console.log('\n' + '='.repeat(70));
  console.log('👩 ОБРАБОТКА ЖЕНСКИХ ТОВАРОВ');
  console.log('='.repeat(70));
  
  const womanDir = path.join(CONFIG.stockDir, 'woman');
  const womanStats = fs.existsSync(womanDir)
    ? await processDirectory(womanDir)
    : { success: 0, skipped: 0, errors: 0, totalOriginalSize: 0, totalOptimizedSize: 0 };
  
  // Итоговая статистика
  const totalStats = {
    success: manStats.success + womanStats.success,
    skipped: manStats.skipped + womanStats.skipped,
    errors: manStats.errors + womanStats.errors,
    totalOriginalSize: manStats.totalOriginalSize + womanStats.totalOriginalSize,
    totalOptimizedSize: manStats.totalOptimizedSize + womanStats.totalOptimizedSize
  };
  
  console.log('\n' + '='.repeat(70));
  console.log('📊 ИТОГОВАЯ СТАТИСТИКА');
  console.log('='.repeat(70));
  console.log(`✅ Оптимизировано: ${totalStats.success}`);
  console.log(`⏭️  Пропущено:     ${totalStats.skipped} (уже оптимизированы)`);
  console.log(`❌ Ошибок:         ${totalStats.errors}`);
  console.log(`📦 Всего:          ${totalStats.success + totalStats.skipped + totalStats.errors}`);
  
  if (totalStats.success > 0) {
    const originalSizeMB = (totalStats.totalOriginalSize / 1024 / 1024).toFixed(2);
    const optimizedSizeMB = (totalStats.totalOptimizedSize / 1024 / 1024).toFixed(2);
    const savedMB = (originalSizeMB - optimizedSizeMB).toFixed(2);
    const compressionRatio = ((1 - totalStats.totalOptimizedSize / totalStats.totalOriginalSize) * 100).toFixed(1);
    
    console.log(`\n💾 Размер до:      ${originalSizeMB} MB`);
    console.log(`💾 Размер после:   ${optimizedSizeMB} MB`);
    console.log(`📉 Сэкономлено:    ${savedMB} MB (${compressionRatio}%)`);
  }
  
  console.log(`\n💾 Резервные копии сохранены в: ${CONFIG.backupDir}`);
  console.log('\n✅ Оптимизация завершена!');
  console.log('\n💡 Если что-то пошло не так, восстановите файлы из резервной копии.');
}

// Запуск
main()
  .catch(error => {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
  });
