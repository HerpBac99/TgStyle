/**
 * Константы приложения TgStyle
 */

import type { AppConfig } from '@/types/index.js';

// URL API сервера (для Telegram Mini App всегда production)
export const API_URL = 'https://tgstyle.flappy.crazedns.ru/api';

// Конфигурация приложения
export const APP_CONFIG: AppConfig = {
  apiUrl: API_URL,
  environment: 'production', // Telegram Mini App всегда работает в production
  version: '1.0.0',
  logLevel: 'info',
  features: {
    fastVLM: true,
    pinterest: false, // Пока отключено
    history: true,
    analytics: true,
  },
};

// Настройки localStorage
export const STORAGE_KEYS = {
  HISTORY: 'tgStyleHistory',
  USER_SETTINGS: 'tgStyleUserSettings',
  LOGS: 'tgStyleLogs',
} as const;

// Ограничения истории
export const HISTORY_CONSTRAINTS = {
  MAX_ITEMS: 4,
} as const;

// Настройки логирования
export const LOGGING_CONFIG = {
  MAX_LOGS_IN_MEMORY: 50,
  LOG_FLUSH_TIMEOUT: 5000, // 5 секунд
  SESSION_ID_LENGTH: 16,
} as const;

// Таймауты для различных операций
export const TIMEOUTS = {
  AUTH_REQUEST: 10000, // 10 секунд
  ANALYSIS_REQUEST: 30000, // 30 секунд
  LOG_REQUEST: 5000, // 5 секунд
  HEALTH_CHECK: 3000, // 3 секунды
} as const;

// Таймауты для анализа (совместимость)
export const ANALYSIS_TIMEOUTS = {
  UPLOAD: 30000, // 30 seconds
  PROCESSING: 60000, // 60 seconds
  TOTAL: 90000, // 90 seconds
} as const;

// Ограничения изображений
export const IMAGE_CONSTRAINTS = {
  MAX_SIZE_MB: 5,
  MAX_WIDTH: 2048,
  MAX_HEIGHT: 2048,
  MIN_WIDTH: 100,
  MIN_HEIGHT: 100,
  ALLOWED_FORMATS: ['image/jpeg', 'image/png', 'image/webp'] as const,
  COMPRESSION_QUALITY: 0.8,
} as const;

// Настройки сжатия изображений
export const IMAGE_COMPRESSION = {
  MAX_SIZE_MB: 1.5,
  MAX_WIDTH: 1280,
  MAX_HEIGHT: 1280,
  QUALITY: 0.9,
  FORMAT: 'jpeg' as const,
} as const;

// Цвета темы приложения
export const THEME_COLORS = {
  PRIMARY_BG: '#81D8D0', // Tiffany цвет
  BUTTON_COLOR: '#40a7e3',
  WHITE: '#ffffff',
  BLACK: '#000000',
  ERROR: '#e53935',
  SUCCESS: '#4caf50',
  WARNING: '#ff9800',
  INFO: '#2196f3',
} as const;

// Коды ошибок
export const ERROR_CODES = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  AUTH_FAILED: 'AUTH_FAILED',
  ANALYSIS_FAILED: 'ANALYSIS_FAILED',
  IMAGE_TOO_LARGE: 'IMAGE_TOO_LARGE',
  UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
  SERVER_ERROR: 'SERVER_ERROR',
  TELEGRAM_ERROR: 'TELEGRAM_ERROR',
  STORAGE_ERROR: 'STORAGE_ERROR',
} as const;

// Сообщения об ошибках
export const ERROR_MESSAGES = {
  [ERROR_CODES.NETWORK_ERROR]: 'Ошибка сети. Проверьте подключение к интернету.',
  [ERROR_CODES.AUTH_FAILED]: 'Ошибка авторизации. Попробуйте перезапустить приложение.',
  [ERROR_CODES.ANALYSIS_FAILED]: 'Ошибка анализа изображения. Попробуйте другое фото.',
  [ERROR_CODES.IMAGE_TOO_LARGE]: 'Размер изображения слишком большой. Выберите фото меньшего размера.',
  [ERROR_CODES.UNSUPPORTED_FORMAT]: 'Неподдерживаемый формат изображения. Используйте JPEG, PNG или WebP.',
  [ERROR_CODES.SERVER_ERROR]: 'Ошибка сервера. Попробуйте позже.',
  [ERROR_CODES.TELEGRAM_ERROR]: 'Ошибка Telegram WebApp. Перезапустите приложение.',
  [ERROR_CODES.STORAGE_ERROR]: 'Ошибка сохранения данных. Очистите кэш браузера.',
} as const;

// События приложения
export const APP_EVENTS = {
  INIT: 'app:init',
  READY: 'app:ready',
  AUTH_SUCCESS: 'auth:success',
  AUTH_FAILURE: 'auth:failure',
  PHOTO_SELECTED: 'photo:selected',
  PHOTO_ANALYZED: 'photo:analyzed',
  HISTORY_UPDATED: 'history:updated',
  ERROR_OCCURRED: 'error:occurred',
  THEME_CHANGED: 'theme:changed',
} as const;

// Селекторы DOM элементов
export const DOM_SELECTORS = {
  USER_NAME: '#user-name',
  USER_PHOTO: '#user-photo',
  CAMERA_BTN: '#camera-btn',
  HISTORY_CELLS: '.history-cell',
  APP_CONTAINER: '.app-container',
  MAIN_WRAPPER: '.main-wrapper',
  HISTORY_GRID: '.history-grid',
} as const;

// Классы CSS для состояний
export const CSS_CLASSES = {
  HIDDEN: 'hidden',
  LOADING: 'loading',
  ERROR: 'error',
  SUCCESS: 'success',
  FILLED: 'filled',
  DELETE_MODE: 'delete-mode',
} as const;


// Настройки FastVLM
export const FASTVLM_CONFIG = {
  HEALTH_CHECK_INTERVAL: 30000, // 30 секунд
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1 секунда
  PROMPT_TEMPLATE: 'Опиши одежду на фото детально на русском языке: тип, цвет, стиль, материал, рекомендации по сочетанию.',
} as const;

