/**
 * Сервис для генерации капсул через AI
 * Управляет логикой приоритизации вещей, вычисления статистики использования и взаимодействия с API
 * ДЕЛЕГИРОВАНИЕ: ImageProcessingService для обработки изображений
 */

import { logger } from '../logger';
import { api } from '../api';
import { imageProcessingService } from '../shared/ImageProcessingService';
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

        // Светло-серый фон (как в основном canvas)
        ctx.fillStyle = '#f5f5f5';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Если нет вещей, возвращаем пустой canvas
        if (items.length === 0) {
          // ДЕЛЕГИРОВАНИЕ: используем ImageProcessingService
          imageProcessingService.canvasToBase64(canvas, { format: 'png', quality: 1.0 })
            .then(resolve)
            .catch(reject);
          return;
        }

        // ИСПОЛЬЗУЕМ УМНОЕ ПОЗИЦИОНИРОВАНИЕ: группируем по категориям и позиционируем как в основном canvas
        const positionedItems = this.calculatePreviewPositions(items, canvas.width, canvas.height);

        // Загружаем и рисуем изображения вещей с умным позиционированием
        const imagePromises = positionedItems.map((positionedItem) => {
          return new Promise<void>((resolveImg) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';

            img.onload = () => {
              const { position, scale } = positionedItem;

              // Вычисляем размеры с учетом масштаба
              const scaledWidth = img.width * scale;
              const scaledHeight = img.height * scale;
              
              // Центрируем изображение относительно позиции
              const x = position.x - scaledWidth / 2;
              const y = position.y - scaledHeight / 2;

              ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
              resolveImg();
            };

            img.onerror = () => {
              logger.warn('Failed to load image for preview', { imageUrl: positionedItem.item.imageUrl });
              resolveImg(); // Продолжаем даже если изображение не загрузилось
            };

            img.src = positionedItem.item.imageUrl || '';
          });
        });

        // Ждем загрузки всех изображений
        Promise.all(imagePromises)
          .then(() => {
            // ДЕЛЕГИРОВАНИЕ: используем ImageProcessingService
            imageProcessingService.canvasToBase64(canvas, { format: 'png', quality: 1.0 })
              .then(resolve)
              .catch(reject);
          })
          .catch(reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Рассчитать позиции для предпросмотра используя ту же логику, что и в UICanvasEditor
   * НОВЫЙ МЕТОД: Применяет умное позиционирование по категориям
   */
  private calculatePreviewPositions(items: WardrobeItem[], canvasWidth: number, canvasHeight: number): Array<{
    item: WardrobeItem;
    position: { x: number; y: number };
    scale: number;
  }> {
    const canvasCenterX = canvasWidth / 2;
    const canvasCenterY = canvasHeight / 2;

    // Группируем вещи по категориям
    const itemsByCategory: Record<string, WardrobeItem[]> = {};
    items.forEach(item => {
      const category = item.category?.toUpperCase() || 'BODYWEAR';
      if (!itemsByCategory[category]) {
        itemsByCategory[category] = [];
      }
      itemsByCategory[category]!.push(item);
    });

    const positionedItems: Array<{
      item: WardrobeItem;
      position: { x: number; y: number };
      scale: number;
    }> = [];

    // Позиционируем каждую категорию используя ТЕ ЖЕ СМЕЩЕНИЯ, что и в UICanvasEditor
    for (const [category, categoryItems] of Object.entries(itemsByCategory)) {
      for (let index = 0; index < categoryItems.length; index++) {
        const item = categoryItems[index]!;
        let x: number;
        let y: number;

        // ИСПОЛЬЗУЕМ ТЕ ЖЕ СМЕЩЕНИЯ, что и в calculateImagePosition
        switch (category) {
          case 'INNERWEAR':
          case 'BODYWEAR':
            x = canvasCenterX;
            y = canvasCenterY - 60; // Уменьшенное смещение для превью
            break;

          case 'LEGWEAR':
            x = canvasCenterX;
            y = canvasCenterY + 50; // Уменьшенное смещение для превью
            break;

          case 'FOOTWEAR':
            x = canvasCenterX;
            y = canvasCenterY + 110; // Уменьшенное смещение для превью
            break;

          case 'OUTERWEAR':
            x = canvasCenterX - 40; // Уменьшенное смещение для превью
            y = canvasCenterY - 50;
            break;

          case 'FULLBODY':
            x = canvasCenterX;
            y = canvasCenterY - 25;
            break;

          case 'HEADWEAR':
            x = canvasCenterX;
            y = canvasCenterY - 100; // Уменьшенное смещение для превью
            break;

          case 'ACCESSORIES':
            // Для аксессуаров используем случайное позиционирование
            const isLeftSide = Math.random() > 0.5;
            x = isLeftSide ? canvasCenterX - 75 : canvasCenterX + 75; // Уменьшенное смещение
            y = canvasCenterY - 25;
            break;

          default:
            x = canvasCenterX;
            y = canvasCenterY;
            break;
        }

        // Если несколько вещей в одной категории, добавляем горизонтальное смещение
        const itemCount = categoryItems.length;
        if (itemCount > 1) {
          const horizontalSpacing = Math.min(60, canvasWidth / (itemCount + 1)); // Уменьшенный spacing для превью
          
          if (itemCount === 2) {
            // Две вещи - слева и справа от базовой позиции
            x += (index === 0 ? -horizontalSpacing / 2 : horizontalSpacing / 2);
          } else {
            // Три и более - равномерно распределяем
            const startOffset = -(horizontalSpacing * (itemCount - 1)) / 2;
            x += startOffset + (index * horizontalSpacing);
          }

          // Небольшое вертикальное смещение для избежания полного перекрытия
          y += (index % 2 === 0 ? -10 : 10); // Уменьшенное смещение для превью
        }

        // Рассчитываем масштаб для превью (меньше чем в основном canvas)
        const scale = this.calculatePreviewScale(item, canvasWidth, canvasHeight);

        positionedItems.push({
          item,
          position: { x, y },
          scale
        });
      }
    }

    logger.debug('Preview positions calculated with smart positioning', {
      totalItems: items.length,
      categoriesCount: Object.keys(itemsByCategory).length
    });

    return positionedItems;
  }

  /**
   * Рассчитать масштаб для предпросмотра
   * НОВЫЙ МЕТОД: Использует адаптивный масштаб как в UICanvasEditor, но меньший для превью
   */
  private calculatePreviewScale(item: WardrobeItem, _canvasWidth: number, _canvasHeight: number): number {
    const category = item.category?.toUpperCase() || '';

    // Базовый масштаб для превью (меньше чем в основном canvas)
    let baseScale = 0.15; // 15% для превью (вместо 25-40% в основном canvas)

    // ИСПРАВЛЕННЫЕ коэффициенты по категориям для лучшего баланса
    switch (category) {
      case 'OUTERWEAR':
        baseScale = 0.1; // Верхняя одежда крупнее (куртка ОК)
        break;
      case 'INNERWEAR':
        baseScale = 0.1; // УВЕЛИЧЕНО: кофта должна быть больше футболки
        break;
      case 'BODYWEAR':
        baseScale = 0.1; // Футболка чуть меньше кофты
        break;
      case 'LEGWEAR':
        baseScale = 0.15; // УМЕНЬШЕНО: джинсы были слишком большие
        break;
      case 'FOOTWEAR':
        baseScale = 0.15;
        break;
      case 'HEADWEAR':
        baseScale = 0.11;
        break;
      case 'ACCESSORIES':
        baseScale = 0.09; // Аксессуары мельче
        break;
      case 'FULLBODY':
        baseScale = 0.22; // Полный образ крупнее
        break;
    }

    return baseScale;
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
