/**
 * Очистка таблицы stock_items
 */

const { PrismaClient } = require('../../db/node_modules/@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  console.log('🗑️  ОЧИСТКА ТОВАРОВ ИЗ СТОКА\n');
  
  try {
    // Удаляем все записи
    const result = await prisma.stockItem.deleteMany({});
    console.log(`✅ Удалено записей из БД: ${result.count}`);
    
    // Удаляем обработанные файлы (*_processed.png)
    const stockDir = path.join(__dirname, '..', 'uploads', 'stock');
    let filesDeleted = 0;
    
    function deleteProcessedFiles(dir) {
      if (!fs.existsSync(dir)) return;
      
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          deleteProcessedFiles(fullPath);
        } else if (item.includes('_processed.')) {
          fs.unlinkSync(fullPath);
          filesDeleted++;
          console.log(`  🗑️  ${path.relative(stockDir, fullPath)}`);
        }
      }
    }
    
    deleteProcessedFiles(stockDir);
    console.log(`\n✅ Удалено обработанных файлов: ${filesDeleted}`);
    
    console.log('\n✅ Очистка завершена!');
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
