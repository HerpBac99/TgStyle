/**
 * Примеры использования CapsuleErrorHandler
 * 
 * Этот файл содержит примеры использования утилиты обработки ошибок
 * для различных сценариев в модуле капсул.
 */

import { CapsuleErrorHandler, type ErrorContext } from './CapsuleErrorHandler';
import { logger } from '@/modules/logger';

// ============================================================================
// Пример 1: Использование handleWithFallback
// ============================================================================

async function loadCapsuleWithFallback(capsuleId: number) {
  return await CapsuleErrorHandler.handleWithFallback(
    // Основная операция
    async () => {
      const response = await fetch(`/api/capsules/${capsuleId}`);
      if (!response.ok) throw new Error('Failed to load capsule');
      return await response.json();
    },
    // Fallback - возвращаем пустую капсулу
    () => {
      logger.warn('Using empty capsule as fallback');
      return { id: capsuleId, items: [], canvasData: null };
    },
    // Контекст для логирования
    {
      operation: 'Load Capsule',
      capsuleId,
      userId: 123,
    }
  );
}

// ============================================================================
// Пример 2: Использование wrap для обработки ошибок без fallback
// ============================================================================

async function saveCapsule(capsuleId: number, data: any) {
  return await CapsuleErrorHandler.wrap(
    async () => {
      const response = await fetch(`/api/capsules/${capsuleId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to update capsule');
      return await response.json();
    },
    {
      operation: 'Save Capsule',
      capsuleId,
      additionalData: { itemCount: data.items?.length },
    }
  );
}

// ============================================================================
// Пример 3: Использование handle для синхронных операций
// ============================================================================

function validateCapsuleData(data: any) {
  try {
    if (!data.items || data.items.length === 0) {
      throw new Error('No items selected');
    }
    if (!data.canvasData) {
      throw new Error('Canvas not initialized');
    }
    return true;
  } catch (error) {
    CapsuleErrorHandler.handle(error, {
      operation: 'Validate Capsule Data',
      additionalData: { hasItems: !!data.items, hasCanvas: !!data.canvasData },
    });
    return false;
  }
}

// ============================================================================
// Пример 4: Создание контекста и проверка типа ошибки
// ============================================================================

async function processCanvasImage(imageData: string) {
  const context = CapsuleErrorHandler.createContext('Process Canvas Image', {
    additionalData: { imageSize: imageData.length },
  });

  try {
    // Обработка изображения
    const processed = await processImage(imageData);
    return processed;
  } catch (error) {
    // Проверяем, можно ли повторить операцию
    if (CapsuleErrorHandler.isRetryable(error)) {
      logger.info('Error is retryable, attempting retry...');
      // Повторная попытка
      try {
        return await processImage(imageData);
      } catch (retryError) {
        CapsuleErrorHandler.handle(retryError, context);
        throw retryError;
      }
    }

    // Проверяем, критическая ли ошибка
    if (CapsuleErrorHandler.isCritical(error)) {
      logger.error('Critical error detected!', { error });
    }

    CapsuleErrorHandler.handle(error, context);
    throw error;
  }
}

// ============================================================================
// Пример 5: Использование в классе менеджера
// ============================================================================

class ExampleCapsuleManager {
  async createCapsule(items: any[]) {
    return await CapsuleErrorHandler.handleWithFallback(
      async () => {
        // Валидация
        if (items.length === 0) {
          throw new Error('No items selected');
        }

        // Создание капсулы
        const response = await fetch('/api/capsules', {
          method: 'POST',
          body: JSON.stringify({ items }),
        });

        if (!response.ok) {
          throw new Error('Failed to create capsule');
        }

        return await response.json();
      },
      () => {
        // Fallback - остаемся на текущем экране
        logger.warn('Failed to create capsule, staying on current screen');
        return null;
      },
      {
        operation: 'Create Capsule',
        itemIds: items.map(i => i.id),
      }
    );
  }

  async loadCanvas(capsuleId: number) {
    const context: ErrorContext = {
      operation: 'Load Canvas',
      capsuleId,
    };

    try {
      const capsule = await this.fetchCapsule(capsuleId);
      await this.initializeCanvas(capsule.canvasData);
      return capsule;
    } catch (error) {
      CapsuleErrorHandler.handle(error, context);
      throw error;
    }
  }

  private async fetchCapsule(id: number) {
    // Stub implementation
    return { id, canvasData: {} };
  }

  private async initializeCanvas(_data: any) {
    // Stub implementation
  }
}

// ============================================================================
// Пример 6: Показ пользовательской ошибки
// ============================================================================

function showCustomError(message: string) {
  const error = new Error(message);
  CapsuleErrorHandler.showUserError(error, 'Custom Operation');
}

// ============================================================================
// Пример 7: Получение понятного сообщения без показа
// ============================================================================

function getErrorMessage(error: unknown): string {
  return CapsuleErrorHandler.getUserFriendlyMessage(error, 'Some Operation');
}

// Вспомогательная функция для примера
async function processImage(data: string): Promise<string> {
  // Stub implementation
  return data;
}

// Экспортируем примеры для использования в тестах
export {
  loadCapsuleWithFallback,
  saveCapsule,
  validateCapsuleData,
  processCanvasImage,
  ExampleCapsuleManager,
  showCustomError,
  getErrorMessage,
};
