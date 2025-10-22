/**
 * Унифицированный редактор canvas для капсул
 * Использует Fabric.js для манипуляций с изображениями одежды
 */

import { logger } from './logger';
import { api } from './api';
import { WardrobeItem } from './photoUploadManager';
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
 * Унифицированный редактор canvas
 */
export class UICanvasEditor {
  private fabricCanvas: fabric.Canvas | null = null;
  private config: CanvasEditorConfig;
  private cleanupFunctions: (() => void)[] = [];
  private isVisible: boolean = false;

  constructor(config: CanvasEditorConfig) {
    this.config = config;
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

      // ВАЖНО: Настраиваем кнопки при каждом показе canvas
      // Это исправляет баг когда кнопки исчезают после первого использования
      this.setupCanvasButtons();
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
        backgroundColor: '#f5f5f5',
        selection: false,
        allowTouchScrolling: false,
        perPixelTargetFind: true,
        targetFindTolerance: 15,
        skipTargetFind: false,
        enableRetinaScaling: true
      });

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
   * @param items - Массив элементов для добавления
   */
  async loadItems(items: CanvasItem[]): Promise<void> {
    if (!this.fabricCanvas) {
      logger.error('Canvas not initialized, cannot load items');
      throw new Error('Canvas not initialized');
    }

    logger.info('Loading items to canvas', { itemsCount: items.length });

    // Очищаем canvas
    this.fabricCanvas.clear();
    (this.fabricCanvas as any).backgroundColor = '#f5f5f5';
    this.fabricCanvas.renderAll();

    // Загружаем элементы последовательно для сохранения порядка слоев
    for (const canvasItem of items) {
      await this.addItem(canvasItem);
    }

    this.fabricCanvas.renderAll();
    logger.info('Items loaded to canvas successfully');
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

      logger.debug('Using saved parameters', {
        itemId: item.id,
        position,
        scale,
        angle
      });
    } else {
      // Рассчитываем автоматически (режим создания)
      const calculated = this.calculateImagePosition(imageObj, item);
      finalX = calculated.x;
      finalY = calculated.y;
      finalScale = calculated.scale;
      finalAngle = 0;

      logger.debug('Calculated parameters automatically', {
        itemId: item.id,
        calculated
      });
    }

    // Добавляем на canvas
    this.addImageToCanvas(imageObj, item, finalX, finalY, finalScale, finalAngle);
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
   */
  async getState(): Promise<CanvasState> {
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

    // Получаем thumbnail с удаленным фоном
    const thumbnailImage = await this.canvasToImage();

    logger.debug('Canvas state collected', {
      objectsCount: objects.length,
      selectedItemsCount: currentSelectedItems.length
    });

    return {
      canvasData,
      thumbnailImage
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

    logger.info('Restoring canvas state', {
      objectsCount: savedData.canvas?.objects?.length || 0,
      hasSelectedItems: !!savedData.selected_items
    });

    // Очищаем canvas
    this.fabricCanvas.clear();
    (this.fabricCanvas as any).backgroundColor = savedData.canvas?.backgroundColor || '#f5f5f5';
    this.fabricCanvas.renderAll();

    // Если нет объектов для отрисовки
    if (!savedData.canvas?.objects || savedData.canvas.objects.length === 0) {
      logger.warn('No objects to restore in canvas');
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
        logger.warn('No wardrobe item found for canvas object', { index: i, objData });
        continue;
      }

      // Проверяем что wardrobeItem не null
      if (!wardrobeItem) {
        logger.warn('Wardrobe item is null, skipping', { index: i });
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
        logger.warn('Failed to restore canvas item, skipping', {
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
      logger.warn('Canvas not initialized');
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
      (this.fabricCanvas as any).backgroundColor = '#f5f5f5';
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

    logger.info('Selection handlers configured');
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
          logger.debug('Active object discarded before saving');
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
        logger.debug('Image loaded successfully', { url });
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

    logger.debug('Image added to canvas', {
      itemId: item.id,
      position: { x, y },
      scale,
      angle
    });
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
      (canvasWidth * 0.25) / imgWidth,
      (canvasHeight * 0.25) / imgHeight
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
        y = canvasCenterY - 90;
        break;

      case 'LEGWEAR':
        x = canvasCenterX;
        y = canvasCenterY + 60;
        break;

      case 'FOOTWEAR':
        x = canvasCenterX;
        y = canvasCenterY + 150;
        break;

      case 'OUTERWEAR':
        x = canvasCenterX - 100;
        y = canvasCenterY - 30;
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

      this.fabricCanvas.remove(target);
      this.fabricCanvas.renderAll();

      logger.info('Object deleted from canvas', {
        itemId: (target as any).id
      });

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
   * Конвертировать canvas в изображение base64 с удалением фона
   * Делаем фон прозрачным перед сохранением для правильной обрезки на сервере
   */
  private async canvasToImage(): Promise<string> {
    if (!this.fabricCanvas) {
      throw new Error('No canvas available');
    }

    // Сохраняем текущий цвет фона
    const originalBgColor = this.fabricCanvas.backgroundColor;

    // Временно делаем фон прозрачным
    this.fabricCanvas.backgroundColor = 'transparent';
    this.fabricCanvas.renderAll();

    logger.info('Canvas size', {
      width: this.fabricCanvas.width,
      height: this.fabricCanvas.height,
      objectsCount: this.fabricCanvas.getObjects().length,
      backgroundColor: 'transparent (temp)'
    });

    // Получаем canvas element с прозрачным фоном
    const canvasElement = this.fabricCanvas.getElement() as HTMLCanvasElement;
    const canvasBase64 = canvasElement.toDataURL('image/png');

    // Восстанавливаем оригинальный фон
    this.fabricCanvas.backgroundColor = originalBgColor;
    this.fabricCanvas.renderAll();

    try {
      logger.info('Sending canvas to background removal');

      // REFACTORED: используем api клиент вместо fetch
      const result = await api.removeBackground(canvasBase64) as any;

      if (!result.success) {
        throw new Error(result.error || 'Background removal failed');
      }

      logger.info('Canvas background removed successfully', {
        originalSize: result.image_info?.original_size,
        resultSize: result.image_info?.result_size
      });

      return result.image_base64;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error removing canvas background, using original', { error: errorMessage });

      // Fallback: возвращаем оригинальное изображение без удаления фона
      return canvasBase64;
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
