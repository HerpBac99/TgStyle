/**
 * Сервис для проверки уникальности и разнообразия капсул
 * Вычисляет схожесть между капсулами и обеспечивает минимальные различия
 */

const { logger } = require('../controllers/logsController');

class CapsuleSimilarityService {
  /**
   * Вычисляет процент схожести между двумя капсулами
   * Использует коэффициент Жаккара (Jaccard similarity)
   * @param {number[]} capsule1ItemIds - Массив ID вещей первой капсулы
   * @param {number[]} capsule2ItemIds - Массив ID вещей второй капсулы
   * @returns {number} - Процент схожести от 0 до 100
   */
  calculateSimilarity(capsule1ItemIds, capsule2ItemIds) {
    try {
      // Проверка входных данных
      if (!Array.isArray(capsule1ItemIds) || !Array.isArray(capsule2ItemIds)) {
        logger.warn('Invalid input for similarity calculation', {
          capsule1Type: typeof capsule1ItemIds,
          capsule2Type: typeof capsule2ItemIds
        });
        return 0;
      }

      // Если одна из капсул пустая
      if (capsule1ItemIds.length === 0 || capsule2ItemIds.length === 0) {
        return 0;
      }

      // Создаем множества для вычисления пересечения и объединения
      const set1 = new Set(capsule1ItemIds);
      const set2 = new Set(capsule2ItemIds);
      
      // Вычисляем пересечение (общие вещи)
      const intersection = new Set([...set1].filter(x => set2.has(x)));
      
      // Вычисляем объединение (все уникальные вещи)
      const union = new Set([...set1, ...set2]);
      
      // Коэффициент Жаккара: |A ∩ B| / |A ∪ B|
      const similarity = (intersection.size / union.size) * 100;
      
      return Math.round(similarity * 100) / 100; // Округляем до 2 знаков
    } catch (error) {
      logger.error('Error calculating similarity', { 
        error: error.message,
        capsule1Length: capsule1ItemIds?.length,
        capsule2Length: capsule2ItemIds?.length
      });
      return 0;
    }
  }

  /**
   * Проверяет достаточно ли уникальна новая капсула
   * по сравнению с существующими капсулами
   * @param {number[]} newCapsuleItemIds - Массив ID вещей новой капсулы
   * @param {Array<{itemIds: number[]}>} existingCapsules - Массив существующих капсул с itemIds
   * @param {number} threshold - Порог схожести (по умолчанию 80%)
   * @returns {boolean} - true если капсула уникальна (схожесть < threshold)
   */
  isUnique(newCapsuleItemIds, existingCapsules, threshold = 80) {
    try {
      // Проверка входных данных
      if (!Array.isArray(newCapsuleItemIds)) {
        logger.warn('Invalid new capsule item IDs', { type: typeof newCapsuleItemIds });
        return false;
      }

      if (!Array.isArray(existingCapsules)) {
        logger.warn('Invalid existing capsules', { type: typeof existingCapsules });
        return true; // Если нет существующих капсул, новая уникальна
      }

      // Если нет существующих капсул, новая капсула уникальна
      if (existingCapsules.length === 0) {
        return true;
      }

      // Проверяем схожесть с каждой существующей капсулой
      for (const existing of existingCapsules) {
        if (!existing.itemIds || !Array.isArray(existing.itemIds)) {
          continue;
        }

        const similarity = this.calculateSimilarity(newCapsuleItemIds, existing.itemIds);
        
        // Если схожесть >= порога, капсула не уникальна
        if (similarity >= threshold) {
          logger.info('Capsule is not unique', {
            similarity,
            threshold,
            newCapsuleItems: newCapsuleItemIds.length,
            existingCapsuleItems: existing.itemIds.length
          });
          return false;
        }
      }

      // Капсула уникальна относительно всех существующих
      return true;
    } catch (error) {
      logger.error('Error checking uniqueness', { 
        error: error.message,
        newCapsuleLength: newCapsuleItemIds?.length,
        existingCapsulesCount: existingCapsules?.length
      });
      // В случае ошибки считаем капсулу уникальной (fail-safe)
      return true;
    }
  }

  /**
   * Обеспечивает разнообразие между сгенерированными капсулами
   * Фильтрует капсулы, чтобы каждая отличалась минимум на заданный процент
   * @param {Array<{itemIds: number[]}>} generatedCapsules - Массив сгенерированных капсул
   * @param {number} minDifference - Минимальный процент различий (по умолчанию 30%)
   * @returns {Array<{itemIds: number[]}>} - Отфильтрованный массив разнообразных капсул
   */
  ensureDiversity(generatedCapsules, minDifference = 30) {
    try {
      // Проверка входных данных
      if (!Array.isArray(generatedCapsules)) {
        logger.warn('Invalid generated capsules', { type: typeof generatedCapsules });
        return [];
      }

      // Если капсул меньше 2, разнообразие не требуется
      if (generatedCapsules.length < 2) {
        return generatedCapsules;
      }

      const diverseCapsules = [];
      const maxSimilarity = 100 - minDifference; // Максимальная допустимая схожесть

      // Добавляем первую капсулу как базовую
      if (generatedCapsules[0]?.itemIds) {
        diverseCapsules.push(generatedCapsules[0]);
      }

      // Проверяем остальные капсулы
      for (let i = 1; i < generatedCapsules.length; i++) {
        const candidate = generatedCapsules[i];
        
        if (!candidate.itemIds || !Array.isArray(candidate.itemIds)) {
          continue;
        }

        let isDiverse = true;

        // Проверяем схожесть с уже добавленными капсулами
        for (const existing of diverseCapsules) {
          const similarity = this.calculateSimilarity(candidate.itemIds, existing.itemIds);
          
          // Если схожесть слишком высокая, капсула не разнообразна
          if (similarity > maxSimilarity) {
            logger.info('Capsule filtered due to low diversity', {
              similarity,
              maxSimilarity,
              candidateItems: candidate.itemIds.length,
              existingItems: existing.itemIds.length
            });
            isDiverse = false;
            break;
          }
        }

        // Добавляем капсулу если она достаточно разнообразна
        if (isDiverse) {
          diverseCapsules.push(candidate);
        }
      }

      logger.info('Diversity check completed', {
        originalCount: generatedCapsules.length,
        diverseCount: diverseCapsules.length,
        minDifference
      });

      return diverseCapsules;
    } catch (error) {
      logger.error('Error ensuring diversity', { 
        error: error.message,
        capsulesCount: generatedCapsules?.length
      });
      // В случае ошибки возвращаем исходный массив
      return generatedCapsules;
    }
  }

  /**
   * Получает детальную информацию о схожести капсулы с существующими
   * Полезно для отладки и предоставления информации пользователю
   * @param {number[]} newCapsuleItemIds - Массив ID вещей новой капсулы
   * @param {Array<{id: number, itemIds: number[]}>} existingCapsules - Массив существующих капсул
   * @returns {Array<{capsuleId: number, similarity: number}>} - Массив с информацией о схожести
   */
  getSimilarityDetails(newCapsuleItemIds, existingCapsules) {
    try {
      if (!Array.isArray(newCapsuleItemIds) || !Array.isArray(existingCapsules)) {
        return [];
      }

      return existingCapsules
        .filter(capsule => capsule.itemIds && Array.isArray(capsule.itemIds))
        .map(capsule => ({
          capsuleId: capsule.id,
          similarity: this.calculateSimilarity(newCapsuleItemIds, capsule.itemIds)
        }))
        .sort((a, b) => b.similarity - a.similarity); // Сортируем по убыванию схожести
    } catch (error) {
      logger.error('Error getting similarity details', { error: error.message });
      return [];
    }
  }
}

// Экспортируем singleton экземпляр
module.exports = new CapsuleSimilarityService();
