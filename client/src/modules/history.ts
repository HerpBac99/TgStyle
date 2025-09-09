/**
 * Модуль для управления историей анализов
 */

import type { HistoryItem } from '@/types/index.js';
import { 
  STORAGE_KEYS,
  HISTORY_CONSTRAINTS 
} from '@/utils/constants.js';
import {
  validateHistory,
  validateHistoryItem
} from '@/utils/validation.js';
import {
  safeJsonParse,
  safeJsonStringify,
  createError,
  ERROR_CODES
} from '@/utils/helpers.js';
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
        logger.info('Created empty history');
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
        logger.error('History validation failed', { errors: validation.errors });
        this.history = this.createEmptyHistory();
        return;
      }

      if (validation.warnings.length > 0) {
        logger.warn('History warnings', { warnings: validation.warnings });
      }

      // Дополняем до нужного размера если необходимо
      this.history = this.normalizeHistory(parsedHistory);
      
      logger.info('History loaded from storage', {
        totalItems: this.history.length,
        filledItems: this.history.filter(item => item && !item.isEmpty).length,
      });

    } catch (error) {
      logger.error('Error loading history from storage', error);
      this.history = this.createEmptyHistory();
    }
  }

  /**
   * Сохранение истории в localStorage
   */
  private saveToStorage(): void {
    try {
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
    
    // Обрезаем до максимального размера
    if (result.length > this.maxItems) {
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

      // Ищем пустой слот или создаем новый в начале
      const emptyIndex = this.history.findIndex(historyItem => !historyItem || historyItem.isEmpty);
      
      if (emptyIndex !== -1) {
        // Заполняем пустой слот
        this.history[emptyIndex] = { ...item, isEmpty: false };
        logger.info('Item added to empty slot', { index: emptyIndex });
      } else {
        // Сдвигаем все элементы и добавляем новый в начало
        this.history.unshift({ ...item, isEmpty: false });
        this.history = this.history.slice(0, this.maxItems);
        logger.info('Item added to beginning, oldest item removed');
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
