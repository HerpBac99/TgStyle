/**
 * Модуль для управления UI гардероба
 * Грид с карточками одежды и модальное окно предпросмотра
 */

import { logger } from './logger';
import { PhotoUploadManager, PhotoUploadHandler, ClothingCategory } from './photoUploadManager';
import { dataCacheManager } from './dataCache';


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
 * Класс для управления UI гардероба с гридом карточек
 */
export class UIWardrobeManager implements PhotoUploadHandler {
  private cleanupFunctions: (() => void)[] = [];
  private wardrobeItems: WardrobeItem[] = [];
  private currentPreviewImage: string | null = null;
  private currentClassification: any = null; // Данные классификации для сохранения
  private currentFilter: string = 'ALL'; // Текущий активный фильтр
  private photoUploadManager: PhotoUploadManager;

  constructor() {
    logger.info('Wardrobe Grid Manager initialized');
    this.photoUploadManager = new PhotoUploadManager(this);
  }

  /**
   * Обработать открытие гардероба
   */
  async handleWardrobeOpen(): Promise<void> {
    logger.info('Wardrobe opened - initializing grid');

    // Настраиваем обработчики событий
    this.setupEventListeners();

    // Загружаем сохраненные элементы гардероба с сервера
    await this.loadWardrobeItems();

    // Создаем фильтры
    this.createFilters();

    // Рендерим грид
    this.renderGrid();

    logger.info('Wardrobe grid ready');
  }

  /**
   * Настройка обработчиков событий
   */
  private setupEventListeners(): void {
    const addBtn = document.getElementById('add-item-btn') as HTMLElement;
    const confirmBtn = document.getElementById('wardrobe-preview-confirm') as HTMLElement;
    const cancelBtn = document.getElementById('wardrobe-preview-cancel') as HTMLElement;
    const modalOverlay = document.querySelector('.wardrobe-preview-overlay') as HTMLElement;

    if (addBtn) {
      const handleAdd = () => {
        logger.info('Add item button clicked');
        this.photoUploadManager.handlePhotoUpload();
      };

      addBtn.addEventListener('click', handleAdd);

      this.cleanupFunctions.push(() => {
        addBtn.removeEventListener('click', handleAdd);
      });
    }

    if (confirmBtn) {
      const handleConfirm = () => {
        logger.info('Confirm button clicked');
        this.confirmPreview();
      };

      confirmBtn.addEventListener('click', handleConfirm);

      this.cleanupFunctions.push(() => {
        confirmBtn.removeEventListener('click', handleConfirm);
      });
    }

    if (cancelBtn) {
      const handleCancel = () => {
        logger.info('Cancel button clicked');
        this.cancelPreview();
      };

      cancelBtn.addEventListener('click', handleCancel);

      this.cleanupFunctions.push(() => {
        cancelBtn.removeEventListener('click', handleCancel);
      });
    }

    if (modalOverlay) {
      const handleOverlayClick = () => {
        logger.info('Modal overlay clicked');
        this.cancelPreview();
      };

      modalOverlay.addEventListener('click', handleOverlayClick);

      this.cleanupFunctions.push(() => {
        modalOverlay.removeEventListener('click', handleOverlayClick);
      });
    }
  }

  /**
   * Создать фильтры категорий
   */
  private createFilters(): void {
    const filtersContainer = document.getElementById('wardrobe-filters');
    if (!filtersContainer) {
      logger.error('Wardrobe filters container not found');
      return;
    }

    // Очищаем контейнер
    filtersContainer.innerHTML = '';

    // Создаем фильтр "Все"
    const allFilterBtn = this.createFilterButton('ALL', 'Все');
    allFilterBtn.classList.add('active'); // Активен по умолчанию
    filtersContainer.appendChild(allFilterBtn);

    // Создаем фильтры для каждой категории
    Object.values(ClothingCategory).forEach(category => {
      const filterBtn = this.createFilterButton(category, this.getCategoryNameRu(ClothingCategory[category as keyof typeof ClothingCategory]));
      filtersContainer.appendChild(filterBtn);
    });

    logger.info('Filters created');
  }

  /**
   * Создать кнопку фильтра
   */
  private createFilterButton(filterValue: string, filterText: string): HTMLElement {
    const button = document.createElement('button');
    button.className = 'wardrobe-filter-btn';
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
    logger.info('Setting active filter', { filter: filterValue });

    // Снимаем активный класс со всех кнопок
    const allButtons = document.querySelectorAll('.wardrobe-filter-btn');
    allButtons.forEach(btn => btn.classList.remove('active'));

    // Устанавливаем активный класс на выбранную кнопку
    const activeButton = document.querySelector(`.wardrobe-filter-btn[data-filter="${filterValue}"]`) as HTMLElement;
    if (activeButton) {
      activeButton.classList.add('active');
    }

    // Обновляем текущий фильтр
    this.currentFilter = filterValue;

    // Перерисовываем грид с учетом фильтра
    this.renderGrid();

    logger.info('Filter applied', { filter: filterValue });
  }


  /**
   * Преобразовать категорию в enum (сервер уже вернул нормализованную)
   */
  private stringToClothingCategory(category: string): ClothingCategory {
    const normalized = category.toUpperCase().trim();
    
    if (normalized in ClothingCategory) {
      return ClothingCategory[normalized as keyof typeof ClothingCategory];
    }
    
    // Fallback
    return ClothingCategory.BODYWEAR;
  }

  /**
   * Обработать фото с удалением фона и классификацией
   */
  async processPhotoWithBackgroundRemoval(file: File): Promise<void> {
    try {
      // Конвертируем файл в base64
      const base64 = await this.fileToBase64(file);

      logger.info('Sending photo to classify and remove background...');

      // Вызываем API classify-clothing (который делает и удаление фона и классификацию)
      const response = await fetch('/api/classify-clothing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_base64: base64
        })
      });

      if (!response.ok) {
        throw new Error(`Classification failed: ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Classification failed');
      }

      logger.info('Photo classified successfully', {
        timing: result.timing,
        classification: result.classification
      });

      // Преобразуем категорию в enum (сервер уже вернул нормализованную)
      const categoryEnum = this.stringToClothingCategory(result.classification.category);

      logger.info('Classification from server', {
        category: result.classification.category,
        subtype: result.classification.subtype,
        color: result.classification.color  // Уже на русском от сервера
      });

      // Скрываем индикатор загрузки
      this.showLoadingInModal(false);

      // Показываем обработанное изображение в модальном окне
      this.showImageInModal(result.processed_image_base64);

      // Показываем информацию о классификации
      this.showClassificationInfo(
        categoryEnum,
        result.classification.color,
        result.classification.material,
        result.classification.style,
        result.classification.fit,
        result.classification.description
      );

      // Сохраняем текущее изображение и данные классификации для подтверждения
      this.currentPreviewImage = result.processed_image_base64;
      this.currentClassification = result.classification;

    } catch (error) {
      // Скрываем индикатор загрузки при ошибке
      this.showLoadingInModal(false);
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error processing photo with background removal', {
        error: errorMessage,
        errorType: error instanceof Error ? error.constructor.name : typeof error
      });
      
      // Fallback - показываем оригинальное фото если удаление фона не сработало
      try {
        const base64 = await this.fileToBase64(file);
        logger.warn('Showing original photo without background removal');
        this.showImageInModal(base64);
        this.currentPreviewImage = base64;
      } catch (fallbackError) {
        const fallbackErrorMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        logger.error('Error showing original photo', { error: fallbackErrorMessage });
        this.cancelPreview();
      }
    }
  }

  /**
   * Очистить модальное окно предпросмотра
   */
  private clearPreviewModal(): void {
    // Очищаем изображение
    const imageElement = document.getElementById('wardrobe-preview-image') as HTMLImageElement;
    if (imageElement) {
      imageElement.src = '';
    }

    // Очищаем информацию о классификации
    const infoElement = document.getElementById('wardrobe-preview-info');
    if (infoElement) {
      infoElement.innerHTML = '';
      infoElement.style.display = 'none';
    }

    // Очищаем текущие данные
    this.currentPreviewImage = null;
    this.currentClassification = null;

    logger.info('Preview modal cleared');
  }

  /**
   * Показать модальное окно предпросмотра
   */
  showPreviewModal(): void {
    // Полностью очищаем модальное окно перед показом
    this.clearPreviewModal();

    const modal = document.getElementById('wardrobe-preview-modal');

    if (modal) {
      modal.classList.remove('hidden');
    }

    logger.info('Preview modal shown and cleared');
  }

  /**
   * Скрыть модальное окно предпросмотра
   */
  private hidePreviewModal(): void {
    const modal = document.getElementById('wardrobe-preview-modal');
    const imageElement = document.getElementById('wardrobe-preview-image') as HTMLImageElement;
    
    // Очищаем изображение при закрытии
    if (imageElement) {
      imageElement.src = '';
    }
    
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  /**
   * Показать/скрыть индикатор загрузки в модальном окне
   */
  showLoadingInModal(show: boolean): void {
    const loadingElement = document.getElementById('wardrobe-preview-loading');
    const actionsElement = document.getElementById('wardrobe-preview-actions');
    
    if (loadingElement) {
      if (show) {
        loadingElement.classList.remove('hidden');
      } else {
        loadingElement.classList.add('hidden');
      }
    }

    if (actionsElement) {
      if (show) {
        actionsElement.style.display = 'none';
      } else {
        actionsElement.style.display = 'flex';
      }
    }
  }

  /**
   * Показать изображение в модальном окне
   */
  private showImageInModal(base64: string): void {
    const imageElement = document.getElementById('wardrobe-preview-image') as HTMLImageElement;
    if (imageElement) {
      imageElement.src = base64;
    }
  }

  /**
   * Показать информацию о классификации в модальном окне
   */
  private showClassificationInfo(category: ClothingCategory, color: string, material?: string, style?: string, fit?: string, description?: string): void {
    // Создаем или находим контейнер для информации
    let infoElement = document.getElementById('wardrobe-preview-info');

    if (!infoElement) {
      // Создаем элемент если не существует
      infoElement = document.createElement('div');
      infoElement.id = 'wardrobe-preview-info';
      infoElement.className = 'wardrobe-preview-info';

      const imageContainer = document.querySelector('.wardrobe-preview-image-container');
      if (imageContainer) {
        imageContainer.parentElement?.insertBefore(infoElement, imageContainer.nextSibling);
      }
    }

    // Переводим категорию на русский
    const categoryRu = this.getCategoryNameRu(category);

    // Формируем HTML с информацией
    let infoHtml = `
      <div class="classification-item">
        <span class="classification-label">Категория:</span>
        <span class="classification-value">${categoryRu}</span>
      </div>
      <div class="classification-item">
        <span class="classification-label">Цвет:</span>
        <span class="classification-value">${color || 'Не определен'}</span>
      </div>
    `;

    // Добавляем дополнительные поля если они есть
    if (material) {
      infoHtml += `
      <div class="classification-item">
        <span class="classification-label">Материал:</span>
        <span class="classification-value">${material}</span>
      </div>
      `;
    }

    if (style) {
      infoHtml += `
      <div class="classification-item">
        <span class="classification-label">Стиль:</span>
        <span class="classification-value">${style}</span>
      </div>
      `;
    }

    if (fit) {
      infoHtml += `
      <div class="classification-item">
        <span class="classification-label">Посадка:</span>
        <span class="classification-value">${fit}</span>
      </div>
      `;
    }

    if (description) {
      infoHtml += `
      <div class="classification-item">
        <span class="classification-label">Описание:</span>
        <span class="classification-value">${description}</span>
      </div>
      `;
    }

    infoElement.innerHTML = infoHtml;

    // Показываем элемент
    infoElement.style.display = 'block';
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
   * Подтвердить предпросмотр и добавить карточку
   */
  private async confirmPreview(): Promise<void> {
    if (!this.currentPreviewImage || !this.currentClassification) {
      logger.warn('No preview image or classification data to confirm');
      return;
    }

    logger.info('Confirming preview - adding item optimistically');

    // Создаем временный элемент для немедленного отображения
    const tempItem: WardrobeItem = {
      id: Date.now(), // временный ID
      imageUrl: this.currentPreviewImage,
      createdAt: new Date().toISOString()
    };

    // Добавляем в массив элементов сразу (оптимистичное обновление UI)
    this.wardrobeItems.unshift(tempItem);

    // Сохраняем данные для отправки на сервер
    const imageToSave = this.currentPreviewImage;
    const classificationData = this.currentClassification;

    // Перерисовываем грид сразу
    this.renderGrid();

    // Скрываем модальное окно сразу
    this.hidePreviewModal();

    // Очищаем текущие данные
    this.currentPreviewImage = null;
    this.currentClassification = null;

    logger.info('Item added to grid, saving to server in background');

    // Сохраняем на сервер в фоне
    try {
      // Получаем initData из Telegram WebApp
      const initData = (window as any).Telegram?.WebApp?.initData || '';

      // Отправляем на сервер с данными классификации
      const response: Response = await fetch('/api/wardrobe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          initData,
          imageBase64: imageToSave,
          category: classificationData.category,
          color: classificationData.color,
          material: classificationData.material,
          style: classificationData.style,
          fit: classificationData.fit,
          description: classificationData.description
        })
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result: any = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to save item');
      }

      logger.info('Item saved successfully on server', { id: result.item.id });

      // Заменяем временный элемент на реальный с сервера (только в массиве)
      const index = this.wardrobeItems.findIndex(item => item.id === tempItem.id);
      if (index !== -1) {
        this.wardrobeItems[index] = result.item;
        // НЕ перерисовываем грид - визуально ничего не изменилось
        // Картинка уже отображается, просто обновили id и imageUrl в массиве
      }

      // Добавляем в кэш
      dataCacheManager.addWardrobeItem(result.item);

      // Отправляем событие о сохранении нового элемента гардероба
      window.dispatchEvent(new CustomEvent('wardrobe:item-saved', {
        detail: { item: result.item }
      }));

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error saving wardrobe item to server', { error: errorMessage });

      // Удаляем временный элемент при ошибке
      const index = this.wardrobeItems.findIndex(item => item.id === tempItem.id);
      if (index !== -1) {
        this.wardrobeItems.splice(index, 1);
        this.renderGrid();
      }

      alert('Ошибка при сохранении предмета на сервер. Предмет не был сохранен.');
    }
  }

  /**
   * Отменить предпросмотр
   */
  private cancelPreview(): void {
    logger.info('Cancelling preview');

    // Скрываем модальное окно
    this.hidePreviewModal();

    // Очищаем текущие данные
    this.currentPreviewImage = null;
    this.currentClassification = null;

    // Скрываем информацию о классификации
    const infoElement = document.getElementById('wardrobe-preview-info');
    if (infoElement) {
      infoElement.style.display = 'none';
    }
  }

  /**
   * Рендерить грид с карточками
   */
  private renderGrid(): void {
    const grid = document.getElementById('wardrobe-clothes-grid');
    if (!grid) {
      logger.error('Wardrobe grid element not found');
      return;
    }

    // Очищаем грид, кроме кнопки добавления
    const addBtn = document.getElementById('add-item-btn');
    grid.innerHTML = '';
    if (addBtn) {
      grid.appendChild(addBtn);
    }

    // Фильтруем элементы по текущему фильтру
    const filteredItems = this.getFilteredItems();

    // Добавляем карточки одежды (только отфильтрованные)
    filteredItems.forEach(item => {
      const card = this.createItemCard(item);
      grid.appendChild(card);
    });

    logger.info(`Grid rendered with ${filteredItems.length} filtered items (total: ${this.wardrobeItems.length})`);
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
   * Создать карточку элемента одежды
   */
  private createItemCard(item: WardrobeItem): HTMLElement {
    const card = document.createElement('div');
    card.className = 'wardrobe-item-card';
    card.dataset['itemId'] = item.id.toString();

    const content = document.createElement('div');
    content.className = 'wardrobe-item-card-content';

    const image = document.createElement('img');
    image.className = 'wardrobe-item-image';
    image.src = item.imageUrl;
    image.alt = item.name || 'Одежда';

    content.appendChild(image);
    card.appendChild(content);

    // Обработчик удаления карточки (долгое нажатие)
    let longPressTimer: number;
    
    const startLongPress = () => {
      longPressTimer = window.setTimeout(() => {
        if (confirm('Удалить этот предмет из гардероба?')) {
          this.removeItem(item.id);
        }
      }, 800); // 800ms для долгого нажатия
    };

    const cancelLongPress = () => {
      clearTimeout(longPressTimer);
    };

    card.addEventListener('mousedown', startLongPress);
    card.addEventListener('mouseup', cancelLongPress);
    card.addEventListener('mouseleave', cancelLongPress);
    card.addEventListener('touchstart', startLongPress);
    card.addEventListener('touchend', cancelLongPress);

    return card;
  }

  /**
   * Удалить элемент из гардероба
   */
  private async removeItem(itemId: number): Promise<void> {
    logger.info('Removing item', { itemId });

    try {
      // Получаем initData из Telegram WebApp
      const initData = (window as any).Telegram?.WebApp?.initData || '';

      // Отправляем запрос на сервер
      const response = await fetch(`/api/wardrobe/${itemId}?initData=${encodeURIComponent(initData)}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete item');
      }

      logger.info('Item deleted successfully', { itemId });

      // Удаляем из массива
      const index = this.wardrobeItems.findIndex(item => item.id === itemId);
      if (index !== -1) {
        this.wardrobeItems.splice(index, 1);
      }

      // Удаляем из кэша
      dataCacheManager.removeWardrobeItem(itemId);

      // Перерисовываем грид
      this.renderGrid();

      logger.info(`Item removed. Remaining items: ${this.wardrobeItems.length}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error removing wardrobe item', { error: errorMessage, itemId });
      
      alert('Ошибка при удалении предмета. Попробуйте еще раз.');
    }
  }

  /**
   * Загрузить элементы гардероба (из кэша или с сервера)
   */
  private async loadWardrobeItems(): Promise<void> {
    try {
      // Сначала пробуем получить из кэша
      if (dataCacheManager.isDataLoaded()) {
        this.wardrobeItems = dataCacheManager.getWardrobeItems();
        logger.info(`Loaded ${this.wardrobeItems.length} items from cache`);
        return;
      }

      // Если кэш еще загружается - ждем
      if (dataCacheManager.isDataLoading()) {
        logger.info('Waiting for cache to load...');
        // Ждем максимум 3 секунды
        const maxWaitTime = 3000;
        const startTime = Date.now();
        
        while (dataCacheManager.isDataLoading() && (Date.now() - startTime) < maxWaitTime) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (dataCacheManager.isDataLoaded()) {
          this.wardrobeItems = dataCacheManager.getWardrobeItems();
          logger.info(`Loaded ${this.wardrobeItems.length} items from cache after waiting`);
          return;
        }
      }

      // Если кэш не загрузился - загружаем напрямую с сервера
      logger.info('Loading wardrobe items from server (cache not available)');

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
      logger.info(`Loaded ${this.wardrobeItems.length} items from server`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error loading wardrobe items', { error: errorMessage });
      this.wardrobeItems = [];
    }
  }

  /**
   * Конвертировать файл в base64
   */
  fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Получить статус менеджера гардероба
   */
  getStatus() {
    return {
      initialized: true,
      itemsCount: this.wardrobeItems.length,
      currentFilter: this.currentFilter,
      hasPreviewImage: !!this.currentPreviewImage,
      cleanupFunctionsCount: this.cleanupFunctions.length,
    };
  }

  /**
   * Очистка ресурсов
   */
  destroy(): void {
    logger.info('Destroying wardrobe manager');

    // Выполняем все функции очистки
    this.cleanupFunctions.forEach(cleanup => {
      try {
        cleanup();
      } catch (error) {
        logger.error('Error during cleanup', error);
      }
    });

    this.cleanupFunctions = [];
    this.currentPreviewImage = null;
    this.currentClassification = null;
    this.currentFilter = 'ALL'; // Сбрасываем фильтр
  }
}

// Создаем глобальный экземпляр менеджера гардероба
export const uiWardrobeManager = new UIWardrobeManager();
