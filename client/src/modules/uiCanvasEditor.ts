/**
 * Унифицированный редактор canvas для капсул
 * Использует Fabric.js для манипуляций с изображениями одежды
 * 
 * SINGLETON PATTERN: Используется единственный экземпляр для всей сессии
 * Это предотвращает повторную инициализацию и утечки памяти
 */

import { logger } from './logger';
import { imageProcessingService } from './shared/ImageProcessingService';
import { WardrobeItem } from './photoUploadManager';
import type { GeneratedCapsule } from '@/types/capsules';
import * as fabric from 'fabric';

// Делаем fabric доступным глобально для совместимости
(window as any).fabric = fabric;

/**
 * Конфигурация canvas editor
 */
export interface CanvasEditorConfig {
  containerId: string;  // ID контейнера canvas
  canvasId: string;     // ID элемента canvas
  onAddItem?: () => void;  // Callback для кнопки "Добавить одежду"
  onNext?: () => void;     // Callback для кнопки "Далее"
  onItemDeleted?: (itemId: number) => void;  // Callback при удалении элемента с канваса
}

/**
 * Элемент для добавления на canvas
 */
export interface CanvasItem {
  item: WardrobeItem;        // Данные элемента гардероба
  position?: { x: number; y: number };  // Сохраненная позиция (если есть)
  scale?: number;            // Сохраненный масштаб
  angle?: number;            // Сохраненный угол поворота
}

/**
 * Состояние canvas для сохранения
 */
export interface CanvasState {
  canvasData: any;      // Данные canvas (объекты, позиции)
  thumbnailImage: string;  // base64 thumbnail с удаленным фоном
}

/**
 * Унифицированный редактор canvas (Singleton)
 */
export class UICanvasEditor {
  // Singleton instance
  private static instance: UICanvasEditor | null = null;

  // Константа для цвета фона canvas (белый - совпадает с фоном вещей из гардероба)
  private static readonly CANVAS_BACKGROUND_COLOR = '#f5f5f5'; /*Capsule color*/

  private fabricCanvas: fabric.Canvas | null = null;
  private config: CanvasEditorConfig;
  private cleanupFunctions: (() => void)[] = [];
  private isVisible: boolean = false;

  // Приватный конструктор для Singleton
  private constructor(config: CanvasEditorConfig) {
    this.config = config;
  }

  /**
   * Получить единственный экземпляр UICanvasEditor (Singleton)
   * 
   * @param config - Конфигурация (используется только при первом вызове)
   * @returns Единственный экземпляр UICanvasEditor
   */
  static getInstance(config: CanvasEditorConfig): UICanvasEditor {
    if (!UICanvasEditor.instance) {
      UICanvasEditor.instance = new UICanvasEditor(config);
    } else {
      // Обновляем callbacks если они изменились
      UICanvasEditor.instance.updateConfig(config);
    }
    return UICanvasEditor.instance;
  }

  /**
   * Обновить конфигурацию (callbacks)
   * Используется когда getInstance вызывается с новыми callbacks
   */
  private updateConfig(config: CanvasEditorConfig): void {
    const configChanged =
      this.config.onAddItem !== config.onAddItem ||
      this.config.onNext !== config.onNext;

    if (configChanged) {
      // Обновляем callbacks (с проверкой на undefined)
      if (config.onAddItem !== undefined) {
        this.config.onAddItem = config.onAddItem;
      }
      if (config.onNext !== undefined) {
        this.config.onNext = config.onNext;
      }

      // Переустанавливаем обработчики кнопок с новыми callbacks
      if (this.fabricCanvas) {
        this.setupCanvasButtons();
      }
    }
  }

  // ============================================
  // ПУБЛИЧНЫЕ МЕТОДЫ - УПРАВЛЕНИЕ ВИДИМОСТЬЮ
  // ============================================

  /**
   * Показать canvas
   */
  show(): void {
    const container = document.getElementById(this.config.containerId);
    if (container) {
      container.classList.remove('hidden');
      this.isVisible = true;
      logger.info('Canvas container shown');
    } else {
      logger.error('Canvas container not found', { containerId: this.config.containerId });
      throw new Error(`Canvas container not found: ${this.config.containerId}`);
    }
  }

  /**
   * Скрыть canvas
   */
  hide(): void {
    const container = document.getElementById(this.config.containerId);
    if (container) {
      container.classList.add('hidden');
      this.isVisible = false;
      logger.info('Canvas container hidden');
    }
  }

  // ============================================
  // ПУБЛИЧНЫЕ МЕТОДЫ - ИНИЦИАЛИЗАЦИЯ
  // ============================================

  /**
   * Инициализировать Fabric.js canvas
   * ВАЖНО: Вызывать только после show()
   */
  initializeCanvas(): void {
    // Если canvas уже инициализирован - просто показываем
    if (this.fabricCanvas) {
      return;
    }

    try {
      const canvasElement = document.getElementById(this.config.canvasId) as HTMLCanvasElement;
      if (!canvasElement) {
        throw new Error(`Canvas element not found: ${this.config.canvasId}`);
      }

      if (!window.fabric || !window.fabric.Canvas) {
        throw new Error('Fabric.js not loaded');
      }

      const containerElement = document.getElementById(this.config.containerId);
      const containerRect = containerElement ? containerElement.getBoundingClientRect() : null;

      const canvasWidth = containerRect ? containerRect.width : window.innerWidth;
      const canvasHeight = containerRect ? containerRect.height : window.innerHeight;

      if (canvasWidth <= 0 || canvasHeight <= 0) {
        throw new Error(`Invalid canvas dimensions: ${canvasWidth}x${canvasHeight}`);
      }

      canvasElement.width = canvasWidth;
      canvasElement.height = canvasHeight;
      canvasElement.style.width = canvasWidth + 'px';
      canvasElement.style.height = canvasHeight + 'px';

      this.fabricCanvas = new fabric.Canvas(this.config.canvasId, {
        width: canvasWidth,
        height: canvasHeight,
        backgroundColor: UICanvasEditor.CANVAS_BACKGROUND_COLOR,
        selection: false,
        allowTouchScrolling: false,
        perPixelTargetFind: true,
        targetFindTolerance: 15,
        skipTargetFind: false,
        enableRetinaScaling: true
      });

      // Устанавливаем цвет фона
      this.fabricCanvas.backgroundColor = UICanvasEditor.CANVAS_BACKGROUND_COLOR;
      this.fabricCanvas.renderAll();

      // Настраиваем обработчик выделения объектов
      this.setupSelectionHandlers();

      // Настраиваем кнопки
      this.setupCanvasButtons();

    } catch (error) {
      logger.error('Failed to initialize Fabric.js canvas', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  // ============================================
  // ПУБЛИЧНЫЕ МЕТОДЫ - ЗАГРУЗКА/ДОБАВЛЕНИЕ
  // ============================================

  /**
   * УНИФИЦИРОВАННЫЙ МЕТОД: Загрузить элементы на canvas
   * Используется для:
   * 1. Создания новой капсулы (без сохраненных позиций)
   * 2. Редактирования капсулы (с сохраненными позициями)
   * 
   * ОПТИМИЗАЦИЯ: Переиспользует существующие объекты если они уже на canvas
   * 
   * @param items - Массив элементов для добавления
   */
  async loadItems(items: CanvasItem[]): Promise<void> {
    if (!this.fabricCanvas) {
      logger.error('Canvas not initialized, cannot load items');
      throw new Error('Canvas not initialized');
    }

    logger.info('Loading items to canvas', { itemsCount: items.length });

    // Получаем текущие объекты на canvas
    const existingObjects = this.fabricCanvas.getObjects();
    const existingItemIds = new Set<number>();

    existingObjects.forEach(obj => {
      const fabricObj = obj as any;
      const itemData = fabricObj.itemData || fabricObj._element?.itemData;
      if (itemData && itemData.id) {
        existingItemIds.add(itemData.id);
      }
    });

    // Определяем какие элементы нужно добавить, а какие уже есть
    const itemsToAdd: CanvasItem[] = [];
    const itemIdsToKeep = new Set<number>();

    items.forEach(canvasItem => {
      itemIdsToKeep.add(canvasItem.item.id);
      if (!existingItemIds.has(canvasItem.item.id)) {
        itemsToAdd.push(canvasItem);
      }
    });

    // Удаляем объекты, которых нет в новом списке
    const itemIdsToRemove: number[] = [];
    existingItemIds.forEach(id => {
      if (!itemIdsToKeep.has(id)) {
        itemIdsToRemove.push(id);
      }
    });

    if (itemIdsToRemove.length > 0) {
      await this.removeItems(itemIdsToRemove);
    }

    // Если нужно полностью очистить и загрузить заново
    if (itemsToAdd.length === items.length) {
      this.fabricCanvas.clear();
      this.fabricCanvas.backgroundColor = UICanvasEditor.CANVAS_BACKGROUND_COLOR;
      this.fabricCanvas.renderAll();
    }

    // Добавляем только новые элементы
    if (itemsToAdd.length > 0) {
      for (const canvasItem of itemsToAdd) {
        await this.addItem(canvasItem);
      }
    }

    this.fabricCanvas.renderAll();
  }

  /**
   * Загрузить сгенерированную капсулу на canvas
   * Автоматически позиционирует вещи по категориям
   * 
   * @param capsule - Сгенерированная капсула с вещами
   */
  async loadGeneratedCapsule(capsule: GeneratedCapsule): Promise<void> {
    if (!this.fabricCanvas) {
      logger.error('Canvas not initialized, cannot load generated capsule');
      throw new Error('Canvas not initialized');
    }

    // Очищаем canvas
    this.fabricCanvas.clear();
    this.fabricCanvas.backgroundColor = UICanvasEditor.CANVAS_BACKGROUND_COLOR;
    this.fabricCanvas.renderAll();

    // ИСПРАВЛЕНО: Ждем асинхронное позиционирование вещей
    const positionedItems = await this.autoPositionItems(capsule.items);

    // Загружаем элементы последовательно для сохранения порядка слоев
    for (const canvasItem of positionedItems) {
      await this.addItem(canvasItem);
    }

    this.fabricCanvas.renderAll();
    logger.info('Generated capsule loaded to canvas successfully');
  }

  /**
   * Автоматически позиционировать вещи на canvas по категориям
   * Порядок сверху вниз: outerwear → innerwear → bodywear → legwear → footwear
   * 
   * @param items - Массив вещей для позиционирования
   * @returns Массив элементов с рассчитанными позициями
   */
  private async autoPositionItems(items: WardrobeItem[]): Promise<CanvasItem[]> {
    if (!this.fabricCanvas) {
      throw new Error('Canvas not initialized');
    }

    const canvasWidth = this.fabricCanvas.width!;
    const canvasHeight = this.fabricCanvas.height!;
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

    const positionedItems: CanvasItem[] = [];

    // Определяем правильный порядок слоев (снизу вверх для z-index)
    const layerOrder = [
      'INNERWEAR',
      'LEGWEAR',
      'BODYWEAR',
      'FOOTWEAR',  
      'OUTERWEAR',  
      'FULLBODY',    
      'HEADWEAR',    
      'ACCESSORIES'  
    ];

    // Позиционируем каждую категорию в правильном порядке
    for (const category of layerOrder) {
      const categoryItems = itemsByCategory[category];
      if (!categoryItems) continue;
      for (let index = 0; index < categoryItems.length; index++) {
        const item = categoryItems[index]!;
        let x: number;
        let y: number;

        // ИСПОЛЬЗУЕМ ТЕ ЖЕ СМЕЩЕНИЯ, что и в calculateImagePosition
        switch (category) {
          case 'INNERWEAR':
          case 'BODYWEAR':
            x = canvasCenterX;
            y = canvasCenterY - 100;
            break;

          case 'LEGWEAR':
            x = canvasCenterX;
            y = canvasCenterY + 90;
            break;

          case 'FOOTWEAR':
            x = canvasCenterX;
            y = canvasCenterY + 220;
            break;

          case 'OUTERWEAR':
            x = canvasCenterX - 80;
            y = canvasCenterY - 100;
            break;

          case 'FULLBODY':
            x = canvasCenterX;
            y = canvasCenterY - 50;
            break;

          case 'HEADWEAR':
            x = canvasCenterX;
            y = canvasCenterY - 200;
            break;

          case 'ACCESSORIES':
            // Для аксессуаров используем случайное позиционирование, как в calculateImagePosition
            const isLeftSide = Math.random() > 0.5;
            x = isLeftSide ? canvasCenterX - 150 : canvasCenterX + 150;
            y = canvasCenterY - 50;
            break;

          default:
            x = canvasCenterX;
            y = canvasCenterY;
            break;
        }

        // Если несколько вещей в одной категории, добавляем горизонтальное смещение
        const itemCount = categoryItems.length;
        if (itemCount > 1) {
          const horizontalSpacing = Math.min(120, canvasWidth / (itemCount + 1));

          if (itemCount === 2) {
            // Две вещи - слева и справа от базовой позиции
            x += (index === 0 ? -horizontalSpacing / 2 : horizontalSpacing / 2);
          } else {
            // Три и более - равномерно распределяем
            const startOffset = -(horizontalSpacing * (itemCount - 1)) / 2;
            x += startOffset + (index * horizontalSpacing);
          }

          // Небольшое вертикальное смещение для избежания полного перекрытия
          y += (index % 2 === 0 ? -20 : 20);
        }

        // ИСПРАВЛЕНО: Теперь ждем асинхронный расчет масштаба
        const scale = await this.calculateAutoScale(item);

        positionedItems.push({
          item,
          position: { x, y },
          scale,
          angle: 0
        });
      }
    }

    return positionedItems;
  }

  /**
   * Вычислить автоматический масштаб для вещи
   * ИСПРАВЛЕНО: Теперь учитывает размер изображения, как в calculateImagePosition
   */
  private async calculateAutoScale(item: WardrobeItem): Promise<number> {
    if (!this.fabricCanvas) {
      return 0.3;
    }

    const canvasWidth = this.fabricCanvas.width!;
    const canvasHeight = this.fabricCanvas.height!;
    const category = item.category?.toUpperCase() || '';

    try {
      // Загружаем изображение для получения его размеров
      const imageObj = await this.loadImage(item.imageUrl);
      const imgWidth = imageObj.naturalWidth;
      const imgHeight = imageObj.naturalHeight;

      // ИСПОЛЬЗУЕМ ТОТ ЖЕ АЛГОРИТМ, что и в calculateImagePosition
      let baseScale = Math.min(
        (canvasWidth * 0.4) / imgWidth,    // 40% от ширины canvas
        (canvasHeight * 0.4) / imgHeight   // 40% от высоты canvas
      );

      // Применяем те же коэффициенты по категориям
      if (category === 'OUTERWEAR') {
        baseScale *= 1.5;
      }
      else if (category === 'INNERWEAR' || category === 'BODYWEAR') {
        baseScale *= 1.3;
      }
      else if (category === 'LEGWEAR') {
        baseScale *= 1.5;
      }
      else if (category === 'FOOTWEAR') {
        baseScale *= 0.8;
      }
      else if (category === 'HEADWEAR') {
        baseScale *= 0.8;
      }
      else if (category === 'ACCESSORIES') {
        baseScale *= 0.7;
      }
      else if (category === 'FULLBODY') {
        baseScale *= 1.4;
      }

      return baseScale;

    } catch (error) {
      logger.error('Failed to load image for scale calculation, using fallback', {
        itemId: item.id,
        error: error instanceof Error ? error.message : String(error)
      });

      // Fallback к старому алгоритму
      switch (category) {
        case 'OUTERWEAR': return 0.35;
        case 'INNERWEAR':
        case 'BODYWEAR': return 0.30;
        case 'LEGWEAR': return 0.28;
        case 'FOOTWEAR': return 0.22;
        case 'HEADWEAR': return 0.18;
        case 'ACCESSORIES': return 0.15;
        case 'FULLBODY': return 0.40;
        default: return 0.25;
      }
    }
  }

  /**
   * Добавить один элемент на canvas
   * 
   * @param canvasItem - Элемент с опциональными сохраненными параметрами
   */
  async addItem(canvasItem: CanvasItem): Promise<void> {
    if (!this.fabricCanvas) {
      throw new Error('Canvas not initialized');
    }

    const { item, position, scale, angle } = canvasItem;

    // Проверяем URL
    if (!this.isValidImageUrl(item.imageUrl)) {
      logger.error('Invalid image URL', { itemId: item.id, url: item.imageUrl });
      throw new Error(`Invalid URL for item ${item.id}`);
    }

    // Загружаем изображение
    const imageObj = await this.loadImage(item.imageUrl);

    // Вычисляем параметры
    let finalX: number;
    let finalY: number;
    let finalScale: number;
    let finalAngle: number;

    if (position && scale !== undefined) {
      // Используем сохраненные параметры (режим редактирования)
      finalX = position.x;
      finalY = position.y;
      finalScale = scale;
      finalAngle = angle || 0;
    } else {
      // Рассчитываем автоматически (режим создания)
      const calculated = this.calculateImagePosition(imageObj, item);
      finalX = calculated.x;
      finalY = calculated.y;
      finalScale = calculated.scale;
      finalAngle = 0;
    }

    // Добавляем на canvas
    this.addImageToCanvas(imageObj, item, finalX, finalY, finalScale, finalAngle);
  }

  /**
   * ИНКРЕМЕНТАЛЬНОЕ ДОБАВЛЕНИЕ: Добавить несколько элементов на canvas
   * Не очищает существующие элементы, только добавляет новые
   * 
   * @param items - Массив элементов для добавления
   */
  async addItems(items: CanvasItem[]): Promise<void> {
    if (!this.fabricCanvas) {
      throw new Error('Canvas not initialized');
    }

    // Добавляем элементы последовательно для сохранения порядка слоев
    for (const canvasItem of items) {
      await this.addItem(canvasItem);
    }

    this.fabricCanvas.renderAll();
    logger.info('Items added to canvas successfully');
  }

  /**
   * ИНКРЕМЕНТАЛЬНОЕ УДАЛЕНИЕ: Удалить несколько элементов с canvas по ID
   * 
   * @param itemIds - Массив ID элементов для удаления
   * @returns Количество удаленных элементов
   */
  async removeItems(itemIds: number[]): Promise<number> {
    if (!this.fabricCanvas) {
      logger.error('Canvas not initialized');
      return 0;
    }

    logger.info('Removing items from canvas', { itemIds });

    let removedCount = 0;
    const objects = this.fabricCanvas.getObjects();

    for (const obj of objects) {
      const fabricObj = obj as any;
      const itemData = fabricObj.itemData || fabricObj._element?.itemData;

      if (itemData && itemIds.includes(itemData.id)) {
        this.fabricCanvas.remove(obj);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.fabricCanvas.renderAll();
      logger.info('Items removed from canvas', { removedCount });
    }

    return removedCount;
  }

  // ============================================
  // ПУБЛИЧНЫЕ МЕТОДЫ - СОСТОЯНИЕ
  // ============================================

  /**
   * Получить fabric canvas (для sharing и других операций)
   */
  getCanvas(): fabric.Canvas | null {
    return this.fabricCanvas;
  }

  /**
   * Получить текущее состояние canvas для сохранения
   * @param _removeBackground - DEPRECATED: Параметр больше не используется. Canvas автоматически обрезается по содержимому.
   */
  async getState(_removeBackground: boolean = false): Promise<CanvasState> {
    if (!this.fabricCanvas) {
      throw new Error('Canvas not initialized');
    }

    const objects = this.fabricCanvas.getObjects();

    // Собираем актуальные selected_items из объектов на canvas
    const currentSelectedItems = objects
      .map(obj => {
        const fabricObj = obj as any;
        return fabricObj.itemData || fabricObj._element?.itemData;
      })
      .filter(item => item) // убираем undefined
      .filter((item, index, arr) =>
        arr.findIndex(i => i.id === item.id) === index // убираем дубликаты
      );

    const canvasData = {
      selected_items: currentSelectedItems,
      canvas: {
        width: this.fabricCanvas.width,
        height: this.fabricCanvas.height,
        backgroundColor: this.fabricCanvas.backgroundColor,
        objects: objects.map(obj => {
          const fabricObj = obj as any;
          return {
            id: fabricObj.id || fabricObj.itemId,
            type: fabricObj.type,
            left: fabricObj.left,
            top: fabricObj.top,
            scaleX: fabricObj.scaleX,
            scaleY: fabricObj.scaleY,
            angle: fabricObj.angle,
            width: fabricObj.width,
            height: fabricObj.height,
            originX: fabricObj.originX,
            originY: fabricObj.originY,
            itemData: fabricObj.itemData || fabricObj._element?.itemData
          };
        })
      }
    };

    // Получаем thumbnail с автоматической обрезкой (removeBackground игнорируется)
    const thumbnailImage = await this.canvasToImage(false);

    return {
      canvasData,
      thumbnailImage: thumbnailImage || '' // Гарантируем, что thumbnailImage не undefined
    };
  }

  /**
   * Восстановить состояние canvas из сохраненных данных
   * 
   * @param savedData - Данные canvas из БД
   */
  async restoreState(savedData: any): Promise<void> {
    if (!this.fabricCanvas) {
      throw new Error('Canvas not initialized');
    }

    // Очищаем canvas
    this.fabricCanvas.clear();
    // Используем сохраненный фон или цвет по умолчанию
    this.fabricCanvas.backgroundColor = savedData.canvas?.backgroundColor || UICanvasEditor.CANVAS_BACKGROUND_COLOR;
    this.fabricCanvas.renderAll();

    // Если нет объектов для отрисовки
    if (!savedData.canvas?.objects || savedData.canvas.objects.length === 0) {
      logger.error('No objects to restore in canvas');
      return;
    }

    // Создаем map элементов по ID для быстрого поиска
    const selectedItemsMap = new Map<number, number>();
    if (savedData.selected_items) {
      savedData.selected_items.forEach((item: WardrobeItem, index: number) => {
        selectedItemsMap.set(index, item.id);
      });
    }

    // Восстанавливаем каждый объект
    for (let i = 0; i < savedData.canvas.objects.length; i++) {
      const objData = savedData.canvas.objects[i];

      // Находим элемент гардероба
      let wardrobeItem: WardrobeItem | null = null;

      if (objData.itemData) {
        wardrobeItem = objData.itemData;
      } else if (savedData.selected_items && savedData.selected_items[i]) {
        wardrobeItem = savedData.selected_items[i];
      } else {
        logger.error('No wardrobe item found for canvas object', { index: i, objData });
        continue;
      }

      // Проверяем что wardrobeItem не null
      if (!wardrobeItem) {
        logger.error('Wardrobe item is null, skipping', { index: i });
        continue;
      }

      // Добавляем элемент с сохраненными параметрами (с обработкой ошибок)
      try {
        await this.addItem({
          item: wardrobeItem,
          position: { x: objData.left, y: objData.top },
          scale: objData.scaleX, // используем scaleX как единый масштаб
          angle: objData.angle || 0
        });
      } catch (error) {
        logger.error('Failed to restore canvas item, skipping', {
          index: i,
          itemId: wardrobeItem.id,
          error: error instanceof Error ? error.message : String(error)
        });
        // Продолжаем с остальными элементами
        continue;
      }
    }

    this.fabricCanvas.renderAll();
    logger.info('Canvas state restored successfully');
  }

  // ============================================
  // ПУБЛИЧНЫЕ МЕТОДЫ - ОЧИСТКА
  // ============================================

  /**
   * Получить ID всех элементов на canvas (синхронно)
   */
  getItemIds(): number[] {
    if (!this.fabricCanvas) {
      return [];
    }

    const objects = this.fabricCanvas.getObjects();
    const itemIds: number[] = [];

    objects.forEach(obj => {
      const fabricObj = obj as any;
      const itemData = fabricObj.itemData || fabricObj._element?.itemData;
      if (itemData && itemData.id) {
        itemIds.push(itemData.id);
      }
    });

    return itemIds;
  }

  /**
   * Удалить элемент с canvas по ID
   */
  async removeItemById(itemId: number): Promise<boolean> {
    if (!this.fabricCanvas) {
      logger.error('Canvas not initialized');
      return false;
    }

    const objects = this.fabricCanvas.getObjects();
    let removed = false;

    for (const obj of objects) {
      const fabricObj = obj as any;
      const itemData = fabricObj.itemData || fabricObj._element?.itemData;

      if (itemData && itemData.id === itemId) {
        this.fabricCanvas.remove(obj);
        removed = true;
        logger.info('Item removed from canvas', { itemId });
      }
    }

    if (removed) {
      this.fabricCanvas.renderAll();
    }

    return removed;
  }

  /**
   * Очистить canvas
   */
  clear(): void {
    if (this.fabricCanvas) {
      this.fabricCanvas.clear();
      this.fabricCanvas.backgroundColor = UICanvasEditor.CANVAS_BACKGROUND_COLOR;
      this.fabricCanvas.renderAll();
      logger.info('Canvas cleared');
    }
  }

  /**
   * Уничтожить canvas editor
   */
  destroy(): void {
    logger.info('Destroying UICanvasEditor');

    // Очищаем обработчики
    this.cleanup();

    // Уничтожаем canvas
    if (this.fabricCanvas) {
      this.fabricCanvas.dispose();
      this.fabricCanvas = null;
    }

    this.isVisible = false;
  }

  // ============================================
  // ПРИВАТНЫЕ МЕТОДЫ - НАСТРОЙКА
  // ============================================

  /**
   * Настроить обработчики выделения объектов
   * При выделении объект автоматически поднимается на самый верх
   * ОПТИМИЗАЦИЯ: Отслеживает изменения для установки флага dirty
   */
  private setupSelectionHandlers(): void {
    if (!this.fabricCanvas) {
      return;
    }

    const handleSelection = (e: any) => {
      const selectedObject = e.selected?.[0];
      if (selectedObject && this.fabricCanvas) {
        // Поднимаем выделенный объект на самый верх
        // В Fabric.js используется метод canvas.bringObjectToFront()
        const canvas = this.fabricCanvas as any;
        if (canvas.bringObjectToFront) {
          canvas.bringObjectToFront(selectedObject);
          this.fabricCanvas.renderAll();

          logger.debug('Object brought to front on selection', {
            itemId: (selectedObject as any).id
          });
        }
      }
    };

    // Обработчик для первого выделения объекта
    this.fabricCanvas.on('selection:created', handleSelection);

    // Обработчик для смены выделения (когда выбираем другой объект)
    this.fabricCanvas.on('selection:updated', handleSelection);

    // ОПТИМИЗАЦИЯ: Отслеживаем изменения объектов для установки флага dirty
    this.fabricCanvas.on('object:modified', () => {
      // Отправляем событие об изменении canvas
      window.dispatchEvent(new CustomEvent('canvas:modified'));
    });

    this.fabricCanvas.on('object:added', () => {
      // Отправляем событие об изменении canvas
      window.dispatchEvent(new CustomEvent('canvas:modified'));
    });

    this.fabricCanvas.on('object:removed', () => {
      // Отправляем событие об изменении canvas
      window.dispatchEvent(new CustomEvent('canvas:modified'));
    });

    logger.info('Selection and modification handlers configured');
  }

  /**
   * Настроить кнопки canvas (Добавить, Далее)
   */
  private setupCanvasButtons(): void {
    // Очищаем старые обработчики перед добавлением новых
    // Это предотвращает накопление обработчиков при повторных вызовах
    this.cleanup();

    // Кнопка "Добавить одежду"
    const addBtn = document.getElementById('canvas-add-item-btn') as HTMLElement;
    if (addBtn && this.config.onAddItem) {
      const handleAdd = () => {
        logger.info('Canvas add item button clicked');
        this.config.onAddItem!();
      };

      addBtn.addEventListener('click', handleAdd);
      this.cleanupFunctions.push(() => {
        addBtn.removeEventListener('click', handleAdd);
      });
    }

    // Кнопка "Далее"
    const nextBtn = document.getElementById('canvas-next-btn') as HTMLElement;
    if (nextBtn && this.config.onNext) {
      const handleNext = () => {
        logger.info('Canvas next button clicked');

        // Снимаем выделение со всех объектов перед сохранением
        // Это предотвращает попадание рамки на превью
        if (this.fabricCanvas) {
          this.fabricCanvas.discardActiveObject();
          this.fabricCanvas.renderAll();
        }

        this.config.onNext!();
      };

      nextBtn.addEventListener('click', handleNext);
      this.cleanupFunctions.push(() => {
        nextBtn.removeEventListener('click', handleNext);
      });
    }

    logger.info('Canvas buttons configured');
  }

  // ============================================
  // ПРИВАТНЫЕ МЕТОДЫ - ЗАГРУЗКА ИЗОБРАЖЕНИЙ
  // ============================================

  /**
   * Загрузить изображение
   */
  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const imageObj = new Image();
      imageObj.crossOrigin = 'anonymous';

      imageObj.onload = () => {
        resolve(imageObj);
      };

      imageObj.onerror = (error) => {
        logger.error('Failed to load image', {
          url,
          error: error?.toString() || 'Unknown error'
        });
        reject(new Error(`Failed to load image: ${url}`));
      };

      imageObj.src = url;
    });
  }

  /**
   * Проверить валидность URL изображения
   */
  private isValidImageUrl(url: string | undefined): boolean {
    return !!(url && (url.startsWith('http') || url.startsWith('/')));
  }

  // ============================================
  // ПРИВАТНЫЕ МЕТОДЫ - ДОБАВЛЕНИЕ НА CANVAS
  // ============================================

  /**
   * Добавить изображение на canvas
   */
  private addImageToCanvas(
    imageObj: HTMLImageElement,
    item: WardrobeItem,
    x: number,
    y: number,
    scale: number,
    angle: number
  ): void {
    if (!this.fabricCanvas) {
      throw new Error('Canvas not initialized');
    }

    // Создаем Fabric.js Image объект
    const fabricImg = new fabric.Image(imageObj, {
      left: x,
      top: y,
      originX: 'center',
      originY: 'center',
      scaleX: scale,
      scaleY: scale,
      angle: angle,
      selectable: true,
      hasControls: true,
      hasBorders: true,
      lockScalingFlip: true,
      transparentCorners: false,
      cornerColor: '#ffffff',
      cornerStrokeColor: '#333333',
      cornerStyle: 'circle',
      borderColor: '#333333',
      borderOpacityWhenMoving: 0.8,
      cornerSize: 8,
      touchCornerSize: 24,
    });

    // Сохраняем данные элемента гардероба в объекте canvas
    (fabricImg as any).itemData = item;
    (fabricImg as any).id = item.id;

    // Добавляем контрол удаления
    this.addDeleteControl(fabricImg);

    // Добавляем изображение на canvas
    this.fabricCanvas.add(fabricImg);
  }

  /**
   * Вычислить автоматическую позицию и масштаб изображения
   */
  private calculateImagePosition(imageObj: HTMLImageElement, item: WardrobeItem): { scale: number; x: number; y: number } {
    if (!this.fabricCanvas) {
      throw new Error('Canvas not initialized');
    }

    const canvasWidth = this.fabricCanvas.width!;
    const canvasHeight = this.fabricCanvas.height!;
    const canvasCenterX = canvasWidth / 2;
    const canvasCenterY = canvasHeight / 2;

    const imgWidth = imageObj.naturalWidth;
    const imgHeight = imageObj.naturalHeight;
    const category = item.category?.toUpperCase() || '';

    // Базовый масштаб - 25% от размера canvas
    let baseScale = Math.min(
      (canvasWidth * 0.4) / imgWidth,
      (canvasHeight * 0.4) / imgHeight
    );

    // Для OUTERWEAR увеличиваем масштаб
    if (category === 'OUTERWEAR') {
      baseScale *= 1.5;
    }
    else if (category === 'INNERWEAR' || category === 'BODYWEAR') {
      baseScale *= 1.3;
    }

    // Позиционирование по типам одежды
    let x: number;
    let y: number;

    switch (category) {
      case 'INNERWEAR':
      case 'BODYWEAR':
        x = canvasCenterX;
        y = canvasCenterY - 120;
        break;

      case 'LEGWEAR':
        x = canvasCenterX;
        y = canvasCenterY + 100;
        break;

      case 'FOOTWEAR':
        x = canvasCenterX;
        y = canvasCenterY + 220;
        break;

      case 'OUTERWEAR':
        x = canvasCenterX - 80;
        y = canvasCenterY - 100;
        break;

      case 'FULLBODY':
        x = canvasCenterX;
        y = canvasCenterY - 50;
        break;

      case 'HEADWEAR':
        x = canvasCenterX;
        y = canvasCenterY - 200;
        break;

      case 'ACCESSORIES':
        const isLeftSide = Math.random() > 0.5;
        x = isLeftSide ? canvasCenterX - 150 : canvasCenterX + 150;
        y = canvasCenterY - 50;
        break;

      default:
        x = canvasCenterX;
        y = canvasCenterY;
        break;
    }

    return { scale: baseScale, x, y };
  }

  // ============================================
  // ПРИВАТНЫЕ МЕТОДЫ - КОНТРОЛЛЫ
  // ============================================

  /**
   * Добавить контрол удаления к изображению
   */
  private addDeleteControl(fabricImg: fabric.Image): void {
    const deleteControl = new fabric.Control({
      x: -0.5,
      y: -0.5,
      offsetX: -4,
      offsetY: -25,
      cursorStyle: 'pointer',
      mouseUpHandler: this.deleteObject.bind(this),
      render: this.renderDeleteIcon.bind(this)
    });
    fabricImg.controls = fabricImg.controls || {};
    fabricImg.controls['deleteControl'] = deleteControl;
  }

  /**
   * Обработчик удаления объекта
   */
  private deleteObject(_eventData: any, transform: any): boolean {
    try {
      const target = transform?.target;
      if (!target || !this.fabricCanvas) {
        return false;
      }

      const itemId = (target as any).id;

      this.fabricCanvas.remove(target);
      this.fabricCanvas.renderAll();

      logger.info('Object deleted from canvas', {
        itemId: itemId
      });

      // Уведомляем о удалении объекта через callback
      if (this.config.onItemDeleted && itemId) {
        this.config.onItemDeleted(itemId);
      }

      return true;

    } catch (error) {
      logger.error('Error in delete object handler', {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Рендер маленькой иконки удаления с буквой X
   */
  private renderDeleteIcon(ctx: CanvasRenderingContext2D, left: number, top: number, _styleOverride: any, _fabricObject: fabric.Object): void {
    const size = 20;
    const centerX = left;
    const centerY = top;

    // Рисуем красный круг
    ctx.save();
    ctx.fillStyle = '#ff4757';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, size / 2, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    // Рисуем букву X
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();

    // Левая верхняя - правая нижняя диагональ
    ctx.moveTo(centerX - 4, centerY - 4);
    ctx.lineTo(centerX + 4, centerY + 4);

    // Правая верхняя - левая нижняя диагональ
    ctx.moveTo(centerX + 4, centerY - 4);
    ctx.lineTo(centerX - 4, centerY + 4);

    ctx.stroke();
    ctx.restore();
  }

  // ============================================
  // ПРИВАТНЫЕ МЕТОДЫ - СЕРИАЛИЗАЦИЯ
  // ============================================

  /**
   * Обрезать canvas по содержимому с отступом
   * @param padding - Отступ от краев содержимого в пикселях
   * @returns Обрезанный canvas элемент или null если нечего обрезать
   */
  private cropCanvasToContent(padding: number = 25): HTMLCanvasElement | null {
    if (!this.fabricCanvas) {
      return null;
    }

    try {
      // Получаем canvas элемент
      const canvasElement = this.fabricCanvas.getElement() as HTMLCanvasElement;
      const ctx = canvasElement.getContext('2d');

      if (!ctx) {
        logger.error('Cannot get canvas context for cropping');
        return null;
      }

      // Получаем данные изображения
      const imageData = ctx.getImageData(0, 0, canvasElement.width, canvasElement.height);
      const pixels = imageData.data;
      const width = canvasElement.width;
      const height = canvasElement.height;

      // Получаем цвет фона (берем из угла canvas)
      const bgIndex = 0; // Левый верхний угол
      const bgR = pixels[bgIndex] || 0;
      const bgG = pixels[bgIndex + 1] || 0;
      const bgB = pixels[bgIndex + 2] || 0;

      // Порог для определения "похожести" на фон (увеличен для лучшего определения)
      const threshold = 50;

      // Находим границы содержимого (пиксели отличающиеся от фона)
      let minX = width;
      let minY = height;
      let maxX = 0;
      let maxY = 0;

      // Проходим по всем пикселям
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const index = (y * width + x) * 4;
          const r = pixels[index] || 0;
          const g = pixels[index + 1] || 0;
          const b = pixels[index + 2] || 0;

          // Вычисляем разницу с фоном
          const diff = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);

          // Если пиксель отличается от фона (это содержимое)
          if (diff > threshold) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      // Проверяем что нашли содержимое
      if (minX >= maxX || minY >= maxY) {
        logger.error('No content found on canvas for cropping');
        return null;
      }

      // Добавляем отступ
      minX = Math.max(0, minX - padding);
      minY = Math.max(0, minY - padding);
      maxX = Math.min(width - 1, maxX + padding);
      maxY = Math.min(height - 1, maxY + padding);

      // Вычисляем размеры обрезанного изображения
      const croppedWidth = maxX - minX + 1;
      const croppedHeight = maxY - minY + 1;

      // Создаем новый canvas для обрезанного изображения
      const croppedCanvas = document.createElement('canvas');
      croppedCanvas.width = croppedWidth;
      croppedCanvas.height = croppedHeight;
      const croppedCtx = croppedCanvas.getContext('2d');

      if (!croppedCtx) {
        logger.error('Cannot create cropped canvas context');
        return null;
      }

      // ВАЖНО: Заполняем фон цветом canvas (#f5f5f5) перед копированием содержимого
      // Это гарантирует что прозрачные области вещей будут иметь правильный цвет фона
      croppedCtx.fillStyle = UICanvasEditor.CANVAS_BACKGROUND_COLOR;
      croppedCtx.fillRect(0, 0, croppedWidth, croppedHeight);

      // Копируем обрезанную область поверх фона
      croppedCtx.drawImage(
        canvasElement,
        minX, minY, croppedWidth, croppedHeight,  // Источник
        0, 0, croppedWidth, croppedHeight         // Назначение
      );

      return croppedCanvas;

    } catch (error) {
      logger.error('Error cropping canvas to content', { error });
      return null;
    }
  }

  /**
   * Конвертировать canvas в изображение base64 с удалением фона
   * Делаем фон прозрачным перед сохранением для правильной обрезки на сервере
   * 
   * ДЕЛЕГИРОВАНИЕ: Использует ImageProcessingService для удаления фона
   */
  private async canvasToImage(removeBackground: boolean = false): Promise<string> {
    if (!this.fabricCanvas) {
      throw new Error('No canvas available');
    }

    // НЕ делаем фон прозрачным - сохраняем градиент!
    // Автоматически обрезаем canvas по содержимому с отступом 25px
    const croppedCanvas = this.cropCanvasToContent(100);

    // ДЕЛЕГИРОВАНИЕ: используем ImageProcessingService для конвертации canvas
    // Используем обрезанный canvas если он есть, иначе оригинальный
    const canvasElement = (croppedCanvas || this.fabricCanvas.getElement()) as HTMLCanvasElement;
    const canvasBase64 = await imageProcessingService.canvasToBase64(canvasElement, {
      format: 'png',
      quality: 1.0
    });

    // Удаляем фон только если это необходимо (например, для AI-generated капсул)
    if (removeBackground) {
      try {
        // ДЕЛЕГИРОВАНИЕ: используем ImageProcessingService для удаления фона
        const processedImage = await imageProcessingService.removeBackground(canvasBase64);

        // Проверяем что результат не пустой (base64 изображения обычно длиннее 1000 символов)
        if (!processedImage || processedImage.length < 1000) {
          logger.error('Background removal returned empty or invalid image, using original', {
            resultLength: processedImage?.length || 0
          });
          return canvasBase64 || '';
        }

        logger.info('Canvas background removed successfully via ImageProcessingService', {
          originalLength: canvasBase64.length,
          processedLength: processedImage.length
        });

        return processedImage;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Error removing canvas background, using original', { error: errorMessage });

        // Fallback: возвращаем оригинальное изображение без удаления фона
        return canvasBase64 || '';
      }
    } else {
      // Фон не удаляется - возвращаем как есть
      logger.info('Skipping background removal - removeBackground is false');
      return canvasBase64 || '';
    }
  }

  // ============================================
  // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
  // ============================================

  /**
   * Очистить обработчики событий
   */
  private cleanup(): void {
    this.cleanupFunctions.forEach(cleanup => {
      try {
        cleanup();
      } catch (error) {
        logger.error('Error during cleanup', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });
    this.cleanupFunctions = [];
  }

  /**
   * Получить статус редактора (для отладки)
   */
  getStatus() {
    return {
      isVisible: this.isVisible,
      isInitialized: !!this.fabricCanvas,
      objectsCount: this.fabricCanvas?.getObjects().length || 0,
      canvasSize: this.fabricCanvas ? {
        width: this.fabricCanvas.width,
        height: this.fabricCanvas.height
      } : null,
      cleanupFunctionsCount: this.cleanupFunctions.length
    };
  }
}
