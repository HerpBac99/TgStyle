/**
 * Типы для sharing функционала
 */

/**
 * Тип контента для sharing
 */
export type ShareContentType = 'analysis' | 'capsule';

/**
 * Конфигурация для sharing
 */
export interface ShareConfig {
  /** Тип контента */
  type: ShareContentType;
  /** Изображение в base64 */
  image: string;
  /** Текст контента */
  text: string;
  /** Заголовок */
  title: string;
  /** Дополнительные метаданные */
  metadata?: Record<string, any>;
}

/**
 * Опции sharing
 */
export interface ShareOptions {
  /** Включить изображение в sharing */
  includeImage?: boolean;
  /** Включить ссылку на контент */
  includeLink?: boolean;
  /** Сохранять на сервер */
  saveToServer?: boolean;
  /** Качество сжатия изображения (0-1) */
  imageQuality?: number;
}

/**
 * Данные для сохранения в хранилище
 */
export interface ShareData {
  /** Тип контента */
  type: ShareContentType;
  /** Изображение */
  image: string | null;
  /** Текст */
  text: string;
  /** Метаданные */
  metadata?: Record<string, any>;
  /** Время создания */
  timestamp: string;
  /** Время sharing */
  sharedAt: string;
}

/**
 * Результат операции sharing
 */
export interface ShareResult {
  /** Успешно ли */
  success: boolean;
  /** ID для shared контента */
  shareId?: string;
  /** Ссылка на shared контент */
  shareLink?: string;
  /** Способ sharing */
  method?: 'web-share' | 'telegram' | 'clipboard';
  /** Ошибка если есть */
  error?: string;
}
