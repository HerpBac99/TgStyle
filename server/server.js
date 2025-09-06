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

// Создание Express приложения
const app = express();

// Глобальная переменная для FastVLM сервера
let fastvlmProcess = null;

// Middleware для парсинга JSON
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Middleware для статических файлов клиента
app.use(express.static(path.join(__dirname, '..', 'client')));

// API роуты
app.use('/api/auth', authRoutes);
app.use('/api/analyze', analyzeRoutes);
app.use('/api', apiRoutes);

// Роут для главной страницы
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
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

// Централизованная обработка ошибок
app.use((error, req, res, next) => {
  console.error('Error:', error.message);

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

// Функции для управления FastVLM сервером
function startFastVLMServer() {
    return new Promise((resolve, reject) => {
        try {
            const { spawn } = require('child_process');
            const fastvlmPath = path.join(__dirname, 'src/utils/fastvlm_server.py');
            const pythonPath = path.join(__dirname, '../fastvlm_env/Scripts/python.exe');

            console.log('🚀 Запускаем FastVLM сервер...');

            fastvlmProcess = spawn(pythonPath, [fastvlmPath], {
                cwd: path.join(__dirname, '../'),
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let startupTimeout = setTimeout(() => {
                console.log('⏰ FastVLM сервер не запустился за 30 секунд, продолжаем без него');
                resolve(false);
            }, 30000);

            // Ожидаем готовности сервера
            fastvlmProcess.stdout.on('data', (data) => {
                const output = data.toString();
                console.log('FastVLM stdout:', output);

                if (output.includes('FastVLM модель загружена')) {
                    clearTimeout(startupTimeout);
                    console.log('✅ FastVLM сервер успешно запущен');
                    resolve(true);
                }
            });

            fastvlmProcess.stderr.on('data', (data) => {
                console.log('FastVLM stderr:', data.toString());
            });

            fastvlmProcess.on('close', (code) => {
                console.log(`FastVLM процесс завершился с кодом ${code}`);
                fastvlmProcess = null;
            });

            fastvlmProcess.on('error', (error) => {
                console.error('Ошибка запуска FastVLM:', error);
                clearTimeout(startupTimeout);
                resolve(false);
            });

        } catch (error) {
            console.error('Ошибка при запуске FastVLM сервера:', error);
            resolve(false);
        }
    });
}

function stopFastVLMServer() {
    if (fastvlmProcess) {
        console.log('🛑 Останавливаем FastVLM сервер...');
        fastvlmProcess.kill();
        fastvlmProcess = null;
    }
}

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
    console.error('Ошибка создания HTTPS сервера:', error.message);
    console.log('Для работы Telegram Mini App требуется HTTPS соединение');
    console.log('Убедитесь что SSL сертификаты настроены правильно');
    process.exit(1);
  }
}

// Запуск сервера
async function startServer() {
  const port = process.env.PORT || 443;
  const domain = process.env.DOMAIN || 'localhost';

  // Проверяем обязательные переменные окружения
  if (!process.env.DOMAIN) {
    console.error('Ошибка: DOMAIN не настроен в переменных окружения');
    process.exit(1);
  }

  // Запускаем FastVLM сервер
  console.log('🤖 Инициализация FastVLM сервера...');
  const fastvlmStarted = await startFastVLMServer();
  if (fastvlmStarted) {
    console.log('✅ FastVLM сервер готов');
  } else {
    console.log('⚠️ FastVLM сервер не запущен, анализ будет работать в режиме симуляции');
  }

  // Создаем HTTPS сервер
  const server = createHttpsServer();

  server.listen(port, () => {
    const serverInfo = {
      port,
      domain,
      nodeEnv: 'production'
    };

    console.log(`HTTPS сервер запущен на порту ${port}`);
    console.log(`Telegram Mini App доступен по адресу: https://${domain}`);
  });

  // Обработка сигналов завершения
  process.on('SIGTERM', () => {
    console.log('Получен сигнал SIGTERM, завершение работы сервера...');
    stopFastVLMServer();
    server.close(() => {
      console.log('Сервер остановлен');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('Получен сигнал SIGINT, завершение работы сервера...');
    stopFastVLMServer();
    server.close(() => {
      console.log('Сервер остановлен');
      process.exit(0);
    });
  });
}

// Запускаем сервер только если файл запущен напрямую
if (require.main === module) {
  startServer();
}

module.exports = app; 