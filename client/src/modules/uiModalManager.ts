/**
 * Универсальный менеджер модальных окон
 * Управляет всеми модальными окнами в приложении
 */

import { logger } from './logger';
import { WardrobeItem, ClothingCategory } from './photoUploadManager';

/**
 * Базовый конфиг для любой модалки
 */
interface BaseModalConfig {
  modalId: string;
  onClose?: () => void;
}

/**
 * Типы модальных окон для загрузки
 */
export type LoadingModalType = 'wardrobe' | 'canvas';

/**
 * Конфигурация для выполнения операции с загрузкой
 */
export interface LoadingOperationConfig {
  /** Тип модального окна */
  modalType: LoadingModalType;
  /** Текст для показа во время загрузки */
  loadingText: string;
  /** Асинхронная функция для выполнения */
  asyncOperation: () => Promise<any>;
}

/**
 * Конфиг для модалки выбора одежды (для капсул)
 */
export interface ClothingSelectionModalConfig extends BaseModalConfig {
  type: 'clothing-selection';
  wardrobeItems: WardrobeItem[];
  selectedItemIds?: Set<number>;
  onConfirm: (selectedItems: WardrobeItem[]) => void;
  onCancel: () => void;
  handleAdd?: () => void;
}

/**
 * Конфиг для модалки предпросмотра (для гардероба)
 */
export interface WardrobePreviewModalConfig extends BaseModalConfig {
  type: 'wardrobe-preview';
  onConfirm: () => void;
  onCancel: () => void;
  onCategoryChange?: (category: ClothingCategory) => void;
  allowManualCategorySelection?: boolean;
}

/**
 * Объединенный тип конфигурации
 */
export type ModalConfig = ClothingSelectionModalConfig | WardrobePreviewModalConfig;

/**
 * Универсальный менеджер модальных окон
 */
export class UIModalManager {
  private currentModal: ModalConfig | null = null;
  private cleanupFunctions: (() => void)[] = [];
  
  // Для clothing-selection модалки
  private selectedItems: Set<number> = new Set();
  private currentFilter: string = 'ALL';
  
  // Для wardrobe-preview модалки
  private currentCategory: ClothingCategory | null = null;
  
  // ============================================
  // ПУБЛИЧНЫЕ МЕТОДЫ - CLOTHING SELECTION MODAL
  // ============================================

  /**
   * Показать модалку выбора одежды для капсул
   */
  showClothingSelectionModal(config: ClothingSelectionModalConfig): void {
    logger.info('Showing clothing selection modal', {
      itemsCount: config.wardrobeItems.length,
      preSelectedCount: config.selectedItemIds?.size || 0
    });

    // Сохраняем конфиг
    this.currentModal = config;

    // Инициализируем выбранные элементы
    if (config.selectedItemIds) {
      this.selectedItems = new Set(config.selectedItemIds);
    } else {
      this.selectedItems.clear();
    }

    // Сбрасываем фильтр
    this.currentFilter = 'ALL';

    // Показываем модалку
    const modal = document.getElementById(config.modalId);
    if (modal) {
      modal.classList.remove('hidden');
    } else {
      logger.error('Clothing selection modal not found', { modalId: config.modalId });
      return;
    }

    // Создаем фильтры
    this.createFilters();

    // Рендерим грид с элементами
    this.renderClothingGrid(config.wardrobeItems);

    // Настраиваем обработчики
    this.setupClothingSelectionListeners(config);

    logger.info('Clothing selection modal shown');
  }

  // ============================================
  // ПУБЛИЧНЫЕ МЕТОДЫ - WARDROBE PREVIEW MODAL
  // ============================================

  /**
   * Показать модалку предпросмотра для гардероба
   */
  showWardrobePreviewModal(config: WardrobePreviewModalConfig): void {
    logger.info('Showing wardrobe preview modal');

    // Сохраняем конфиг
    this.currentModal = config;

    // Полностью очищаем модальное окно перед показом
    this.clearPreviewModal();

    // Показываем модалку
    const modal = document.getElementById(config.modalId);
    if (modal) {
      modal.classList.remove('hidden');
    } else {
      logger.error('Wardrobe preview modal not found', { modalId: config.modalId });
      return;
    }

    // Настраиваем обработчики
    this.setupWardrobePreviewListeners(config);

    logger.info('Wardrobe preview modal shown');
  }

  /**
   * Очистить модальное окно предпросмотра
   */
  clearPreviewModal(): void {
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

    logger.info('Preview modal cleared');
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
   * Изменить текст в индикаторе загрузки
   */
  setLoadingText(text: string): void {
    const textElement = document.querySelector('.wardrobe-preview-loading-text') as HTMLElement;
    if (textElement) {
      textElement.textContent = text;
    }
  }


  /**
   * Выполнить асинхронную операцию с показом модального окна загрузки
   *
   * @param config - Конфигурация операции
   * @returns Promise с результатом выполнения
   */
  async executeWithLoadingModal<T = any>(config: LoadingOperationConfig): Promise<T> {
    const { modalType, loadingText, asyncOperation: operation } = config;

    try {
      // Устанавливаем текст загрузки в зависимости от типа модального окна
      if (modalType === 'wardrobe') {
        this.setLoadingText(loadingText);
        this.showLoadingInModal(true);
      } else if (modalType === 'canvas') {
        this.setCanvasLoadingText(loadingText);
        this.showCanvasLoadingModal(true);
      }

      // Выполняем асинхронную операцию
      const result = await operation();

      return result;

    } finally {
      // В любом случае скрываем соответствующее модальное окно
      if (modalType === 'wardrobe') {
        this.showLoadingInModal(false);
      } else if (modalType === 'canvas') {
        this.showCanvasLoadingModal(false);
      }
    }
  }

  /**
   * Показать/скрыть canvas loading modal
   */
  private showCanvasLoadingModal(show: boolean): void {
    const modal = document.getElementById('canvas-loading-modal');

    if (modal) {
      if (show) {
        modal.classList.remove('hidden');
      } else {
        modal.classList.add('hidden');
      }
    }
  }

  /**
   * Изменить текст в canvas loading modal
   */
  private setCanvasLoadingText(text: string): void {
    const textElement = document.querySelector('.canvas-loading-text') as HTMLElement;
    if (textElement) {
      textElement.textContent = text;
    }
  }

  /**
   * Показать изображение в модальном окне предпросмотра
   */
  showImageInModal(base64: string): void {
    const imageElement = document.getElementById('wardrobe-preview-image') as HTMLImageElement;
    if (imageElement) {
      imageElement.src = base64;
      logger.info('Image shown in preview modal');
    }
  }

  /**
   * Показать информацию о классификации в модальном окне
   */
  showClassificationInfo(
    category: ClothingCategory, 
    color: string, 
    material?: string, 
    style?: string, 
    fit?: string, 
    description?: string
  ): void {
    // Сохраняем текущую категорию
    this.currentCategory = category;

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

    // Проверяем, разрешен ли ручной выбор категории
    const allowManualSelection = this.currentModal?.type === 'wardrobe-preview' 
      && this.currentModal.allowManualCategorySelection;

    // Формируем HTML с информацией
    let infoHtml = '';

    if (allowManualSelection) {
      // Создаем селектор категорий
      infoHtml += `
      <div class="classification-item">
        <span class="classification-label">Категория:</span>
        <select id="category-selector" class="category-selector" data-current="${category}">
          ${this.getCategoryOptions(category)}
        </select>
      </div>
      `;
    } else {
      // Переводим категорию на русский
      const categoryRu = this.getCategoryNameRu(category);
      infoHtml += `
      <div class="classification-item">
        <span class="classification-label">Категория:</span>
        <span class="classification-value">${categoryRu}</span>
      </div>
      `;
    }

    infoHtml += `
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

    // Настраиваем обработчик для селектора категорий (если он есть)
    if (allowManualSelection) {
      this.setupCategorySelector();
    }

    logger.info('Classification info shown', { 
      category: this.getCategoryNameRu(category), 
      color,
      manualSelectionAllowed: allowManualSelection 
    });
  }

  /**
   * Получить HTML опции для селектора категорий
   */
  getCategoryOptions(currentCategory: ClothingCategory): string {
    const categories = [
      { key: ClothingCategory.OUTERWEAR, label: 'Верхняя одежда' },
      { key: ClothingCategory.INNERWEAR, label: 'Кофты' },
      { key: ClothingCategory.BODYWEAR, label: 'Футболки и рубашки' },
      { key: ClothingCategory.FULLBODY, label: 'Платья и костюмы' },
      { key: ClothingCategory.LEGWEAR, label: 'Штаны' },
      { key: ClothingCategory.FOOTWEAR, label: 'Обувь' },
      { key: ClothingCategory.HEADWEAR, label: 'Головные уборы' },
      { key: ClothingCategory.ACCESSORIES, label: 'Аксессуары' }
    ];

    return categories
      .map(cat => `<option value="${cat.key}" ${cat.key === currentCategory ? 'selected' : ''}>${cat.label}</option>`)
      .join('');
  }

  /**
   * Настроить обработчик для селектора категорий
   */
  private setupCategorySelector(): void {
    const selector = document.getElementById('category-selector') as HTMLSelectElement;
    if (!selector) {
      return;
    }

    const handleChange = (event: Event) => {
      const target = event.target as HTMLSelectElement;
      const newCategory = target.value as ClothingCategory;

      logger.info('Category manually changed', {
        oldCategory: this.currentCategory,
        newCategory
      });

      // Обновляем текущую категорию
      this.currentCategory = newCategory;

      // Вызываем callback если он есть
      if (this.currentModal?.type === 'wardrobe-preview' && this.currentModal.onCategoryChange) {
        this.currentModal.onCategoryChange(newCategory);
      }
    };

    selector.addEventListener('change', handleChange);

    // Добавляем в cleanup
    this.cleanupFunctions.push(() => {
      selector.removeEventListener('change', handleChange);
    });
  }

  /**
   * Получить текущую выбранную категорию
   */
  getCurrentCategory(): ClothingCategory | null {
    return this.currentCategory;
  }

  // ============================================
  // УНИВЕРСАЛЬНЫЕ МЕТОДЫ
  // ============================================

  /**
   * Скрыть текущую модалку
   */
  hide(): void {
    if (!this.currentModal) {
      logger.warn('No modal to hide');
      return;
    }

    const modal = document.getElementById(this.currentModal.modalId);
    if (modal) {
      modal.classList.add('hidden');
      logger.info('Modal hidden', { modalId: this.currentModal.modalId });
    }

    // Очищаем обработчики
    this.cleanup();

    // Очищаем состояние
    this.currentModal = null;
    this.selectedItems.clear();
    this.currentFilter = 'ALL';
  }

  /**
   * Уничтожить менеджер модалок
   */
  destroy(): void {
    logger.info('Destroying UIModalManager');
    
    this.hide();
    this.cleanup();
    
    this.currentModal = null;
    this.selectedItems.clear();
    this.currentFilter = 'ALL';
  }

  // ============================================
  // ПРИВАТНЫЕ МЕТОДЫ - CLOTHING SELECTION
  // ============================================

  /**
   * Настроить обработчики для модалки выбора одежды
   */
  private setupClothingSelectionListeners(config: ClothingSelectionModalConfig): void {
    // Кнопка закрытия модального окна
    const closeBtn = document.getElementById('capsules-modal-close') as HTMLElement;
    if (closeBtn) {
      const handleClose = () => {
        logger.info('Clothing selection modal close button clicked');
        this.hide();
        config.onCancel();
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
        logger.info('Clothing selection modal overlay clicked');
        this.hide();
        config.onCancel();
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
        logger.info('Clothing selection next button clicked', {
          selectedCount: this.selectedItems.size
        });

        // Получаем выбранные элементы
        const selectedItemsData = config.wardrobeItems.filter(
          item => this.selectedItems.has(item.id)
        );

        // Скрываем модалку
        this.hide();

        // Вызываем callback
        config.onConfirm(selectedItemsData);
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
      const filterBtn = this.createFilterButton(
        category, 
        this.getCategoryNameRu(ClothingCategory[category as keyof typeof ClothingCategory])
      );
      filtersContainer.appendChild(filterBtn);
    });

    logger.info('Filters created');
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
    logger.info('Setting active filter', { filter: filterValue });

    // Снимаем активный класс со всех кнопок
    const allButtons = document.querySelectorAll('.capsules-filter-btn');
    allButtons.forEach(btn => btn.classList.remove('active'));

    // Устанавливаем активный класс на выбранную кнопку
    const activeButton = document.querySelector(
      `.capsules-filter-btn[data-filter="${filterValue}"]`
    ) as HTMLElement;
    if (activeButton) {
      activeButton.classList.add('active');
    }

    // Обновляем текущий фильтр
    this.currentFilter = filterValue;

    // Перерисовываем грид с учетом фильтра
    if (this.currentModal && this.currentModal.type === 'clothing-selection') {
      this.renderClothingGrid(this.currentModal.wardrobeItems);
    }
  }

  /**
   * Рендерить грид с элементами одежды
   */
  private renderClothingGrid(items: WardrobeItem[]): void {
    const grid = document.getElementById('capsules-grid');
    if (!grid) {
      logger.error('Capsules grid element not found');
      return;
    }

    // Очищаем грид
    grid.innerHTML = '';

    // Фильтруем элементы по текущему фильтру
    const filteredItems = this.getFilteredItems(items);

    // Добавляем кнопку "Добавить элемент" если передан handleAdd
    if (this.currentModal && this.currentModal.type === 'clothing-selection' && this.currentModal.handleAdd) {
      const addButton = this.createAddItemButton();
      grid.appendChild(addButton);
    }

    // Добавляем карточки одежды
    filteredItems.forEach(item => {
      const card = this.createClothingItemCard(item);
      grid.appendChild(card);
    });

    // Обновляем состояние кнопки "Далее"
    this.updateNextButtonState();

    logger.info(`Clothing grid rendered with ${filteredItems.length} filtered items`);
  }

  /**
   * Получить отфильтрованные элементы
   */
  private getFilteredItems(items: WardrobeItem[]): WardrobeItem[] {
    if (this.currentFilter === 'ALL') {
      return items;
    }

    // Фильтруем по категории
    return items.filter(item => item.category === this.currentFilter);
  }

  /**
   * Создать карточку элемента одежды
   */
  private createClothingItemCard(item: WardrobeItem): HTMLElement {
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
   * Создать кнопку "Добавить элемент"
   */
  private createAddItemButton(): HTMLElement {
    const button = document.createElement('div');
    button.className = 'add-item-btn';
    button.setAttribute('aria-label', 'Добавить предмет');

    const content = document.createElement('div');
    content.className = 'add-item-btn-content';

    // Создаем SVG иконку
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M12 5v14M5 12h14');

    svg.appendChild(path);
    content.appendChild(svg);
    button.appendChild(content);

    // Обработчик клика
    const handleClick = () => {
      logger.info('Add item button clicked in modal');
      if (this.currentModal && this.currentModal.type === 'clothing-selection' && this.currentModal.handleAdd) {
        this.currentModal.handleAdd();
      }
    };

    button.addEventListener('click', handleClick);

    // Добавляем в cleanup функции
    this.cleanupFunctions.push(() => {
      button.removeEventListener('click', handleClick);
    });

    return button;
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
    const card = document.querySelector(
      `.capsules-item-card[data-item-id="${itemId}"]`
    ) as HTMLElement;
    if (card) {
      card.classList.toggle('selected');
    }

    // Обновляем состояние кнопки "Далее"
    this.updateNextButtonState();

    logger.info('Item selection toggled', {
      itemId,
      isSelected: this.selectedItems.has(itemId),
      totalSelected: this.selectedItems.size
    });
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
    }
  }

  // ============================================
  // ПРИВАТНЫЕ МЕТОДЫ - WARDROBE PREVIEW
  // ============================================

  /**
   * Настроить обработчики для модалки предпросмотра
   */
  private setupWardrobePreviewListeners(config: WardrobePreviewModalConfig): void {
    // Кнопка подтверждения
    const confirmBtn = document.getElementById('wardrobe-preview-confirm') as HTMLElement;
    if (confirmBtn) {
      const handleConfirm = () => {
        logger.info('Wardrobe preview confirm button clicked');
        this.hide();
        config.onConfirm();
      };

      confirmBtn.addEventListener('click', handleConfirm);
      this.cleanupFunctions.push(() => {
        confirmBtn.removeEventListener('click', handleConfirm);
      });
    }

    // Кнопка отмены
    const cancelBtn = document.getElementById('wardrobe-preview-cancel') as HTMLElement;
    if (cancelBtn) {
      const handleCancel = () => {
        logger.info('Wardrobe preview cancel button clicked');
        this.hide();
        config.onCancel();
      };

      cancelBtn.addEventListener('click', handleCancel);
      this.cleanupFunctions.push(() => {
        cancelBtn.removeEventListener('click', handleCancel);
      });
    }

    // Overlay клик для закрытия
    const overlay = document.querySelector('.wardrobe-preview-overlay') as HTMLElement;
    if (overlay) {
      const handleOverlayClick = () => {
        logger.info('Wardrobe preview overlay clicked');
        this.hide();
        config.onCancel();
      };

      overlay.addEventListener('click', handleOverlayClick);
      this.cleanupFunctions.push(() => {
        overlay.removeEventListener('click', handleOverlayClick);
      });
    }
  }

  // ============================================
  // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
  // ============================================

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
   * Получить статус менеджера (для отладки)
   */
  getStatus() {
    return {
      hasCurrentModal: !!this.currentModal,
      currentModalType: this.currentModal?.type || null,
      selectedItemsCount: this.selectedItems.size,
      currentFilter: this.currentFilter,
      cleanupFunctionsCount: this.cleanupFunctions.length
    };
  }
}

// Создаем глобальный экземпляр менеджера модалок
export const uiModalManager = new UIModalManager();
