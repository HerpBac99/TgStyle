/**
 * Модуль для управления Capsules функционалом
 * Canvas на весь экран, модальное окно с выбором вещей из гардероба
 */

import { logger } from './logger';
import * as fabric from 'fabric';
import { PhotoUploadManager, ClothingCategory, PhotoUploadHandler } from './photoUploadManager';
import { UIWardrobeManager } from './uiWardrobe';

// Делаем fabric доступным глобально для совместимости
(window as any).fabric = fabric;

// Объявляем глобальные переменные для библиотек
declare global {
  interface Window {
    fabric: any;
  }
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
  private wardrobeManager: UIWardrobeManager | null = null; // Ссылка на wardrobe manager
  private photoUploadManager: PhotoUploadManager;
  private photoUploadHandler: PhotoUploadHandler;

  constructor() {
    this.photoUploadManager = new PhotoUploadManager();
    this.photoUploadHandler = this.createPhotoUploadHandler();
    this.photoUploadManager.setHandler(this.photoUploadHandler);
  }

  /**
   * Обработчик открытия capsules
   */
  async handleCapsulesOpen(): Promise<void> {
    try {
      this.checkDOMElements();
      // Инициализируем wardrobe manager для доступа к загрузке фото
      this.wardrobeManager = new UIWardrobeManager();
      // Инициализируем wardrobe manager для настройки обработчиков событий
      await this.wardrobeManager.handleWardrobeOpen();
      // Canvas будет инициализирован только при переходе к canvas режиму
      await this.loadWardrobeItems();
      this.createFilters();
      this.renderGrid();
      this.showModal();
      this.setupEventListeners();
      // BackButton будет настроен в handleNextClick при переходе к canvas
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
    this.hideBackButton(); // Скрыть BackButton
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
      let selectedItemsData = this.wardrobeItems.filter(item => this.selectedItems.has(item.id));

      if (selectedItemsData.length === 0) {
        logger.error('No items found for selected IDs', {
          selectedIds: Array.from(this.selectedItems),
          availableItems: this.wardrobeItems.length
        });
        return;
      }

      // Сортируем элементы по слоям (от нижнего к верхнему для правильного наложения)
      selectedItemsData = this.sortItemsByLayer(selectedItemsData);

      // Скрываем модальное окно
      this.hideModal();

      // Показываем canvas контейнер ПЕРЕД инициализацией
      this.showCanvas();

      // Инициализируем canvas только после показа контейнера
      if (!this.fabricCanvas) {
        this.initializeCanvas();
      }

      // Добавляем на canvas
      this.addItemsToCanvas(selectedItemsData);

      // Настраиваем BackButton для возврата
      this.setupBackButton();

      // Настраиваем кнопку добавления одежды
      this.setupCanvasAddButton();

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
    // Загружаем изображения последовательно, чтобы сохранить порядок слоев
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item) {
        await this.loadSingleImage(item, i);
      }
    }

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
          this.addImageToCanvas(imageObj, index, item);
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
  private addImageToCanvas(imageObj: HTMLImageElement, _index: number, item: WardrobeItem): void {
    if (!this.fabricCanvas) {
      throw new Error('Canvas not initialized');
    }

    // Вычисляем масштаб и позицию
    const { scale, x, y } = this.calculateImagePosition(imageObj, item);

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
   * Сортировать элементы по слоям одежды (от нижнего к верхнему для правильного наложения)
   */
  private sortItemsByLayer(items: WardrobeItem[]): WardrobeItem[] {
    const layerOrder = {
      'LEGWEAR': 1,      // Штаны - самый нижний слой
      'BODYWEAR': 2,     // Футболки - над штанами
      'INNERWEAR': 3,    // Кофты - над футболками
      'FULLBODY': 4,     // Полностью закрывающая одежда
      'FOOTWEAR': 5,     // Обувь - над кофтами
      'OUTERWEAR': 6,    // Куртки, пальто - самый верхний слой
      'HEADWEAR': 7,     // Головные уборы
      'ACCESSORIES': 8   // Аксессуары
    };

    // Сортируем от НИЖНЕГО слоя к ВЕРХНЕМУ, чтобы верхние слои добавлялись последними
    return items.sort((a, b) => {
      const aLayer = layerOrder[a.category?.toUpperCase() as keyof typeof layerOrder] || 99;
      const bLayer = layerOrder[b.category?.toUpperCase() as keyof typeof layerOrder] || 99;
      return aLayer - bLayer; // Прямая сортировка
    });
  }

  /**
   * Вычислить позицию и масштаб изображения
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

    // Для OUTERWEAR увеличиваем масштаб на 10%
    if (category === 'OUTERWEAR') {
      baseScale *= 1.5;
    }
    else if (category === 'INNERWEAR'
      || category === 'BODYWEAR'
    ) {
      baseScale *= 1.3;
    }

    // Позиционирование по типам одежды
    let x: number;
    let y: number;

    switch (category) {
      case 'INNERWEAR':
      case 'BODYWEAR':
        // Выше середины по центру
        x = canvasCenterX;
        y = canvasCenterY - 90; // 10px выше центра
        break;

      case 'LEGWEAR':
        // Ниже середины по центру
        x = canvasCenterX;
        y = canvasCenterY + 60; // 100px ниже центра
        break;

      case 'FOOTWEAR':
        // Ниже LEGWEAR
        x = canvasCenterX;
        y = canvasCenterY + 150; // 200px ниже центра
        break;

      case 'OUTERWEAR':
        // Почти у средней линии, низ ниже середины на 20px
        x = canvasCenterX - 100;
        y = canvasCenterY - 30; // 20px ниже центра
        break;

      case 'FULLBODY':
        // По центру, низ ниже середины на 50px
        x = canvasCenterX;
        y = canvasCenterY - 50; // 50px ниже центра
        break;

      case 'HEADWEAR':
        // Выше торса
        x = canvasCenterX;
        y = canvasCenterY - 200; // 200px выше центра
        break;

      case 'ACCESSORIES':
        // Сбоку от центра (чередуем левую и правую сторону)
        const isLeftSide = Math.random() > 0.5;
        x = isLeftSide ? canvasCenterX - 150 : canvasCenterX + 150;
        y = canvasCenterY - 50;
        break;

      default:
        // По умолчанию - по центру
        x = canvasCenterX;
        y = canvasCenterY;
        break;
    }

    return { scale: baseScale, x, y };
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
   * Настроить BackButton для возврата к модальному окну
   */
  private setupBackButton(): void {
    try {
      const tg = (window as any).Telegram?.WebApp;
      if (!tg) {
        logger.warn('Telegram WebApp not available for BackButton setup');
        return;
      }

      // Показать BackButton
      tg.BackButton.show();

      // Установить обработчик события back_button_pressed
      const handleBackButtonPressed = () => {
        this.returnToModal();
      };

      // Подписаться на событие
      tg.BackButton.onClick(handleBackButtonPressed);

      // Добавить в cleanup функции
      this.cleanupFunctions.push(() => {
        tg.BackButton.offClick(handleBackButtonPressed);
      });

      logger.info('BackButton configured for capsules return');
    } catch (error) {
      logger.error('Error setting up BackButton', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Скрыть BackButton
   */
  private hideBackButton(): void {
    try {
      const tg = (window as any).Telegram?.WebApp;
      if (!tg) return;

      tg.BackButton.hide();
      logger.info('BackButton hidden');
    } catch (error) {
      logger.error('Error hiding BackButton', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Вернуться к модальному окну выбора одежды
   */
  private returnToModal(): void {
    try {
      // Скрыть canvas
      this.hideCanvas();

      // Показать модальное окно с уже выбранными элементами
      this.showModal();

      // Обновить состояние кнопки "Далее"
      this.updateNextButtonState();

      logger.info('Returned to modal window with selected items', {
        selectedCount: this.selectedItems.size
      });
    } catch (error) {
      logger.error('Error returning to modal', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Настроить кнопку добавления одежды на canvas
   */
  private setupCanvasAddButton(): void {
    const addBtn = document.getElementById('canvas-add-item-btn') as HTMLElement;

    if (!addBtn) {
      logger.error('Canvas add item button not found');
      return;
    }

    const handleAdd = async () => {
      logger.info('Canvas add item button clicked');
      // Используем централизованный менеджер загрузки фото
      await this.photoUploadManager.handlePhotoUpload();
    };

    addBtn.addEventListener('click', handleAdd);

    // Добавляем функцию очистки
    this.cleanupFunctions.push(() => {
      addBtn.removeEventListener('click', handleAdd);
    });

    // Подписываемся на событие сохранения нового элемента гардероба
    const handleItemSaved = (event: CustomEvent) => {
      const { item } = event.detail;
      logger.info('New wardrobe item saved, adding to canvas', { itemId: item.id });
      this.addNewItemToCanvas(item);
    };

    window.addEventListener('wardrobe:item-saved', handleItemSaved as EventListener);

    // Добавляем функцию очистки
    this.cleanupFunctions.push(() => {
      window.removeEventListener('wardrobe:item-saved', handleItemSaved as EventListener);
    });
  }

  /**
   * Создать обработчик для загрузки фото в контексте капсул
   */
  private createPhotoUploadHandler(): PhotoUploadHandler {
    return {
      showPreviewModal: () => {
        if (this.wardrobeManager) {
          this.wardrobeManager.showPreviewModal();
        }
      },

      showLoadingInModal: (show: boolean) => {
        if (this.wardrobeManager) {
          this.wardrobeManager.showLoadingInModal(show);
        }
      },

      processPhotoWithBackgroundRemoval: async (file: File) => {
        if (this.wardrobeManager) {
          await this.wardrobeManager.processPhotoWithBackgroundRemoval(file);
        }
      },

      fileToBase64: async (file: File) => {
        if (this.wardrobeManager) {
          return await this.wardrobeManager.fileToBase64(file);
        }
        throw new Error('Wardrobe manager not available');
      }
    };
  }

  /**
   * Добавить новый элемент гардероба на canvas
   */
  private addNewItemToCanvas(item: WardrobeItem): void {
    try {
      // Добавляем элемент в массив wardrobeItems
      this.wardrobeItems.push(item);
      logger.info('Item added to wardrobe items array', { itemId: item.id, totalItems: this.wardrobeItems.length });

      // Если canvas еще не инициализирован, просто обновляем массив
      if (!this.fabricCanvas) {
        logger.warn('Canvas not initialized, item will be available when canvas is created');
        return;
      }

      // Создаем изображение для canvas
      this.loadSingleImageForCanvas(item);

      // Обновляем грид в модальном окне, если он показан
      if (!this.isCanvasVisible) {
        this.renderGrid();
      }

      logger.info('New item successfully added to canvas', { itemId: item.id });

    } catch (error) {
      logger.error('Error adding new item to canvas', {
        error: error instanceof Error ? error.message : String(error),
        itemId: item.id
      });
    }
  }

  /**
   * Загрузить и добавить одно изображение на canvas для нового элемента
   */
  private async loadSingleImageForCanvas(item: WardrobeItem): Promise<void> {
    return new Promise((resolve, reject) => {
      // Проверяем URL перед загрузкой
      if (!this.isValidImageUrl(item.imageUrl)) {
        logger.error('Invalid image URL for new item', { itemId: item.id, url: item.imageUrl });
        reject(new Error(`Invalid URL for item ${item.id}`));
        return;
      }

      // Создаем HTML Image элемент для загрузки
      const imageObj = new Image();
      imageObj.crossOrigin = 'anonymous';

      imageObj.onload = () => {
        try {
          this.addImageToCanvas(imageObj, 0, item); // index = 0 для новых элементов
          resolve();
        } catch (error) {
          logger.error('Error adding new image to canvas', { itemId: item.id, error });
          reject(error);
        }
      };

      imageObj.onerror = (error) => {
        logger.error('Failed to load image for new canvas item', {
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
