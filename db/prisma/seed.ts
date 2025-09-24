import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Начинаю заполнение базы данных тестовыми данными...');

  // Создаем тестового пользователя
  const user = await prisma.user.upsert({
    where: { telegramId: BigInt(123456789) },
    update: {},
    create: {
      telegramId: BigInt(123456789),
      firstName: 'Тестовый',
      lastName: 'Пользователь',
      username: 'test_user',
      analysesCount: 3,
      subscriptionType: 'free',
      totalAnalyses: 0,
    },
  });

  console.log('✅ Создан тестовый пользователь:', user.id);

  // Создаем тестовый элемент истории
  const historyItem = await prisma.historyItem.create({
    data: {
      userId: user.id,
      photoData: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...', // фейковый base64
      analysisText: 'Стиль casual, синяя футболка, джинсы',
      technicalAnalysis: 'Тип одежды: футболка, Цвет: синий, Материал: хлопок, Стиль: casual',
      isPublic: true,
    },
  });

  console.log('✅ Создан элемент истории:', historyItem.id);

  // Создаем комментарий
  const comment = await prisma.comment.create({
    data: {
      userId: user.id,
      historyItemId: historyItem.id,
      content: 'Отличный стиль! 👍',
    },
  });

  console.log('✅ Создан комментарий:', comment.id);

  // Создаем оценку
  const rating = await prisma.rating.create({
    data: {
      userId: user.id,
      historyItemId: historyItem.id,
      ratingType: 'like',
    },
  });

  console.log('✅ Создана оценка:', rating.id);

  console.log('🎉 База данных успешно заполнена тестовыми данными!');
}

main()
  .catch((e) => {
    console.error('❌ Ошибка при заполнении БД:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
