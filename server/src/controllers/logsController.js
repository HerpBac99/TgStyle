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

// Настройка формата логов
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    // Добавляем метаданные если они есть
    if (Object.keys(meta).length > 0) {
      logMessage += ` | ${JSON.stringify(meta)}`;
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
  winston.format.printf(({ timestamp, level, message }) => {
    return `[${timestamp}] [SERVER] [${level}] ${message}`;
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

// В режиме разработки добавляем более подробный вывод
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple(),
      winston.format.printf(({ level, message }) => {
        return `[${level}] ${message}`;
      })
    ),
    level: 'debug'
  }));
}

// Функции для удобного использования
const logMethods = {
  error: (message, meta = {}) => logger.error(message, meta),
  warn: (message, meta = {}) => logger.warn(message, meta),
  info: (message, meta = {}) => logger.info(message, meta),
  debug: (message, meta = {}) => logger.debug(message, meta),


  // Метод для логирования ошибок API
  logApiError: (error, req, res, next) => {
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

    // Продолжаем обработку ошибки
    next(error);
  },

  // Метод для логирования успешных операций
  logSuccess: (operation, details = {}) => {
    logger.info(`✓ ${operation}`, {
      ...details,
      timestamp: new Date().toISOString()
    });
  },

  // Метод для логирования предупреждений
  logWarning: (message, details = {}) => {
    logger.warn(`⚠ ${message}`, {
      ...details,
      timestamp: new Date().toISOString()
    });
  },

  // Получение статистики логгера
  getStats: () => {
    return {
      level: logger.level,
      transports: logger.transports.map(t => ({
        type: t.constructor.name,
        level: t.level,
        filename: t.filename
      })),
      levels: logLevels
    };
  }
};

// Экспорт логгера и методов
module.exports = {
  logger,
  logSuccess: logMethods.info,
  logWarning: logMethods.warn,
  logApiError: logMethods.error
};
