/**
 * TgStyle Server - Основной сервер для Telegram Mini App
 * Предоставляет API для анализа изображений одежды с помощью FastVLM
 */

const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

// Загрузка переменных окружения
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Инициализация Prisma клиента
const prisma = require('./src/lib/prisma');

// Импорт API маршрутов
const authRoutes = require('./src/api/auth');
const analyzeRoutes = require('./src/api/analyze');
const historyRoutes = require('./src/api/history');
const subscriptionRoutes = require('./src/api/subscription');
const apiRoutes = require('./routes/api');

// Импорт логгера
const { logger, logApiError, logSuccess } = require('./src/controllers/logsController');

// Создание Express приложения
const app = express();

// Middleware для парсинга JSON
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Middleware для статических файлов клиента (собранные в dist/)
app.use(express.static(path.join(__dirname, '..', 'dist')));

// API роуты
logger.info('Loading API routes...');
app.use('/api/auth', authRoutes);
app.use('/api/analyze', analyzeRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api', apiRoutes);

// Роут для главной страницы
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

// Базовый роут для проверки работы сервера
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Сервер работает',
    timestamp: new Date().toISOString(),
    domain: process.env.DOMAIN || 'localhost',
    port: process.env.PORT || 443
  });
});

/**
 * Централизованная обработка ошибок
 * Перехватывает все необработанные ошибки и возвращает структурированный ответ
 */
app.use((error, req, res, next) => {
  // Игнорируем обычные клиентские ошибки (не логируем)
  if (error.message === 'request aborted' ||
      error.code === 'ECONNABORTED' ||
      error.code === 'ECONNRESET') {
    return;
  }

  // Логируем ошибку
  logger.error('Необработанная ошибка сервера', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Определяем тип ошибки и соответствующий HTTP статус
  const errorMapping = {
    'ValidationError': { status: 400, code: 'VALIDATION_ERROR', message: 'Ошибка валидации данных' },
    'UnauthorizedError': { status: 401, code: 'UNAUTHORIZED', message: 'Ошибка аутентификации' },
    'ForbiddenError': { status: 403, code: 'FORBIDDEN', message: 'Доступ запрещен' },
    'NotFoundError': { status: 404, code: 'NOT_FOUND', message: 'Ресурс не найден' },
    'ConflictError': { status: 409, code: 'CONFLICT', message: 'Конфликт данных' }
  };

  // Определяем тип ошибки
  let statusCode = 500;
  let errorCode = 'INTERNAL_ERROR';
  let userMessage = 'Внутренняя ошибка сервера';

  // Проверяем известные типы ошибок
  if (error.name && errorMapping[error.name]) {
    const mapping = errorMapping[error.name];
    statusCode = mapping.status;
    errorCode = mapping.code;
    userMessage = mapping.message;
  } else if (error.message && error.message.includes('Unauthorized')) {
    statusCode = 401;
    errorCode = 'UNAUTHORIZED';
    userMessage = 'Ошибка аутентификации';
  }

  // Возвращаем структурированный ответ
  res.status(statusCode).json({
    success: false,
    error: error.name || 'Error',
    message: userMessage,
    code: errorCode,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && {
      stack: error.stack,
      details: error.message
    })
  });
});


/**
 * Создает HTTPS сервер с SSL сертификатами
 * @returns {https.Server} Настроенный HTTPS сервер
 * @throws {Error} Если сертификаты не найдены
 */
function createHttpsServer() {
  try {
    // Пути к SSL сертификатам (из переменных окружения или по умолчанию)
    const keyPath = process.env.HTTPS_KEY_PATH || path.join(__dirname, '..', 'ssl', 'keys', 'server.key');
    const certPath = process.env.HTTPS_CERT_PATH || path.join(__dirname, '..', 'ssl', 'certs', 'server.crt');

    // Проверяем существование файлов сертификатов
    if (!fs.existsSync(keyPath)) {
      throw new Error(`SSL ключ не найден: ${keyPath}`);
    }

    if (!fs.existsSync(certPath)) {
      throw new Error(`SSL сертификат не найден: ${certPath}`);
    }

    // Читаем SSL сертификаты
    const httpsOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    };

    logger.info('SSL сертификаты успешно загружены', {
      keyPath,
      certPath
    });

    return https.createServer(httpsOptions, app);
  } catch (error) {
    logger.error('Ошибка создания HTTPS сервера', {
      message: error.message,
      stack: error.stack
    });

    logger.error('Для работы Telegram Mini App требуется HTTPS соединение');
    logger.error('Убедитесь что SSL сертификаты настроены правильно');
    logger.error('Пути к сертификатам:');
    logger.error(`  - Ключ: ${process.env.HTTPS_KEY_PATH || 'ssl/keys/server.key'}`);
    logger.error(`  - Сертификат: ${process.env.HTTPS_CERT_PATH || 'ssl/certs/server.crt'}`);

    process.exit(1);
  }
}

/**
 * Запускает HTTPS сервер TgStyle
 * Проверяет конфигурацию и gracefully завершает работу при получении сигналов
 */
async function startServer() {
  const port = process.env.PORT || 443;
  const domain = process.env.DOMAIN || 'localhost';

  // Проверяем обязательные переменные окружения
  if (!process.env.DOMAIN) {
    logger.error('DOMAIN не настроен в переменных окружения');
    logger.error('Установите переменную окружения DOMAIN (например: your-domain.com)');
    process.exit(1);
  }

  logger.info('Запуск TgStyle сервера', {
    port,
    domain,
    nodeEnv: process.env.NODE_ENV || 'production'
  });

  try {
    // Проверяем подключение к базе данных
    logger.info('Проверка подключения к PostgreSQL...');
    await prisma.$connect();
    logger.info('Подключение к PostgreSQL успешно');

    // Создаем HTTPS сервер
    const server = createHttpsServer();

    // Запускаем сервер
    server.listen(port, () => {
      const serverInfo = {
        port,
        domain,
        nodeEnv: process.env.NODE_ENV || 'production',
        timestamp: new Date().toISOString()
      };

      logger.info(`Telegram Mini App доступен по адресу: https://${domain}`);
      logger.info(`API доступно по адресу: https://${domain}/api`);

      // Логируем информацию о маршрутах
      logger.debug('Доступные маршруты:', {
        auth: '/api/auth',
        analyze: '/api/analyze',
        history: '/api/history',
        subscription: '/api/subscription',
        logClient: '/api/log-client',
        ping: '/api/ping',
        health: '/api/health',
        sharedAnalysis: '/api/shared-analysis'
      });
    });

    // Обработка сигналов graceful завершения
    const gracefulShutdown = async (signal) => {
      logger.warn(`Получен сигнал ${signal}, завершение работы сервера...`);

      // Отключаемся от базы данных
      try {
        await prisma.$disconnect();
        logger.info('Отключение от PostgreSQL успешно');
      } catch (error) {
        logger.error('Ошибка отключения от PostgreSQL', { error: error.message });
      }

      server.close((err) => {
        if (err) {
          logger.error('Ошибка при закрытии сервера', { error: err.message });
          process.exit(1);
        }

        logger.info('Сервер успешно остановлен');
        logSuccess('Сервер завершен', { signal, uptime: process.uptime() });
        process.exit(0);
      });

      // Принудительное завершение через 10 секунд
      setTimeout(() => {
        logger.error('Принудительное завершение сервера');
        process.exit(1);
      }, 10000);
    };

    // Регистрируем обработчики сигналов
    process.on('SIGTERM', async () => await gracefulShutdown('SIGTERM'));
    process.on('SIGINT', async () => await gracefulShutdown('SIGINT'));

    // Обработка необработанных исключений
    process.on('uncaughtException', async (error) => {
      logger.error('Необработанное исключение', {
        message: error.message,
        stack: error.stack
      });
      await gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', async (reason, promise) => {
      logger.error('Необработанное отклонение промиса', {
        reason: reason,
        promise: promise
      });
      await gracefulShutdown('unhandledRejection');
    });

  } catch (error) {
    logger.error('Ошибка запуска сервера', {
      message: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Запускаем сервер только если файл запущен напрямую
if (require.main === module) {
  startServer();
}

// Экспортируем приложение и Prisma клиент для использования в тестах и других модулях
module.exports = { app, prisma }; 