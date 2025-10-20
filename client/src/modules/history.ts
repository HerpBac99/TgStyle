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
import { api } from './api';

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
   * #HISTORY #HISTORY-LOAD #Cache 
   */
  private loadFromStorage(): void {
    try {
      const storedHistory = localStorage.getItem(STORAGE_KEYS.HISTORY);

      if (!storedHistory) {
        this.history = [];
        logger.info('No history in localStorage, starting with empty');
        return;
      }

      const parsedHistory = safeJsonParse<HistoryItem[]>(storedHistory, []);

      if (!Array.isArray(parsedHistory)) {
        logger.warn('Invalid history format, resetting');
        this.history = [];
        return;
      }

      // Валидация загруженной истории
      const validation = validateHistory(parsedHistory);
      if (!validation.isValid) {
        logger.error('History validation failed', {
          errors: validation.errors,
          errorCount: validation.errors.length
        });
        this.history = [];
        return;
      }

      if (validation.warnings.length > 0) {
        logger.warn('History warnings', { warningCount: validation.warnings.length });
      }

      // Фильтруем только валидные заполненные элементы (NO пустые слоты!)
      this.history = parsedHistory.filter(item => item && !('isEmpty' in item));

      logger.info('History loaded from storage', {
        itemsCount: this.history.length,
        maxItems: this.maxItems
      });
    } catch (error) {
      logger.error('Error loading history from storage', error);
      this.history = [];
    }
  }

  /**
   * Загрузить историю с сервера (основной источник правды)
   * #HISTORY #HISTORY-LOAD #DATABASE
   */
  async loadHistoryFromServer(): Promise<boolean> {
    try {
      logger.info('Loading history from server');

      // Определяем типы для ответа сервера
      // FIXED: сервер отправляет только telegramId для путей
      interface ServerHistoryItem {
        id: number;
        telegramId: string;  // Telegram ID для путей к файлам
        photoPath?: string;
        analysisText?: string;
        technicalAnalysis?: string;
        isPublic: boolean;
        shareId?: string;
        likesCount: number;
        viewsCount: number;
        isLiked?: boolean;
        createdAt: string;
        updatedAt?: string;
      }

      interface ServerHistoryResponse {
        success: boolean;
        history: ServerHistoryItem[];
        pagination: {
          page: number;
          limit: number;
          total: number;
        };
      }

      // Получаем initData для аутентификации
      const initData = window.Telegram?.WebApp?.initData;
      if (!initData) {
        throw new Error('No Telegram initData available');
      }

      // Запрашиваем историю с сервера (GET с initData в query параметрах)
      const queryParams = new URLSearchParams({
        initData,
        limit: '50',
        sortBy: 'createdAt',
        order: 'desc'
      });
      
      const response = await api.get<ServerHistoryResponse>(`/history?${queryParams.toString()}`);

      if (!response.success || !response.history) {
        throw new Error('Failed to load history from server');
      }

      logger.info('History loaded from server', {
        itemsCount: response.history.length,
        total: response.pagination?.total
      });

      // Преобразуем серверные данные в формат HistoryItem
      // FIXED: сервер отправляет только telegramId
      const serverItems = response.history.map((item: ServerHistoryItem) => {
        const transformed = {
          id: item.id,
          telegramId: item.telegramId || '',  // Telegram ID для путей к файлам
          photoPath: item.photoPath,
          analysisText: item.analysisText || item.technicalAnalysis,
          technicalAnalysis: item.technicalAnalysis,
          isPublic: item.isPublic || false,
          shareId: item.shareId,
          likesCount: item.likesCount || 0,
          viewsCount: item.viewsCount || 0,
          isLiked: item.isLiked,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt || item.createdAt
        } as HistoryItem;
        
        return transformed;
      });

      // НЕ нормализуем! Просто сохраняем что пришло с сервера
      this.history = serverItems.slice(0, this.maxItems);

      // Сохраняем в localStorage как кэш
      this.saveToStorage();

      // Уведомляем UI об обновлении истории
      window.dispatchEvent(new CustomEvent('history:updated', {
        detail: { source: 'server', itemsCount: this.getFilledCount() }
      }));

      return true;

    } catch (error) {
      logger.error('Failed to load history from server', error);
      // Fallback на localStorage уже загружен в constructor
      logger.info('Using localStorage as fallback');
      return false;
    }
  }

  /**
   * Сохранение истории в localStorage
   * #HISTORY #HISTORY-SAVE
   */
  private saveToStorage(): void {
    try {
      // Сохраняем историю в localStorage (максимум 50 элементов)
      const historyJson = safeJsonStringify(this.history);
      localStorage.setItem(STORAGE_KEYS.HISTORY, historyJson);

    } catch (error) {
      logger.error('Error saving history to storage', error);
      throw createError(ERROR_CODES.STORAGE_ERROR, 'Не удалось сохранить историю');
    }
  }




  /**
   * Добавление нового элемента в историю
   * #HISTORY #HISTORY-ADD
   * 
   * Если уже 50 элементов, удаляет самый старый
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

      // Убедимся что все необходимые поля есть
      if (!item.id || typeof item.id !== 'number') {
        logger.error('Invalid item ID', { id: item.id });
        return false;
      }

      const now = new Date().toISOString();
      item.createdAt = item.createdAt || now;
      item.updatedAt = item.updatedAt || now;

      // Если история уже полна (50 элементов), удаляем самый старый
      if (this.history.length >= this.maxItems) {
        const removed = this.history.shift();
        logger.info('Removed oldest history item', { 
          removedId: removed?.id,
          remainingCount: this.history.length
        });
      }

      // Добавляем новый элемент в конец
      this.history.push(item);

      logger.info('Item added to history', {
        itemId: item.id,
        totalItems: this.history.length
      });

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
   * #HISTORY #HISTORY-REMOVE
   * 
   * Удаляет с сервера если есть ID, затем из локального массива
   */
  async removeItem(index: number): Promise<boolean> {
    try {
      if (index < 0 || index >= this.history.length) {
        logger.error('Invalid history index', { index, maxIndex: this.history.length - 1 });
        return false;
      }

      const item = this.history[index];
      
      // Удаляем с сервера если есть ID (для серверных элементов)
      if (item && item.id) {
        try {
          const initData = window.Telegram?.WebApp?.initData;
          if (initData) {
            const response = await api.delete<{ success: boolean }>(`/history/${item.id}?initData=${encodeURIComponent(initData)}`);
            if (response.success) {
              logger.info('History item deleted from server', { id: item.id });
            }
          }
        } catch (error) {
          logger.warn('Failed to delete item from server', { id: item.id, error });
          // Продолжаем удаление локально даже если сервер недоступен
        }
      }

      // Удаляем из локального массива
      const removed = this.history.splice(index, 1);
      
      logger.info('History item removed', { 
        removedId: removed[0]?.id,
        remainingCount: this.history.length
      });
      
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
   * #HISTORY #HISTORY-GET-ITEM
   */
  getItem(index: number): HistoryItem | null {
    if (index < 0 || index >= this.history.length) {
      return null;
    }
    return this.history[index] || null;
  }

  /**
   * Получение всей истории
   * #HISTORY #HISTORY-GET-ALL
   */
  getAllItems(): HistoryItem[] {
    return [...this.history];
  }

  /**
   * Получить элемент истории по ID (не по индексу!)
   * FIXED: используется для обновления лайков в кэше без перезагрузки
   */
  getItemById(historyItemId: number): HistoryItem | undefined {
    return this.history.find(item => item.id === historyItemId);
  }

  /**
   * Обновление статуса лайка для элемента истории и сохранение в localStorage
   * #HISTORY #HISTORY-UPDATE-LIKE
   */
  updateItemLikeStatus(itemId: number, likeStatus: { isLiked: boolean; likesCount: number }): void {
    try {
      const item = this.getItemById(itemId);
      if (item) {
        item.isLiked = likeStatus.isLiked;
        item.likesCount = likeStatus.likesCount;
        
        logger.info('Updated like status in memory and saving to storage', {
          itemId,
          isLiked: item.isLiked,
          likesCount: item.likesCount
        });

        // Сохраняем все изменения в localStorage
        this.saveToStorage();
      } else {
        logger.warn('Attempted to update like status for a non-existent history item', { itemId });
      }
    } catch (error) {
      logger.error('Error updating like status', { itemId, error });
    }
  }

  /**
   * Получение только заполненных элементов (в данном случае = все элементы)
   * #HISTORY #HISTORY-GET-FILLED
   */
  getFilledItems(): HistoryItem[] {
    return [...this.history];
  }

  /**
   * Получение элемента по индексу в массиве (= getItem)
   * #HISTORY #HISTORY-GET-FILLED-ITEM
   */
  getFilledItem(index: number): HistoryItem | null {
    return this.getItem(index);
  }

  /**
   * Очистка всей истории
   * #HISTORY #HISTORY-CLEAR
   */
  clear(): void {
    try {
      this.history = [];
      this.saveToStorage();
      logger.info('History cleared');
    } catch (error) {
      logger.error('Error clearing history', error);
    }
  }

  /**
   * Получение количества элементов в истории
   * #HISTORY #HISTORY-COUNT
   */
  getFilledCount(): number {
    return this.history.length;
  }

  /**
   * Проверка, есть ли место для нового элемента
   * #HISTORY #HISTORY-HAS-SLOTS
   */
  hasEmptySlots(): boolean {
    return this.history.length < this.maxItems;
  }

  /**
   * Получение позиции для нового элемента (= текущая длина)
   * #HISTORY #HISTORY-FIRST-EMPTY
   */
  getFirstEmptySlotIndex(): number {
    return this.history.length;
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

      // Заменяем текущую историю (макс 50 элементов)
      // #HISTORY #HISTORY-IMPORT
      this.history = data.items.slice(0, this.maxItems);
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
   * #HISTORY #HISTORY-STATS
   */
  getStats() {
    const filledItems = this.getFilledItems();

    return {
      totalSlots: this.maxItems,
      filledSlots: filledItems.length,
      emptySlots: this.maxItems - filledItems.length,
      oldestItem: filledItems.length > 0 ?
        filledItems.reduce((oldest, item) =>
          new Date(item.createdAt) < new Date(oldest.createdAt) ? item : oldest
        ).createdAt : null,
      newestItem: filledItems.length > 0 ?
        filledItems.reduce((newest, item) =>
          new Date(item.createdAt) > new Date(newest.createdAt) ? item : newest
        ).createdAt : null,
    };
  }
}

// Создаем глобальный экземпляр менеджера истории
export const historyManager = new HistoryManager();

export default historyManager;
