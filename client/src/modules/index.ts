/**
 * Центральный экспорт всех модулей TgStyle
 */

// Экспорт основных модулей
export { logger, appLogger } from './logger';
export { api } from './api';
export { authManager } from './auth';
export { cameraManager } from './camera';
export { historyManager } from './history';
export { analysisManager } from './analysis';
export { uiManager } from './ui';

// Экспорт типов
export type * from '@/types/index';

// Реэкспорт утилит для удобства
export {
  generateSessionId,
  formatTimestamp,
  formatHistoryDate,
  isOnline,
  delay,
  createError,
  ERROR_CODES,
  getErrorMessage,
} from '@/utils/helpers';

export {
  API_URL,
  APP_CONFIG,
  STORAGE_KEYS,
  HISTORY_CONSTRAINTS,
  APP_EVENTS,
} from '@/utils/constants';

// Объявляем глобальные типы для Window
declare global {
  interface Window {
    // Основной API логгера
    appLogger: typeof import('./logger').appLogger;
    clientLogger: typeof import('./logger').logger;
    
    // Менеджеры модулей
    authManager: typeof import('./auth.js').authManager;
    cameraManager: typeof import('./camera.js').cameraManager;
    historyManager: typeof import('./history.js').historyManager;
    analysisManager: typeof import('./analysis.js').analysisManager;
    uiManager: typeof import('./ui.js').uiManager;
    
    // API
    api: typeof import('./api.js').api;
    
    // Основное приложение
    tgStyleApp: typeof import('../main.js').default;
  }
}
