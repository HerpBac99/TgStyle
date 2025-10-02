const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function clearHistory() {
  console.log('🗑️  Начинаю очистку таблицы HistoryItem...');

  try {
    // Сначала удаляем связанные записи (comments и ratings) из-за foreign key constraints
    console.log('Удаляю связанные комментарии...');
    const deletedComments = await prisma.comment.deleteMany({
      where: {}
    });
    console.log(`✅ Удалено комментариев: ${deletedComments.count}`);

    console.log('Удаляю связанные оценки...');
    const deletedRatings = await prisma.rating.deleteMany({
      where: {}
    });
    console.log(`✅ Удалено оценок: ${deletedRatings.count}`);

    // Теперь удаляем сами элементы истории
    console.log('Удаляю элементы истории...');
    const deletedHistory = await prisma.historyItem.deleteMany({
      where: {}
    });
    console.log(`✅ Удалено элементов истории: ${deletedHistory.count}`);

    console.log('🎉 Таблица HistoryItem успешно очищена!');
    console.log('📊 Итого удалено:');
    console.log(`   - Элементов истории: ${deletedHistory.count}`);
    console.log(`   - Комментариев: ${deletedComments.count}`);
    console.log(`   - Оценок: ${deletedRatings.count}`);

  } catch (error) {
    console.error('❌ Ошибка при очистке базы данных:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Запуск скрипта
if (require.main === module) {
  clearHistory();
}

module.exports = { clearHistory };
