/**
 * Константы приложения TgStyle
 */

import type { AppConfig } from '@/types/index';

// Базовый URL сервера (без /api)
export const BASE_URL = 'https://tgstyle.flappy.crazedns.ru';
// URL API сервера (для Telegram Mini App всегда production)
export const API_URL = `${BASE_URL}/api`;

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
  telegramBotName: (process.env as any).TELEGRAM_BOT_NAME || 'LamodaStyleBot',
};

// Настройки localStorage
export const STORAGE_KEYS = {
  HISTORY: 'tgStyleHistory',
  USER_SETTINGS: 'tgStyleUserSettings',
  LOGS: 'tgStyleLogs',
  WARDROBE_CACHE: 'tgStyleWardrobeCache', // Кэш первых 30 элементов гардероба
  CAPSULES_CACHE: 'tgStyleCapsulesCache', // Кэш всех капсул
  PUBLIC_FEED_CACHE: 'tgStylePublicFeedCache', // Кэш публичной ленты
} as const;

// Ограничения истории
export const HISTORY_CONSTRAINTS = {
  MAX_ITEMS: 50, // Увеличено до 50 для сервера (синхронизировано)
} as const;

// Ограничения гардероба
export const WARDROBE_CONSTRAINTS = {
  CACHE_ITEMS: 30, // Количество элементов для кэширования в localStorage
} as const;

// Настройки кэширования изображений
export const IMAGE_CACHE_CONFIG = {
  BATCH_SIZE: 30, // Размер батча для фоновой загрузки изображений
  BATCH_DELAY_MS: 50, // Задержка между батчами в миллисекундах
} as const;

// Настройки логирования
export const LOGGING_CONFIG = {
  MAX_LOGS_IN_MEMORY: 500,
  LOG_FLUSH_TIMEOUT: 5000, // 5 секунд
  SESSION_ID_LENGTH: 16,
} as const;

// Таймауты для различных операций
export const TIMEOUTS = {
  AUTH_REQUEST: 10000, // 10 секунд
  ANALYSIS_REQUEST: 60000, // 60 секунд (увеличено для больших файлов)
  LOG_REQUEST: 5000, // 5 секунд
  HEALTH_CHECK: 3000, // 3 секунды
} as const;


// Ограничения изображений
export const IMAGE_CONSTRAINTS = {
  MAX_SIZE_MB: 25, // Увеличиваем до 25MB для качественных изображений
  MAX_WIDTH: 4096, // Увеличиваем максимальное разрешение
  MAX_HEIGHT: 4096,
  MIN_WIDTH: 100,
  MIN_HEIGHT: 100,
  ALLOWED_FORMATS: ['image/jpeg', 'image/png', 'image/webp'] as const,
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
  [ERROR_CODES.IMAGE_TOO_LARGE]: `Размер изображения слишком большой. Максимальный размер: ${IMAGE_CONSTRAINTS.MAX_SIZE_MB}MB для качественного анализа.`,
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
  HISTORY_CELLS: '.history-card', // Обновлено для карусели
  HISTORY_CARDS: '.history-card', // Новый селектор для карт
  APP_CONTAINER: '.app-container',
  HISTORY_CAROUSEL: '.history-carousel',
  HISTORY_CAROUSEL_CONTAINER: '.history-carousel-container',
  CAROUSEL_DOTS: '.carousel-dots',
  DOT: '.dot',
} as const;

// Классы CSS для состояний
export const CSS_CLASSES = {
  HIDDEN: 'hidden',
  LOADING: 'loading',
  ERROR: 'error',
  SUCCESS: 'success',
  FILLED: 'filled',
  DELETE_MODE: 'delete-mode',
  CENTER: 'center',
  DELETE_HISTORY_BTN: 'delete-history-btn',
} as const;

// Настройки карусели
export const CAROUSEL_CONFIG = {
  CARD_WIDTH: 200,
  CARD_GAP: 20,
  TOTAL_CARD_WIDTH: 220, // CARD_WIDTH + CARD_GAP
  CENTER_OFFSET: 100, // Смещение для центрирования
  SWIPE_THRESHOLD: 20, // Минимальное расстояние для свайпа
  SWIPE_VELOCITY_THRESHOLD: 0.1, // Минимальная скорость для свайпа
  TRANSITION_DURATION: 300, // Длительность анимации в мс
  LONG_PRESS_DELAY: 500, // Задержка долгого нажатия в мс
  HAPTIC_FEEDBACK_LIGHT: 'light' as const,
  HAPTIC_FEEDBACK_MEDIUM: 'medium' as const,
  HAPTIC_FEEDBACK_SUCCESS: 'success' as const,
} as const;


// Настройки тем для анализа одежды
export const FASHION_THEMES = [
  {
    id: 'casual' as const,
    name: 'Повседневный',
    description: 'Для ежедневного ношения',
    emoji: '👕',
  },
  {
    id: 'office' as const,
    name: 'Офис',
    description: 'Для работы в офисе',
    emoji: '💼',
  },
  {
    id: 'party' as const,
    name: 'Вечеринка',
    description: 'Для вечеринок и клубов',
    emoji: '🎉',
  },
  {
    id: 'walk' as const,
    name: 'Прогулка',
    description: 'Для прогулок отдыха',
    emoji: '🚶',
  },
  {
    id: 'date' as const,
    name: 'Свидание',
    description: 'Для свидания',
    emoji: '💕',
  },
  {
    id: 'sport' as const,
    name: 'Спорт',
    description: 'Для занятий спортом',
    emoji: '⚽',
  },
  {
    id: 'beach' as const,
    name: 'Пляж',
    description: 'Для пляжа и отпуска',
    emoji: '🏖️',
  },
  {
    id: 'family' as const,
    name: 'Семейное',
    description: 'Для семейных мероприятий',
    emoji: '👨‍👩‍👧‍👦',
  }
] as const;

// Настройки FastVLM
export const FASTVLM_CONFIG = {
  HEALTH_CHECK_INTERVAL: 30000, // 30 секунд
  RETRY_DELAY: 1000 // 1 секунда
} as const;

