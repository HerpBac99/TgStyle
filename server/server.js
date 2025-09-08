const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Импорт API роутов
const authRoutes = require('./src/api/auth');
const analyzeRoutes = require('./src/api/analyze');
const apiRoutes = require('./routes/api');

// Импорт логгера Winston
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
app.use('/api/auth', authRoutes);
app.use('/api/analyze', analyzeRoutes);
app.use('/api', apiRoutes);

// Роут для главной страницы
app.get('/', (req, res) => {
  logger.debug('Главная страница запрошена', { ip: req.ip, userAgent: req.get('User-Agent') });
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

// Базовый роут для проверки работы сервера
app.get('/api/health', (req, res) => {
  logger.info('Health check запрос');
  res.json({
    success: true,
    message: 'Сервер работает',
    timestamp: new Date().toISOString(),
    domain: process.env.DOMAIN || 'localhost',
    port: process.env.PORT || 443
  });
});

// Централизованная обработка ошибок
app.use((error, req, res, next) => {
    // Игнорируем обычные клиентские ошибки
    if (error.message === 'request aborted' ||
        error.code === 'ECONNABORTED' ||
        error.code === 'ECONNRESET') {
      return; // Не логируем эти ошибки
    }

    logger.error('Ошибка сервера', {
      message: error.message,
      stack: error.stack,
      url: req.url,
      method: req.method
    });

  // Определяем тип ошибки и соответствующий статус код
  let statusCode = 500;
  let errorCode = 'INTERNAL_ERROR';
  let userMessage = 'Внутренняя ошибка сервера';

  // Обработка специфических типов ошибок
  if (error.name === 'ValidationError') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    userMessage = 'Ошибка валидации данных';
  } else if (error.name === 'UnauthorizedError' || error.message.includes('Unauthorized')) {
    statusCode = 401;
    errorCode = 'UNAUTHORIZED';
    userMessage = 'Ошибка аутентификации';
  }

  res.status(statusCode).json({
    success: false,
    error: error.name || 'Error',
    message: userMessage,
    code: errorCode,
    timestamp: new Date().toISOString()
  });
});


// Функция для создания HTTPS сервера
function createHttpsServer() {
  try {
    // Пути к SSL сертификатам
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

    return https.createServer(httpsOptions, app);
  } catch (error) {
    logger.error('Ошибка создания HTTPS сервера', {
      message: error.message,
      stack: error.stack
    });
    logger.warn('Для работы Telegram Mini App требуется HTTPS соединение');
    logger.warn('Убедитесь что SSL сертификаты настроены правильно');
    process.exit(1);
  }
}

// Запуск сервера
async function startServer() {
  const port = process.env.PORT || 443;
  const domain = process.env.DOMAIN || 'localhost';

  // Проверяем обязательные переменные окружения
  if (!process.env.DOMAIN) {
    logger.error('DOMAIN не настроен в переменных окружения');
    process.exit(1);
  }

  logger.info('Запуск TgStyle сервера', { port, domain });

  // Создаем HTTPS сервер
  const server = createHttpsServer();

  server.listen(port, () => {
    const serverInfo = {
      port,
      domain,
      nodeEnv: 'production'
    };

    logger.info('HTTPS сервер успешно запущен', serverInfo);
    logger.info(`Telegram Mini App доступен по адресу: https://${domain}`);
  });

  // Обработка сигналов завершения
  process.on('SIGTERM', () => {
    logger.warn('Получен сигнал SIGTERM, завершение работы сервера...');
    server.close(() => {
      logger.info('Сервер остановлен');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    logger.warn('Получен сигнал SIGINT (Ctrl+C), завершение работы сервера...');
    server.close(() => {
      logger.info('Сервер остановлен');
      process.exit(0);
    });
  });
}

// Запускаем сервер только если файл запущен напрямую
if (require.main === module) {
  startServer();
}

module.exports = app; 