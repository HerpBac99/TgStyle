/**
 * Сервис для генерации капсул через AI
 * Управляет логикой приоритизации вещей, вычисления статистики использования и взаимодействия с API
 */

import { logger } from '../logger';
import { api } from '../api';
import type { 
  WardrobeItemWithUsage,
  GenerationRequest,
  GenerationResponse 
} from '@/types/index';
import type { WardrobeItem } from '@/types/wardrobe';

/**
 * Интерфейс для капсулы с canvasData
 */
interface CapsuleWithCanvas {
  id: number;
  canvasData: any;
}

/**
 * Класс для управления генерацией капсул
 */
export class CapsuleGenerationService {
  private excludedCombinations: number[][] = [];

  /**
   * Генерировать капсулы через API
   */
  async generateCapsules(
    wardrobeItems: WardrobeItem[],
    existingCapsules: CapsuleWithCanvas[]
  ): Promise<GenerationResponse> {
    try {
      // Проверка минимального количества вещей
      if (!this.checkMinimumItems(wardrobeItems)) {
        return {
          success: false,
          error: 'Добавьте больше вещей в гардероб для генерации капсул (минимум 3)'
        };
      }

      // Вычисляем usageCount для каждой вещи
      const itemsWithUsage = this.calculateUsageCount(wardrobeItems, existingCapsules);

      // Приоритизируем редко используемые вещи (1-3)
      const prioritizedItems = this.prioritizeRarelyUsedItems(itemsWithUsage);

      // Определяем текущий сезон
      const currentSeason = this.getCurrentSeason();

      logger.info('Generating capsules', {
        itemsCount: prioritizedItems.length,
        currentSeason,
        excludedCombinations: this.excludedCombinations.length,
        wardrobeItems: prioritizedItems.map(item => ({
          id: item.id,
          category: item.category,
          color: item.color,
          usageCount: item.usageCount,
          imageUrl: item.imageUrl
        }))
      });

      // Формируем запрос
      const request: GenerationRequest = {
        wardrobeItems: prioritizedItems,
        existingCapsules: existingCapsules
      };

      // Добавляем excludeCombinations только если есть исключения
      if (this.excludedCombinations.length > 0) {
        request.excludeCombinations = this.excludedCombinations;
      }

      // Отправляем запрос на сервер
      const response = await api.post<GenerationResponse>(
        '/capsules/generate',
        request,
        30000 // 30 секунд таймаут для генерации
      );

      if (response.success && response.capsules) {
        logger.info('Capsules generated successfully', {
          count: response.capsules.length,
          capsules: response.capsules.map(capsule => ({
            id: capsule.id,
            name: capsule.name,
            itemIds: capsule.itemIds,
            itemsCount: capsule.items?.length || 0,
            items: capsule.items?.map(item => ({
              id: item.id,
              category: item.category,
              imageUrl: item.imageUrl
            }))
          }))
        });

        // Создаем превью для каждой капсулы
        const capsulesWithPreviews = await Promise.all(
          response.capsules.map(async (capsule) => {
            try {
              const previewDataUrl = await this.createPreview(capsule.items);
              return { ...capsule, previewDataUrl };
            } catch (error) {
              logger.error('Failed to create preview', {
                capsuleId: capsule.id,
                error: error instanceof Error ? error.message : String(error)
              });
              return capsule;
            }
          })
        );

        return {
          success: true,
          capsules: capsulesWithPreviews
        };
      }

      return response;
    } catch (error) {
      logger.error('Failed to generate capsules', {
        error: error instanceof Error ? error.message : String(error)
      });

      // Обработка специфичных ошибок
      if (error instanceof Error) {
        if (error.message.includes('timeout') || error.message.includes('Превышено время')) {
          return {
            success: false,
            error: 'Генерация заняла слишком много времени. Попробуйте снова'
          };
        }
        
        if (error.message.includes('сеть') || error.message.includes('Network')) {
          return {
            success: false,
            error: 'Ошибка сети. Проверьте подключение'
          };
        }
      }

      return {
        success: false,
        error: 'Не удалось сгенерировать капсулы. Попробуйте позже'
      };
    }
  }

  /**
   * Вычислить usageCount для каждой вещи на основе существующих капсул
   */
  calculateUsageCount(
    wardrobeItems: WardrobeItem[],
    capsules: CapsuleWithCanvas[]
  ): WardrobeItemWithUsage[] {
    // Создаем Map для быстрого подсчета
    const usageMap = new Map<number, number>();

    // Инициализируем счетчики
    wardrobeItems.forEach(item => usageMap.set(item.id, 0));

    // Подсчитываем использование в капсулах
    capsules.forEach(capsule => {
      const itemIds = this.extractItemIdsFromCanvas(capsule.canvasData);
      itemIds.forEach(id => {
        if (usageMap.has(id)) {
          usageMap.set(id, (usageMap.get(id) || 0) + 1);
        }
      });
    });

    // Добавляем usageCount к каждой вещи
    return wardrobeItems.map(item => ({
      ...item,
      usageCount: usageMap.get(item.id) || 0
    }));
  }

  /**
   * Извлечь ID вещей из canvasData капсулы
   */
  private extractItemIdsFromCanvas(canvasData: any): number[] {
    if (!canvasData || !canvasData.objects) {
      return [];
    }

    return canvasData.objects
      .filter((obj: any) => obj.wardrobeItemId)
      .map((obj: any) => obj.wardrobeItemId);
  }

  /**
   * Приоритизировать редко используемые вещи (1-3)
   */
  prioritizeRarelyUsedItems(items: WardrobeItemWithUsage[]): WardrobeItemWithUsage[] {
    // Сортируем по приоритету:
    // 1. Высокий приоритет: usageCount 1-3 (одобрены, но используются редко)
    // 2. Средний приоритет: usageCount 3+ (популярные)
    // 3. Низкий приоритет: usageCount 0 (новые, возможно нелюбимые)
    return items.sort((a, b) => {
      const aScore = this.getPriorityScore(a.usageCount);
      const bScore = this.getPriorityScore(b.usageCount);
      return bScore - aScore; // Сортируем по убыванию приоритета
    });
  }

  /**
   * Получить приоритет вещи на основе usageCount
   */
  private getPriorityScore(usageCount: number): number {
    if (usageCount >= 1 && usageCount <= 3) return 3; // Высокий приоритет
    if (usageCount > 3) return 2; // Средний приоритет (популярные)
    return 1; // Низкий приоритет (новые, возможно нелюбимые)
  }

  /**
   * Определить текущий сезон по месяцу
   */
  getCurrentSeason(): string {
    const month = new Date().getMonth() + 1; // 1-12
    
    if (month >= 12 || month <= 2) return 'winter';
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    return 'autumn'; // 9-11
  }

  /**
   * Получить название текущего месяца на русском
   * (Зарезервировано для будущего использования)
   */
  // private getCurrentMonth(): string {
  //   const months = [
  //     'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  //     'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'
  //   ];
  //   return months[new Date().getMonth()];
  // }

  /**
   * Проверить минимальное количество вещей (3+)
   */
  checkMinimumItems(items: WardrobeItem[]): boolean {
    return items.length >= 3;
  }

  /**
   * Создать превью canvas в base64
   */
  async createPreview(items: WardrobeItem[]): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        // Создаем временный canvas
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 400;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Белый фон
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Если нет вещей, возвращаем пустой canvas
        if (items.length === 0) {
          resolve(canvas.toDataURL('image/png'));
          return;
        }

        // Загружаем и рисуем изображения вещей
        const imagePromises = items.slice(0, 4).map((item, index) => {
          return new Promise<void>((resolveImg) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            img.onload = () => {
              // Вычисляем позицию для сетки 2x2
              const col = index % 2;
              const row = Math.floor(index / 2);
              const cellWidth = canvas.width / 2;
              const cellHeight = canvas.height / 2;
              const x = col * cellWidth;
              const y = row * cellHeight;

              // Вычисляем размеры с сохранением пропорций
              const scale = Math.min(
                cellWidth / img.width,
                cellHeight / img.height
              ) * 0.8; // 80% от размера ячейки для отступов

              const scaledWidth = img.width * scale;
              const scaledHeight = img.height * scale;
              const offsetX = x + (cellWidth - scaledWidth) / 2;
              const offsetY = y + (cellHeight - scaledHeight) / 2;

              ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);
              resolveImg();
            };

            img.onerror = () => {
              logger.warn('Failed to load image for preview', { imageUrl: item.imageUrl });
              resolveImg(); // Продолжаем даже если изображение не загрузилось
            };

            img.src = item.imageUrl || '';
          });
        });

        // Ждем загрузки всех изображений
        Promise.all(imagePromises)
          .then(() => {
            // Если вещей больше 4, добавляем счетчик
            if (items.length > 4) {
              ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
              ctx.fillRect(canvas.width / 2, canvas.height / 2, canvas.width / 2, canvas.height / 2);
              
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 48px Arial';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(
                `+${items.length - 4}`,
                canvas.width * 0.75,
                canvas.height * 0.75
              );
            }

            resolve(canvas.toDataURL('image/png'));
          })
          .catch(reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Добавить комбинацию в список исключений для регенерации
   */
  addExcludedCombination(itemIds: number[]): void {
    this.excludedCombinations.push(itemIds);
    logger.info('Added excluded combination', { itemIds });
  }

  /**
   * Очистить список исключенных комбинаций
   */
  clearExcludedCombinations(): void {
    this.excludedCombinations = [];
    logger.info('Cleared excluded combinations');
  }

  /**
   * Получить количество исключенных комбинаций
   */
  getExcludedCombinationsCount(): number {
    return this.excludedCombinations.length;
  }
}

// Экспортируем singleton экземпляр
export const capsuleGenerationService = new CapsuleGenerationService();
