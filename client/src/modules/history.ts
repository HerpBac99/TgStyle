/**
 * Модуль для управления историей анализов
 */

import type { HistoryItem } from '@/types/index';
import {
  STORAGE_KEYS,
  HISTORY_CONSTRAINTS
} from '@/utils/constants';
import {
  validateHistory,
  validateHistoryItem
} from '@/utils/validation';
import {
  safeJsonParse,
  safeJsonStringify,
  createError,
  ERROR_CODES
} from '@/utils/helpers';
import { logger } from './logger';

/**
 * Класс для управления историей анализов
 */
class HistoryManager {
  private history: HistoryItem[] = [];
  private maxItems = HISTORY_CONSTRAINTS.MAX_ITEMS;

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Загрузка истории из localStorage
   */
  private loadFromStorage(): void {
    try {
      const storedHistory = localStorage.getItem(STORAGE_KEYS.HISTORY);


      if (!storedHistory) {
        this.history = this.createEmptyHistory();
        logger.info('Created empty history - no data in localStorage');
        return;
      }

      const parsedHistory = safeJsonParse<HistoryItem[]>(storedHistory, []);

      if (!Array.isArray(parsedHistory)) {
        logger.warn('Invalid history format, creating new');
        this.history = this.createEmptyHistory();
        return;
      }

      // Валидация загруженной истории
      const validation = validateHistory(parsedHistory);
      if (!validation.isValid) {
        logger.error('History validation failed', {
          errors: validation.errors,
          errorCount: validation.errors.length
        });
        this.history = this.createEmptyHistory();
        return;
      }

      if (validation.warnings.length > 0) {
        logger.warn('History warnings', {
          warnings: validation.warnings,
          warningCount: validation.warnings.length
        });
      }

      // Дополняем до нужного размера если необходимо
      this.history = this.normalizeHistory(parsedHistory);

      const filledCount = this.history.filter(item => item && !item.isEmpty).length;

      logger.info('History loaded from storage successfully', {
        totalItems: this.history.length,
        filledItems: filledCount,
        emptyItems: this.history.length - filledCount,
        sampleItem: this.history[0] ? {
          hasPhoto: !!this.history[0].photo,
          photoSize: this.history[0].photo ? Math.round(this.history[0].photo.length / 1024) + 'KB' : 'no photo',
          hasAnalysis: !!this.history[0].analysis,
          timestamp: this.history[0].timestamp
        } : 'no items'
      });

    } catch (error) {
      logger.error('Error loading history from storage', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      this.history = this.createEmptyHistory();
    }
  }

  /**
   * Сохранение истории в localStorage с проверкой размера
   */
  private saveToStorage(): void {
    try {
      // Проверяем и очищаем localStorage если необходимо
      this.ensureStorageSpace();

      // Сохраняем историю как есть, без оптимизации размера
      const historyJson = safeJsonStringify(this.history);
      localStorage.setItem(STORAGE_KEYS.HISTORY, historyJson);

      logger.debug('History saved to storage');
    } catch (error) {
      logger.error('Error saving history to storage', error);
      throw createError(ERROR_CODES.STORAGE_ERROR, 'Не удалось сохранить историю');
    }
  }

  /**
   * Проверяет и обеспечивает свободное место в localStorage
   */
  private ensureStorageSpace(): void {
    try {
      // Рассчитываем размер текущей истории
      const currentHistorySize = this.calculateHistorySize();

      // Получаем размер других данных в localStorage
      const otherDataSize = this.getOtherStorageSize();

      // Общий размер после добавления новой истории
      const totalEstimatedSize = otherDataSize + currentHistorySize;

      // Лимит localStorage (примерно 5MB)
      const storageLimit = 4.5 * 1024 * 1024; // 4.5MB для безопасности

      if (totalEstimatedSize > storageLimit) {
        logger.warn('localStorage limit approaching, cleaning up old items');

        // Удаляем старые элементы, оставляя место для одного элемента (1MB)
        this.cleanupOldItems(storageLimit - otherDataSize - 1024 * 1024);
      }
    } catch (error) {
      logger.warn('Error checking storage space', error);
    }
  }

  /**
   * Рассчитывает размер текущей истории в байтах
   */
  private calculateHistorySize(): number {
    try {
      const historyJson = safeJsonStringify(this.history);
      // Примерный размер в байтах (base64 примерно в 1.37 раза больше JSON)
      return historyJson.length * 1.37;
    } catch (error) {
      logger.warn('Error calculating history size', error);
      return 0;
    }
  }

  /**
   * Получает размер других данных в localStorage (кроме истории)
   */
  private getOtherStorageSize(): number {
    let totalSize = 0;
    try {
      for (let key in localStorage) {
        if (key !== STORAGE_KEYS.HISTORY && localStorage.hasOwnProperty(key)) {
          const value = localStorage.getItem(key);
          if (value) {
            totalSize += value.length * 1.37; // Примерный размер в байтах
          }
        }
      }
    } catch (error) {
      logger.warn('Error calculating other storage size', error);
    }
    return totalSize;
  }


  /**
   * Удаляет старые элементы истории чтобы уложиться в лимит
   */
  private cleanupOldItems(maxAllowedSize: number): void {
    try {
      const filledItems = this.getFilledItems();
      if (filledItems.length <= 1) {
        logger.warn('Cannot cleanup: only one item left');
        return;
      }

      // Сортируем по времени (старые первые)
      filledItems.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // Удаляем старые элементы пока не уложимся в лимит
      let currentSize = this.calculateHistorySize();
      let removedCount = 0;

      while (currentSize > maxAllowedSize && filledItems.length > 1) {
        const oldestItem = filledItems.shift();
        if (oldestItem) {
          // Находим индекс этого элемента в основной истории
          const index = this.history.findIndex(item =>
            item && !item.isEmpty && item.timestamp === oldestItem.timestamp
          );
          if (index >= 0) {
            this.history[index] = { isEmpty: true } as HistoryItem;
            removedCount++;
            currentSize = this.calculateHistorySize();
          }
        }
      }

      if (removedCount > 0) {
        logger.info('Cleaned up old history items', {
          removedCount,
          remainingItems: filledItems.length,
          newSize: Math.round(currentSize / 1024) + 'KB'
        });
      }
    } catch (error) {
      logger.warn('Error cleaning up old items', error);
    }
  }

  /**
   * Создание пустой истории
   */
  private createEmptyHistory(): HistoryItem[] {
    return new Array(this.maxItems).fill(null).map(() => ({ isEmpty: true } as HistoryItem));
  }

  /**
   * Нормализация истории до нужного размера
   */
  private normalizeHistory(history: HistoryItem[]): HistoryItem[] {
    const result = [...history];

    // Если массив больше максимального размера, обрезаем его
    // Но сохраняем лишние элементы в конце (они могут быть важными)
    if (result.length > this.maxItems) {
      logger.warn('History array larger than maxItems, truncating', {
        currentLength: result.length,
        maxItems: this.maxItems
      });
      result.splice(this.maxItems);
    }

    // Дополняем пустыми элементами если необходимо
    while (result.length < this.maxItems) {
      result.push({ isEmpty: true } as HistoryItem);
    }

    return result;
  }


  /**
   * Добавление нового элемента в историю
   */
  addItem(item: HistoryItem): boolean {
    try {
      // Валидация элемента
      const validation = validateHistoryItem(item);
      if (!validation.isValid) {
        logger.error('Invalid history item', { errors: validation.errors });
        return false;
      }

      if (validation.warnings.length > 0) {
        logger.warn('History item warnings', { warnings: validation.warnings });
      }

      // Добавляем timestamp если отсутствует
      if (!item.timestamp) {
        item.timestamp = new Date().toISOString();
      }

      // Найдем позицию для вставки нового элемента
      if (this.history.length >= this.maxItems) {
        // Если история полная, удаляем самый старый (первый) элемент
        const oldFirstItem = this.history[0];
        this.history.shift();
        this.history.push({ ...item, isEmpty: false });

        logger.info('Item added, oldest item removed', {
          removedItem: {
            hadItem: !!oldFirstItem,
            wasEmpty: oldFirstItem?.isEmpty,
            hadPhoto: !!oldFirstItem?.photo
          },
          newArrayLength: this.history.length
        });
      } else {
        // Добавляем новый элемент после последнего заполненного элемента
        const insertPosition = this.findInsertPosition();

        // Если позиция валидна (в пределах массива)
        if (insertPosition < this.history.length) {
          // Вставляем элемент на позицию и сдвигаем остальные вправо
          this.history.splice(insertPosition, 0, { ...item, isEmpty: false });
          logger.info('Item inserted at position', {
            position: insertPosition,
            newLength: this.history.length
          });
        } else {
        // Если массив еще не заполнен, просто добавляем в конец
        if (this.history.length < this.maxItems) {
          this.history.push({ ...item, isEmpty: false });
          logger.info('Item added to end of array', {
            newLength: this.history.length,
            maxItems: this.maxItems
          });
        } else {
          // Массив заполнен - удаляем самый старый элемент и добавляем новый
          const oldFirstItem = this.history.shift();
          this.history.push({ ...item, isEmpty: false });
          logger.info('Removed oldest item and added new to end', {
            removedItem: {
              hadItem: !!oldFirstItem,
              wasEmpty: oldFirstItem?.isEmpty,
              hadPhoto: !!oldFirstItem?.photo
            },
            newLength: this.history.length,
            maxItems: this.maxItems
          });
        }
        }
      }

      // Сохраняем в localStorage
      this.saveToStorage();
      
      return true;
    } catch (error) {
      logger.error('Error adding history item', error);
      return false;
    }
  }

  /**
   * Удаление элемента из истории по индексу
   */
  removeItem(index: number): boolean {
    try {
      if (index < 0 || index >= this.history.length) {
        logger.error('Invalid history index', { index, maxIndex: this.history.length - 1 });
        return false;
      }

      // Помечаем как пустой
      this.history[index] = { isEmpty: true } as HistoryItem;
      
      logger.info('History item removed', { index });
      
      // Сохраняем в localStorage
      this.saveToStorage();
      
      return true;
    } catch (error) {
      logger.error('Error removing history item', error);
      return false;
    }
  }

  /**
   * Получение элемента истории по индексу
   */
  getItem(index: number): HistoryItem | null {
    if (index < 0 || index >= this.history.length) {
      return null;
    }
    
    const item = this.history[index];
    return (item && !item.isEmpty) ? item : null;
  }

  /**
   * Получение всей истории
   */
  getAllItems(): HistoryItem[] {
    return [...this.history];
  }

  /**
   * Получение только заполненных элементов истории
   */
  getFilledItems(): HistoryItem[] {
    return this.history.filter(item => item && !item.isEmpty);
  }

  /**
   * Получение заполненного элемента по индексу в массиве заполненных элементов
   */
  getFilledItem(index: number): HistoryItem | null {
    const filledItems = this.getFilledItems();
    if (index < 0 || index >= filledItems.length) {
      return null;
    }
    return filledItems[index] || null;
  }

  /**
   * Очистка всей истории
   */
  clear(): void {
    try {
      this.history = this.createEmptyHistory();
      this.saveToStorage();
      logger.info('History cleared');
    } catch (error) {
      logger.error('Error clearing history', error);
    }
  }

  /**
   * Получение количества заполненных элементов
   */
  getFilledCount(): number {
    return this.history.filter(item => item && !item.isEmpty).length;
  }

  /**
   * Проверка, есть ли свободные слоты
   */
  hasEmptySlots(): boolean {
    return this.history.some(item => !item || item.isEmpty);
  }

  /**
   * Получение индекса первого пустого слота
   */
  getFirstEmptySlotIndex(): number {
    return this.history.findIndex(item => !item || item.isEmpty);
  }

  /**
   * Находит позицию для вставки нового элемента (после последнего заполненного)
   * Оптимизированная версия с поиском с конца массива
   */
  private findInsertPosition(): number {
    // Ищем последний заполненный элемент с конца массива
    for (let i = this.history.length - 1; i >= 0; i--) {
      const item = this.history[i];
      if (item && !item.isEmpty) {
        // Возвращаем позицию после найденного элемента
        return i + 1;
      }
    }

    // Если не нашли ни одного заполненного элемента, возвращаем 0
    return 0;
  }

  /**
   * Экспорт истории в JSON
   */
  exportToJson(): string {
    try {
      const filledItems = this.getFilledItems();
      return safeJsonStringify({
        exported: new Date().toISOString(),
        totalItems: filledItems.length,
        items: filledItems,
      });
    } catch (error) {
      logger.error('Error exporting history', error);
      throw createError(ERROR_CODES.STORAGE_ERROR, 'Не удалось экспортировать историю');
    }
  }

  /**
   * Импорт истории из JSON
   */
  importFromJson(jsonString: string): boolean {
    try {
      const data = safeJsonParse<{
        exported: string;
        totalItems: number;
        items: HistoryItem[];
      }>(jsonString, { exported: '', totalItems: 0, items: [] });

      if (!data.items || !Array.isArray(data.items)) {
        throw new Error('Invalid import format');
      }

      // Валидация импортируемых данных
      const validation = validateHistory(data.items);
      if (!validation.isValid) {
        throw new Error('Invalid history data: ' + validation.errors.join('; '));
      }

      // Заменяем текущую историю
      this.history = this.normalizeHistory(data.items);
      this.saveToStorage();

      logger.info('History imported successfully', {
        importedItems: data.totalItems,
        exportDate: data.exported,
      });

      return true;
    } catch (error) {
      logger.error('Error importing history', error);
      return false;
    }
  }

  /**
   * Получение статистики истории
   */
  getStats() {
    const filledItems = this.getFilledItems();
    const totalSize = filledItems.reduce((size, item) => {
      return size + (item.photo?.length || 0);
    }, 0);

    return {
      totalSlots: this.maxItems,
      filledSlots: filledItems.length,
      emptySlots: this.maxItems - filledItems.length,
      totalDataSize: Math.round(totalSize / 1024) + 'KB',
      oldestItem: filledItems.length > 0 ?
        filledItems.reduce((oldest, item) =>
          new Date(item.timestamp) < new Date(oldest.timestamp) ? item : oldest
        ).timestamp : null,
      newestItem: filledItems.length > 0 ?
        filledItems.reduce((newest, item) =>
          new Date(item.timestamp) > new Date(newest.timestamp) ? item : newest
        ).timestamp : null,
    };
  }
}

// Создаем глобальный экземпляр менеджера истории
export const historyManager = new HistoryManager();

export default historyManager;
