/**
 * CapsuleErrorHandler - Утилита для обработки ошибок в модуле капсул
 * 
 * Обеспечивает:
 * - Единый механизм обработки ошибок
 * - Понятные пользователю сообщения
 * - Логирование с контекстом
 * - Fallback механизмы
 * 
 * Требования: 8.1, 8.2, 8.3
 */

import { logger } from '@/modules/logger';
import { ModalService } from '@/modules/shared/ModalService';

/**
 * Контекст ошибки для логирования
 */
export interface ErrorContext {
  operation: string;
  userId?: number;
  capsuleId?: number;
  itemIds?: number[];
  additionalData?: Record<string, any>;
}

/**
 * Маппинг технических ошибок на понятные пользователю сообщения
 */
const ERROR_MESSAGES: Record<string, string> = {
  // Canvas ошибки
  'Canvas not initialized': 'Редактор не готов. Попробуйте еще раз',
  'Canvas initialization failed': 'Не удалось инициализировать редактор',
  'Failed to load canvas items': 'Не удалось загрузить элементы на холст',
  'Failed to save canvas state': 'Не удалось сохранить состояние редактора',
  
  // Изображения
  'Failed to load image': 'Не удалось загрузить изображение',
  'Background removal failed': 'Не удалось удалить фон',
  'Image processing failed': 'Не удалось обработать изображение',
  'Invalid image format': 'Неверный формат изображения',
  'Image too large': 'Изображение слишком большое',
  
  // Сеть и API
  'Network error': 'Ошибка сети. Проверьте подключение',
  'Server error': 'Ошибка сервера. Попробуйте позже',
  'Request timeout': 'Превышено время ожидания',
  'Failed to fetch': 'Не удалось загрузить данные',
  
  // Капсулы
  'Failed to create capsule': 'Не удалось создать капсулу',
  'Failed to update capsule': 'Не удалось обновить капсулу',
  'Failed to delete capsule': 'Не удалось удалить капсулу',
  'Failed to load capsule': 'Не удалось загрузить капсулу',
  'Capsule not found': 'Капсула не найдена',
  
  // Выбор вещей
  'No items selected': 'Не выбрано ни одной вещи',
  'Failed to load wardrobe items': 'Не удалось загрузить вещи гардероба',
  'Invalid item selection': 'Неверный выбор вещей',
  
  // Авторизация
  'Unauthorized': 'Требуется авторизация',
  'Authentication failed': 'Ошибка авторизации',
  
  // Общие
  'Unknown error': 'Произошла неизвестная ошибка',
  'Operation cancelled': 'Операция отменена',
};

/**
 * Утилита для обработки ошибок в модуле капсул
 */
export class CapsuleErrorHandler {
  private static modalService = new ModalService();

  /**
   * Выполнить операцию с обработкой ошибок и fallback
   * 
   * @param operation - Асинхронная операция для выполнения
   * @param fallback - Функция fallback, вызываемая при ошибке
   * @param context - Контекст операции для логирования
   * @returns Результат операции или fallback
   */
  static async handleWithFallback<T>(
    operation: () => Promise<T>,
    fallback: () => T,
    context: ErrorContext
  ): Promise<T> {
    try {
      logger.debug(`Starting operation: ${context.operation}`, context);
      const result = await operation();
      logger.debug(`Operation completed: ${context.operation}`);
      return result;
    } catch (error) {
      // Логируем ошибку с полным контекстом
      this.logError(error, context);
      
      // Показываем пользователю понятное сообщение
      this.showUserError(error, context.operation);
      
      // Возвращаем fallback значение
      logger.warn(`Using fallback for operation: ${context.operation}`);
      return fallback();
    }
  }

  /**
   * Показать пользователю понятное сообщение об ошибке
   * 
   * @param error - Ошибка
   * @param operation - Название операции
   */
  static showUserError(error: unknown, operation: string): void {
    const userMessage = this.getUserFriendlyMessage(error, operation);
    
    // Показываем alert через ModalService
    this.modalService.showAlert(userMessage).catch(err => {
      logger.error('Failed to show error alert', { error: err });
    });
  }

  /**
   * Получить понятное пользователю сообщение об ошибке
   * 
   * @param error - Ошибка
   * @param operation - Название операции
   * @returns Понятное сообщение
   */
  static getUserFriendlyMessage(error: unknown, operation: string): string {
    // Извлекаем сообщение из ошибки
    let errorMessage = 'Unknown error';
    
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error && typeof error === 'object' && 'message' in error) {
      errorMessage = String((error as any).message);
    }

    // Ищем точное совпадение в маппинге
    if (ERROR_MESSAGES[errorMessage]) {
      return ERROR_MESSAGES[errorMessage] || 'Произошла ошибка';
    }

    // Ищем частичное совпадение (case-insensitive)
    const lowerMessage = errorMessage.toLowerCase();
    for (const [key, value] of Object.entries(ERROR_MESSAGES)) {
      if (lowerMessage.includes(key.toLowerCase())) {
        return value || 'Произошла ошибка';
      }
    }

    // Специальные случаи по типу ошибки
    if (lowerMessage.includes('network') || lowerMessage.includes('fetch')) {
      return ERROR_MESSAGES['Network error'] || 'Ошибка сети';
    }
    
    if (lowerMessage.includes('timeout')) {
      return ERROR_MESSAGES['Request timeout'] || 'Превышено время ожидания';
    }
    
    if (lowerMessage.includes('unauthorized') || lowerMessage.includes('auth')) {
      return ERROR_MESSAGES['Unauthorized'] || 'Требуется авторизация';
    }

    // Если ничего не подошло, возвращаем общее сообщение с контекстом операции
    return `Ошибка при выполнении операции: ${operation}`;
  }

  /**
   * Логировать ошибку с контекстом
   * 
   * @param error - Ошибка
   * @param context - Контекст операции
   */
  private static logError(error: unknown, context: ErrorContext): void {
    const errorData: Record<string, any> = {
      operation: context.operation,
      timestamp: new Date().toISOString(),
    };

    // Добавляем контекстные данные
    if (context.userId) errorData['userId'] = context.userId;
    if (context.capsuleId) errorData['capsuleId'] = context.capsuleId;
    if (context.itemIds) errorData['itemIds'] = context.itemIds;
    if (context.additionalData) errorData['additionalData'] = context.additionalData;

    // Извлекаем информацию об ошибке
    if (error instanceof Error) {
      errorData['errorMessage'] = error.message;
      errorData['errorName'] = error.name;
      errorData['errorStack'] = error.stack;
    } else if (typeof error === 'string') {
      errorData['errorMessage'] = error;
    } else {
      errorData['error'] = error;
    }

    // Логируем с уровнем error
    logger.error(`Capsule operation failed: ${context.operation}`, errorData);
  }

  /**
   * Обработать ошибку без fallback (только логирование и показ пользователю)
   * 
   * @param error - Ошибка
   * @param context - Контекст операции
   */
  static handle(error: unknown, context: ErrorContext): void {
    this.logError(error, context);
    this.showUserError(error, context.operation);
  }

  /**
   * Создать контекст ошибки
   * 
   * @param operation - Название операции
   * @param additionalData - Дополнительные данные
   * @returns Контекст ошибки
   */
  static createContext(
    operation: string,
    additionalData?: Partial<ErrorContext>
  ): ErrorContext {
    return {
      operation,
      ...additionalData,
    };
  }

  /**
   * Обернуть асинхронную операцию в обработчик ошибок
   * Удобная обертка для использования в async/await коде
   * 
   * @param operation - Асинхронная операция
   * @param context - Контекст операции
   * @returns Promise с результатом или выброшенной ошибкой
   */
  static async wrap<T>(
    operation: () => Promise<T>,
    context: ErrorContext
  ): Promise<T> {
    try {
      logger.debug(`Starting operation: ${context.operation}`, context);
      const result = await operation();
      logger.debug(`Operation completed: ${context.operation}`);
      return result;
    } catch (error) {
      this.handle(error, context);
      throw error; // Пробрасываем ошибку дальше
    }
  }

  /**
   * Проверить, является ли ошибка критической
   * Критические ошибки требуют немедленного внимания
   * 
   * @param error - Ошибка
   * @returns true если ошибка критическая
   */
  static isCritical(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      
      // Критические ошибки
      const criticalPatterns = [
        'unauthorized',
        'authentication failed',
        'server error',
        'database error',
        'fatal',
      ];
      
      return criticalPatterns.some(pattern => message.includes(pattern));
    }
    
    return false;
  }

  /**
   * Проверить, можно ли повторить операцию после ошибки
   * 
   * @param error - Ошибка
   * @returns true если операцию можно повторить
   */
  static isRetryable(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      
      // Ошибки, после которых можно повторить операцию
      const retryablePatterns = [
        'network error',
        'timeout',
        'fetch',
        'connection',
        'temporary',
      ];
      
      return retryablePatterns.some(pattern => message.includes(pattern));
    }
    
    return false;
  }
}

// Экспортируем singleton для удобства
export const capsuleErrorHandler = CapsuleErrorHandler;
