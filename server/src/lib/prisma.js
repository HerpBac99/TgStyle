const { PrismaClient } = require('../../../db/node_modules/@prisma/client');

// Инициализация Prisma клиента
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});

// Обработчик graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

// Экспорт клиента
module.exports = prisma;
