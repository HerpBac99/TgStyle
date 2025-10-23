/**
 * Сервис для вычисления статистики использования вещей гардероба
 * и определения текущего сезона
 */

const { logger } = require('../controllers/logsController');

class WardrobeUsageService {
  /**
   * Извлекает ID вещей из canvasData капсулы
   * @param {Object} canvasData - JSON данные canvas капсулы
   * @returns {number[]} - Массив ID вещей гардероба
   */
  extractItemIdsFromCanvas(canvasData) {
    try {
      if (!canvasData || typeof canvasData !== 'object') {
        return [];
      }

      // canvasData может содержать objects массив с элементами canvas
      if (canvasData.objects && Array.isArray(canvasData.objects)) {
        return canvasData.objects
          .filter(obj => obj.wardrobeItemId)
          .map(obj => obj.wardrobeItemId);
      }

      return [];
    } catch (error) {
      logger.error('Error extracting item IDs from canvas', { error: error.message });
      return [];
    }
  }

  /**
   * Вычисляет статистику использования для каждой вещи
   * @param {Array} wardrobeItems - Массив вещей гардероба
   * @param {Array} capsules - Массив существующих капсул пользователя
   * @returns {Array} - Массив вещей с добавленным полем usageCount
   */
  calculateUsageStats(wardrobeItems, capsules) {
    try {
      // Создаем Map для подсчета использования
      const usageMap = new Map();
      
      // Инициализируем счетчики для всех вещей
      wardrobeItems.forEach(item => {
        usageMap.set(item.id, 0);
      });
      
      // Подсчитываем использование в капсулах
      capsules.forEach(capsule => {
        const itemIds = this.extractItemIdsFromCanvas(capsule.canvasData);
        itemIds.forEach(id => {
          if (usageMap.has(id)) {
            usageMap.set(id, usageMap.get(id) + 1);
          }
        });
      });
      
      // Добавляем usageCount к каждой вещи
      return wardrobeItems.map(item => ({
        ...item,
        usageCount: usageMap.get(item.id) || 0
      }));
    } catch (error) {
      logger.error('Error calculating usage stats', { error: error.message });
      // В случае ошибки возвращаем вещи с usageCount = 0
      return wardrobeItems.map(item => ({
        ...item,
        usageCount: 0
      }));
    }
  }

  /**
   * Приоритизирует вещи с usageCount 1-3 (одобрены, но используются редко)
   * @param {Array} items - Массив вещей с usageCount
   * @returns {Array} - Отсортированный массив вещей
   */
  prioritizeRarelyUsedItems(items) {
    try {
      return items.sort((a, b) => {
        const aScore = this.getPriorityScore(a.usageCount);
        const bScore = this.getPriorityScore(b.usageCount);
        return bScore - aScore; // Сортируем по убыванию приоритета
      });
    } catch (error) {
      logger.error('Error prioritizing items', { error: error.message });
      return items;
    }
  }

  /**
   * Вычисляет приоритет вещи на основе usageCount
   * @param {number} usageCount - Количество использований вещи
   * @returns {number} - Приоритет (3 = высокий, 2 = средний, 1 = низкий)
   */
  getPriorityScore(usageCount) {
    if (usageCount >= 1 && usageCount <= 3) {
      return 3; // Высокий приоритет: одобрены пользователем, но используются редко
    }
    if (usageCount > 3) {
      return 2; // Средний приоритет: популярные вещи
    }
    return 1; // Низкий приоритет: новые вещи (возможно нелюбимые)
  }

  /**
   * Определяет текущий сезон на основе месяца
   * @returns {string} - Название сезона (winter, spring, summer, autumn)
   */
  getCurrentSeason() {
    const month = new Date().getMonth() + 1; // 1-12
    
    if (month >= 12 || month <= 2) {
      return 'winter';
    }
    if (month >= 3 && month <= 5) {
      return 'spring';
    }
    if (month >= 6 && month <= 8) {
      return 'summer';
    }
    return 'autumn'; // 9-11
  }

  /**
   * Получает название текущего месяца на русском
   * @returns {string} - Название месяца
   */
  getCurrentMonth() {
    const months = [
      'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
      'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'
    ];
    return months[new Date().getMonth()];
  }
}

// Экспортируем singleton экземпляр
module.exports = new WardrobeUsageService();
