const winston = require('winston');
const path = require('path');

// Настройка уровней логирования
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Настройка цветов для уровней
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue'
};

// Добавляем цвета в winston
winston.addColors(logColors);

// Создаем директорию для логов если ее нет
const logsDir = path.join(__dirname, '../../../logs/server');
require('fs').mkdirSync(logsDir, { recursive: true });

// Функция для безопасной сериализации объектов с BigInt
const safeStringify = (obj) => {
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return value;
  });
};

// Настройка формата логов
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    // Добавляем метаданные если они есть
    if (Object.keys(meta).length > 0) {
      logMessage += ` | ${safeStringify(meta)}`;
    }

    // Добавляем стек ошибки если есть
    if (stack) {
      logMessage += `\n${stack}`;
    }

    return logMessage;
  })
);

// Настройка формата для консоли
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let logMessage = `[${timestamp}] [${level}] ${message}`;

    // Добавляем метаданные если они есть
    if (Object.keys(meta).length > 0) {
      logMessage += ` | ${safeStringify(meta)}`;
    }

    return logMessage;
  })
);

// Создание логгера
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels: logLevels,
  format: logFormat,
  transports: [
    // Лог в консоль
    new winston.transports.Console({
      format: consoleFormat,
      level: process.env.CONSOLE_LOG_LEVEL || 'debug'
    }),

    // Лог в файл (все уровни)
    new winston.transports.File({
      filename: path.join(logsDir, 'server.log'),
      level: 'debug',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),

    // Отдельный файл для ошибок
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),

  ],

  // Обработка необработанных исключений
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 3
    })
  ],

  // Обработка необработанных отклонений промисов
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 3
    })
  ]
});

/**
 * Логирование ошибок API
 */
const logApiError = (error, req, res, next) => {
  const { method, url, ip } = req;
  const errorInfo = {
    message: error.message,
    stack: error.stack,
    method,
    url,
    ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  };

  logger.error(`API Error: ${method} ${url}`, errorInfo);
  next(error);
};

/**
 * Логирование успешных операций
 */
const logSuccess = (operation, details = {}) => {
  logger.info(`✓ ${operation}`, {
    ...details,
    timestamp: new Date().toISOString()
  });
};

// Экспорт логгера и основных методов
module.exports = {
  logger,
  logApiError,
  logSuccess
};
