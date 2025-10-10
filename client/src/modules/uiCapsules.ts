/**
 * Модуль для управления Capsules функционалом
 * Canvas на весь экран, модальное окно с выбором вещей из гардероба
 */

import { logger } from './logger';
import * as fabric from 'fabric';

// Делаем fabric доступным глобально для совместимости
(window as any).fabric = fabric;

// Объявляем глобальные переменные для библиотек
declare global {
  interface Window {
    fabric: any;
  }
}

/**
 * Enum категорий одежды (совпадает с wardrobe)
 */
enum ClothingCategory {
  OUTERWEAR = 'OUTERWEAR',
  INNERWEAR = 'INNERWEAR',
  BODYWEAR = 'BODYWEAR',
  FULLBODY = 'FULLBODY',
  LEGWEAR = 'LEGWEAR',
  FOOTWEAR = 'FOOTWEAR',
  HEADWEAR = 'HEADWEAR',
  ACCESSORIES = 'ACCESSORIES'
}

/**
 * Интерфейс для элемента гардероба
 */
interface WardrobeItem {
  id: number;
  imageUrl: string;
  name?: string;
  category?: string;
  color?: string;
  material?: string;
  style?: string;
  fit?: string;
  description?: string;
  tags?: string[];
  createdAt: string;
}

/**
 * Класс для управления Capsules функционалом
 */
export class UICapsulesManager {
  private cleanupFunctions: (() => void)[] = [];
  private wardrobeItems: WardrobeItem[] = [];
  private selectedItems: Set<number> = new Set(); // Множество выбранных элементов
  private currentFilter: string = 'ALL'; // Текущий активный фильтр
  private isCanvasVisible: boolean = false;
  private fabricCanvas: fabric.Canvas | null = null; // Fabric.js canvas instance

  constructor() {
  }

  /**
   * Обработчик открытия capsules
   */
  async handleCapsulesOpen(): Promise<void> {
    try {
      this.checkDOMElements();
      this.showCanvas();
      this.initializeCanvas();
      await this.loadWardrobeItems();
      this.createFilters();
      this.renderGrid();
      this.showModal();
      this.setupEventListeners();
    } catch (error) {
      logger.error('Error opening capsules', {
        error: error instanceof Error ? error.message : String(error),
        phase: this.getErrorPhase(error)
      });
    }
  }


  /**
   * Проверяем наличие необходимых DOM элементов
   */
  private checkDOMElements(): void {
    const requiredElements = [
      'capsules-canvas-container',
      'capsules-canvas',
      'capsules-modal',
      'capsules-modal-overlay',
      'capsules-modal-content',
      'capsules-filters',
      'capsules-grid'
    ];

    const missingElements: string[] = [];

    requiredElements.forEach(id => {
      const element = document.getElementById(id);
      if (!element) {
        missingElements.push(id);
      }
    });

    if (missingElements.length > 0) {
      logger.warn('Some DOM elements are missing, capsules may not work properly', {
        missingElements: missingElements,
        availableElements: requiredElements.filter(id => document.getElementById(id))
      });
    }
  }

  /**
   * Определяем фазу ошибки
   */
  private getErrorPhase(error: any): string {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('DOM elements')) return 'dom-check';
    if (errorMessage.includes('canvas')) return 'canvas-init';
    if (errorMessage.includes('wardrobe') || errorMessage.includes('fetch')) return 'wardrobe-load';
    return 'unknown';
  }

  /**
   * Показать canvas на весь экран
   */
  private showCanvas(): void {
    const canvasContainer = document.getElementById('capsules-canvas-container') as HTMLElement;
    if (canvasContainer) {
      canvasContainer.classList.remove('hidden');
      this.isCanvasVisible = true;
    } else {
      throw new Error('Canvas container not found');
    }
  }

  /**
   * Скрыть canvas
   */
  private hideCanvas(): void {
    const canvasContainer = document.getElementById('capsules-canvas-container') as HTMLElement;
    if (canvasContainer) {
      canvasContainer.classList.add('hidden');
      this.isCanvasVisible = false;
    }

    // Очищаем Fabric.js canvas
    if (this.fabricCanvas) {
      this.fabricCanvas.dispose();
      this.fabricCanvas = null;
    }
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
    const size = 20; // Маленькая кнопка 20x20 пикселей
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

    // Рисуем букву X (диагональные линии под 45 градусов)
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


  /**
   * Инициализировать Fabric.js canvas
   */
  private initializeCanvas(): void {
    try {
      const canvasElement = document.getElementById('capsules-canvas') as HTMLCanvasElement;
      if (!canvasElement) {
        throw new Error('Canvas element not found');
      }

      if (!window.fabric || !window.fabric.Canvas) {
        throw new Error('Fabric.js not loaded');
      }

      const containerElement = document.getElementById('capsules-canvas-container');
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

      this.fabricCanvas = new fabric.Canvas('capsules-canvas', {
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

    } catch (canvasError) {
      logger.error('Failed to initialize Fabric.js canvas', {
        error: canvasError instanceof Error ? canvasError.message : String(canvasError)
      });
      throw canvasError;
    }
  }

  /**
   * Проверка режима разработки
   */
  private isDevelopmentMode(): boolean {
    return window.location.hostname === 'localhost' ||
           window.location.hostname === '127.0.0.1' ||
           window.location.hostname === '0.0.0.0';
  }

  /**
   * Показать модальное окно
   */
  private showModal(): void {
    const modal = document.getElementById('capsules-modal') as HTMLElement;
    if (modal) {
      modal.classList.remove('hidden');
    } else {
      throw new Error('Modal element not found');
    }
  }

  private hideModal(): void {
    const modal = document.getElementById('capsules-modal') as HTMLElement;
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  /**
   * Закрыть capsules полностью
   */
  closeCapsules(): void {
    this.hideModal();
    this.hideCanvas();
    this.selectedItems.clear();

    this.cleanupFunctions.forEach(cleanup => {
      try {
        cleanup();
      } catch (error) {
        logger.error('Error during cleanup', error);
      }
    });

    this.cleanupFunctions = [];
  }

  /**
   * Настройка обработчиков событий
   */
  private setupEventListeners(): void {
    // Кнопка закрытия модального окна
    const closeBtn = document.getElementById('capsules-modal-close') as HTMLElement;
    if (closeBtn) {
      const handleClose = () => {
        this.closeCapsules();
      };

      closeBtn.addEventListener('click', handleClose);
      this.cleanupFunctions.push(() => {
        closeBtn.removeEventListener('click', handleClose);
      });
    }

    // Overlay клик для закрытия
    const overlay = document.querySelector('.capsules-modal-overlay') as HTMLElement;
    if (overlay) {
      const handleOverlayClick = () => {
        this.closeCapsules();
      };

      overlay.addEventListener('click', handleOverlayClick);
      this.cleanupFunctions.push(() => {
        overlay.removeEventListener('click', handleOverlayClick);
      });
    }

    // Кнопка "Далее"
    const nextBtn = document.getElementById('capsules-next-btn') as HTMLElement;
    if (nextBtn) {
      const handleNext = () => {
        this.handleNextClick();
      };

      nextBtn.addEventListener('click', handleNext);
      this.cleanupFunctions.push(() => {
        nextBtn.removeEventListener('click', handleNext);
      });
    }

  }

  /**
   * Создать фильтры категорий
   */
  private createFilters(): void {
    const filtersContainer = document.getElementById('capsules-filters');
    if (!filtersContainer) {
      logger.error('Capsules filters container not found');
      return;
    }

    // Очищаем контейнер
    filtersContainer.innerHTML = '';

    // Создаем фильтр "Все"
    const allFilterBtn = this.createFilterButton('ALL', 'Все');
    allFilterBtn.classList.add('active');
    filtersContainer.appendChild(allFilterBtn);

    // Создаем фильтры для каждой категории
    Object.values(ClothingCategory).forEach(category => {
      const filterBtn = this.createFilterButton(category, this.getCategoryNameRu(ClothingCategory[category as keyof typeof ClothingCategory]));
      filtersContainer.appendChild(filterBtn);
    });

  }

  /**
   * Создать кнопку фильтра
   */
  private createFilterButton(filterValue: string, filterText: string): HTMLElement {
    const button = document.createElement('button');
    button.className = 'capsules-filter-btn';
    button.textContent = filterText;
    button.dataset['filter'] = filterValue;

    // Обработчик клика
    const handleClick = () => {
      this.setActiveFilter(filterValue);
    };

    button.addEventListener('click', handleClick);

    // Добавляем в cleanup функции
    this.cleanupFunctions.push(() => {
      button.removeEventListener('click', handleClick);
    });

    return button;
  }

  /**
   * Установить активный фильтр
   */
  private setActiveFilter(filterValue: string): void {

    // Снимаем активный класс со всех кнопок
    const allButtons = document.querySelectorAll('.capsules-filter-btn');
    allButtons.forEach(btn => btn.classList.remove('active'));

    // Устанавливаем активный класс на выбранную кнопку
    const activeButton = document.querySelector(`.capsules-filter-btn[data-filter="${filterValue}"]`) as HTMLElement;
    if (activeButton) {
      activeButton.classList.add('active');
    }

    // Обновляем текущий фильтр
    this.currentFilter = filterValue;

    // Перерисовываем грид с учетом фильтра
    this.renderGrid();

  }

  /**
   * Рендерить грид с карточками
   */
  private renderGrid(): void {
    const grid = document.getElementById('capsules-grid');
    if (!grid) {
      logger.error('Capsules grid element not found');
      return;
    }

    // Очищаем грид
    grid.innerHTML = '';

    // Фильтруем элементы по текущему фильтру
    const filteredItems = this.getFilteredItems();

    // Добавляем карточки одежды
    filteredItems.forEach(item => {
      const card = this.createItemCard(item);
      grid.appendChild(card);
    });

    // Обновляем состояние кнопки "Далее"
    this.updateNextButtonState();

  }

  /**
   * Получить отфильтрованные элементы
   */
  private getFilteredItems(): WardrobeItem[] {
    if (this.currentFilter === 'ALL') {
      return this.wardrobeItems;
    }

    // Фильтруем по категории
    return this.wardrobeItems.filter(item => {
      const itemCategory = item.category;
      return itemCategory === this.currentFilter;
    });
  }

  /**
   * Создать карточку элемента
   */
  private createItemCard(item: WardrobeItem): HTMLElement {
    const card = document.createElement('div');
    card.className = 'capsules-item-card';
    card.dataset['itemId'] = item.id.toString();

    // Добавляем класс selected если элемент выбран
    if (this.selectedItems.has(item.id)) {
      card.classList.add('selected');
    }

    const content = document.createElement('div');
    content.className = 'capsules-item-card-content';

    const image = document.createElement('img');
    image.className = 'capsules-item-image';
    image.src = item.imageUrl;
    image.alt = item.name || 'Одежда';

    content.appendChild(image);
    card.appendChild(content);

    // Обработчик клика для выбора/снятия выбора
    const handleClick = () => {
      this.toggleItemSelection(item.id);
    };

    card.addEventListener('click', handleClick);

    // Добавляем в cleanup функции
    this.cleanupFunctions.push(() => {
      card.removeEventListener('click', handleClick);
    });

    return card;
  }

  /**
   * Переключить выбор элемента
   */
  private toggleItemSelection(itemId: number): void {
    if (this.selectedItems.has(itemId)) {
      this.selectedItems.delete(itemId);
    } else {
      this.selectedItems.add(itemId);
    }

    // Обновляем визуальное состояние карточки
    const card = document.querySelector(`.capsules-item-card[data-item-id="${itemId}"]`) as HTMLElement;
    if (card) {
      card.classList.toggle('selected');
    }

    // Обновляем состояние кнопки "Далее"
    this.updateNextButtonState();
  }

  /**
   * Обновить состояние кнопки "Далее"
   */
  private updateNextButtonState(): void {
    const nextBtn = document.getElementById('capsules-next-btn') as HTMLButtonElement;
    if (nextBtn) {
      const hasSelection = this.selectedItems.size > 0;
      nextBtn.disabled = !hasSelection;

      if (hasSelection) {
        nextBtn.textContent = `Далее (${this.selectedItems.size})`;
      } else {
        nextBtn.textContent = 'Далее';
      }

    } else {
      logger.warn('Next button element not found');
    }
  }

  /**
   * Обработчик клика по кнопке "Далее"
   */
  private handleNextClick(): void {
    try {
      if (this.selectedItems.size === 0) {
        logger.warn('Next button clicked but no items selected');
        return;
      }


      // Получаем выбранные элементы
      const selectedItemsData = this.wardrobeItems.filter(item => this.selectedItems.has(item.id));

      if (selectedItemsData.length === 0) {
        logger.error('No items found for selected IDs', {
          selectedIds: Array.from(this.selectedItems),
          availableItems: this.wardrobeItems.length
        });
        return;
      }

      // Добавляем на canvas
      this.addItemsToCanvas(selectedItemsData);

      // Скрываем модальное окно
      this.hideModal();

    } catch (error) {
      logger.error('Error in handleNextClick', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        selectedCount: this.selectedItems.size
      });
    }
  }

  /**
   * Добавить выбранные элементы на Fabric.js canvas
   */
  private addItemsToCanvas(items: WardrobeItem[]): void {
    if (!this.fabricCanvas) {
      logger.error('Fabric.js canvas not initialized');
      return;
    }


    // Подготавливаем canvas
    this.prepareCanvas();

    // Загружаем изображения асинхронно
    this.loadImagesAsync(items);
  }

  /**
   * Подготовить canvas для добавления изображений
   */
  private prepareCanvas(): void {
    if (!this.fabricCanvas) return;

    this.fabricCanvas.clear();
    (this.fabricCanvas as any).backgroundColor = '#f5f5f5';
    this.fabricCanvas.renderAll();
  }

  /**
   * Асинхронная загрузка изображений
   */
  private async loadImagesAsync(items: WardrobeItem[]): Promise<void> {
    const loadingPromises = items.map((item, index) => this.loadSingleImage(item, index));
    await Promise.allSettled(loadingPromises);

    this.fabricCanvas!.renderAll();
  }

  /**
   * Загрузить одно изображение
   */
  private async loadSingleImage(item: WardrobeItem, index: number): Promise<void> {
    return new Promise((resolve, reject) => {
      // Проверяем URL перед загрузкой
      if (!this.isValidImageUrl(item.imageUrl)) {
        logger.error('Invalid image URL', { itemId: item.id, url: item.imageUrl });
        reject(new Error(`Invalid URL for item ${item.id}`));
        return;
      }

      // Создаем HTML Image элемент для загрузки
      const imageObj = new Image();
      imageObj.crossOrigin = 'anonymous';

      imageObj.onload = () => {
        try {
          this.addImageToCanvas(imageObj, index);
          resolve();
        } catch (error) {
          logger.error('Error adding image to canvas', { itemId: item.id, error });
          reject(error);
        }
      };

      imageObj.onerror = (error) => {
        logger.error('Failed to load image for Fabric.js', {
          itemId: item.id,
          url: item.imageUrl,
          error: error?.toString() || 'Unknown error'
        });
        reject(new Error(`Failed to load image ${item.id}`));
      };

      imageObj.src = item.imageUrl;
    });
  }

  /**
   * Проверить валидность URL изображения
   */
  private isValidImageUrl(url: string | undefined): boolean {
    return !!(url && (url.startsWith('http') || url.startsWith('/')));
  }

  /**
   * Добавить изображение на canvas
   */
  private addImageToCanvas(imageObj: HTMLImageElement, index: number): void {
    if (!this.fabricCanvas) {
      throw new Error('Canvas not initialized');
    }

    // Вычисляем масштаб и позицию
    const { scale, x, y } = this.calculateImagePosition(imageObj, index);

    // Создаем Fabric.js Image объект
    const fabricImg = new fabric.Image(imageObj, {
      left: x,
      top: y,
      originX: 'center',
      originY: 'center',
      scaleX: scale,
      scaleY: scale,
      selectable: true,
      hasControls: true,
      hasBorders: true,
      lockScalingFlip: true,
      transparentCorners: false,
      cornerColor: '#ffffff',
      cornerStrokeColor: '#333333',
      borderColor: '#333333',
      borderOpacityWhenMoving: 0.8,
      cornerSize: 12,
      touchCornerSize: 24,
    });

    // Добавляем контрол удаления
    this.addDeleteControl(fabricImg);

    // Добавляем изображение на canvas
    this.fabricCanvas.add(fabricImg);

  }

  /**
   * Вычислить позицию и масштаб изображения
   */
  private calculateImagePosition(imageObj: HTMLImageElement, index: number): { scale: number; x: number; y: number } {
    if (!this.fabricCanvas) {
      throw new Error('Canvas not initialized');
    }

    const canvasWidth = this.fabricCanvas.width!;
    const canvasHeight = this.fabricCanvas.height!;
    const imgWidth = imageObj.naturalWidth;
    const imgHeight = imageObj.naturalHeight;

    // Масштабируем изображение до 25% от размера canvas
    const scale = Math.min(
      (canvasWidth * 0.25) / imgWidth,
      (canvasHeight * 0.25) / imgHeight
    );

    // Позиционируем изображения в сетке (2 колонки)
    const cols = 2;
    const spacing = 20;
    const scaledWidth = imgWidth * scale;
    const scaledHeight = imgHeight * scale;

    const col = index % cols;
    const row = Math.floor(index / cols);

    const x = spacing + col * (scaledWidth + spacing) + scaledWidth / 2;
    const y = spacing + row * (scaledHeight + spacing) + scaledHeight / 2;

    return { scale, x, y };
  }

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
   * Получить русское название категории
   */
  private getCategoryNameRu(category: ClothingCategory): string {
    const names: Record<ClothingCategory, string> = {
      [ClothingCategory.OUTERWEAR]: 'Верхняя одежда',
      [ClothingCategory.INNERWEAR]: 'Кофты',
      [ClothingCategory.BODYWEAR]: 'Футболки и рубашки',
      [ClothingCategory.FULLBODY]: 'Платья и костюмы',
      [ClothingCategory.LEGWEAR]: 'Штаны',
      [ClothingCategory.FOOTWEAR]: 'Обувь',
      [ClothingCategory.HEADWEAR]: 'Головные уборы',
      [ClothingCategory.ACCESSORIES]: 'Аксессуары'
    };
    return names[category] || category;
  }

  /**
   * Загрузить элементы гардероба с сервера
   */
  private async loadWardrobeItems(): Promise<void> {
    try {

      // Получаем initData из Telegram WebApp
      const initData = (window as any).Telegram?.WebApp?.initData || '';

      const response = await fetch(`/api/wardrobe?initData=${encodeURIComponent(initData)}`, {
        method: 'GET'
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to load items');
      }

      this.wardrobeItems = result.items;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error loading wardrobe items for capsules', { error: errorMessage });

      // Fallback: создаем пустой массив, чтобы capsules могли работать
      this.wardrobeItems = [];

      
    }
  }

  /**
   * Получить статус менеджера capsules
   */
  getStatus() {
    return {
      initialized: true,
      canvasVisible: this.isCanvasVisible,
      canvasReady: !!this.fabricCanvas,
      modalVisible: !document.getElementById('capsules-modal')?.classList.contains('hidden'),
      itemsCount: this.wardrobeItems.length,
      selectedCount: this.selectedItems.size,
      currentFilter: this.currentFilter,
      cleanupFunctionsCount: this.cleanupFunctions.length,
      fabricVersion: (window as any).fabric?.version || 'unknown',
      developmentMode: this.isDevelopmentMode(),
    };
  }

  /**
   * Получить диагностическую информацию для отладки
   */
  getDebugInfo() {
    return {
      status: this.getStatus(),
      canvas: this.fabricCanvas ? {
        width: this.fabricCanvas.width,
        height: this.fabricCanvas.height,
        backgroundColor: this.fabricCanvas.backgroundColor,
        objectsCount: this.fabricCanvas.getObjects().length,
        zoom: this.fabricCanvas.getZoom(),
        viewportTransform: this.fabricCanvas.viewportTransform,
      } : null,
      domElements: {
        canvasContainer: !!document.getElementById('capsules-canvas-container'),
        canvas: !!document.getElementById('capsules-canvas'),
        modal: !!document.getElementById('capsules-modal'),
        modalOverlay: !!document.querySelector('.capsules-modal-overlay'),
        modalContent: !!document.querySelector('.capsules-modal-content'),
        filters: !!document.getElementById('capsules-filters'),
        grid: !!document.getElementById('capsules-grid'),
      },
      libraries: {
        fabric: !!(window as any).fabric,
      },
      fabricSettings: {
        canvasSelectionEnabled: this.fabricCanvas?.selection || false,
        touchScrollingAllowed: this.fabricCanvas?.allowTouchScrolling || false,
        developmentMode: this.isDevelopmentMode(),
      }
    };
  }

  /**
   * Очистка ресурсов
   */
  destroy(): void {

    this.closeCapsules();

    this.wardrobeItems = [];
    this.selectedItems.clear();
    this.currentFilter = 'ALL';
  }
}

// Создаем глобальный экземпляр менеджера capsules
export const uiCapsulesManager = new UICapsulesManager();
