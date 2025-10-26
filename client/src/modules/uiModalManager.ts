/**
 * Универсальный менеджер модальных окон
 * Управляет всеми модальными окнами в приложении
 * 
 * Делегирует loading модальные окна в ModalService
 */

import { logger } from './logger';
import { WardrobeItem, ClothingCategory } from './photoUploadManager';
import { UICanvasResultScreen } from './uiCanvasResultScreen';

/**
 * Базовый конфиг для любой модалки
 */
interface BaseModalConfig {
  modalId: string;
  onClose?: () => void;
}



/**
 * Данные для модального окна вещи
 */
export interface ItemModalData {
  imageUrl: string;
  category: ClothingCategory;
  subtype?: string;  // Подтип одежды (свитер, джинсы, кроссовки)
  color: string;
  material?: string;
  style?: string;  // Стиль (Повседневный, Деловой, Спортивный)
  fit?: string;
  description?: string;
  // Для существующей вещи
  existingItem?: WardrobeItem;
}

/**
 * Конфиг для модального окна вещи
 */
export interface ItemModalConfig extends BaseModalConfig {
  type: 'item-modal';
  data: ItemModalData;
  allowEditCategory?: boolean;
  allowEditColorMaterial?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onDataChange?: (field: 'category' | 'subtype' | 'color' | 'material' | 'style', value: string) => void;
}

/**
 * Объединенный тип конфигурации
 */
export type ModalConfig = ItemModalConfig;

/**
 * Универсальный менеджер модальных окон
 */
export class UIModalManager {
  private currentModal: ModalConfig | null = null;
  private cleanupFunctions: (() => void)[] = [];



  // Для item-modal/wardrobe-preview модалки
  private currentModalData: ItemModalData | null = null;





  // ============================================
  // ПУБЛИЧНЫЕ МЕТОДЫ - ITEM MODAL (УНИВЕРСАЛЬНОЕ МОДАЛЬНОЕ ОКНО)
  // ============================================

  /**
   * Показать универсальное модальное окно вещи
   * Объединяет функционал showWardrobePreviewModal и showClassificationInfo
   */
  showItemModal(config: ItemModalConfig): void {
    logger.info('Showing item modal', {
      hasExistingItem: !!config.data.existingItem,
      category: config.data.category,
      allowEditCategory: config.allowEditCategory,
      allowEditColorMaterial: config.allowEditColorMaterial
    });

    // Сохраняем конфиг
    this.currentModal = config;
    this.currentModalData = config.data;

    // Очищаем модальное окно
    this.clearPreviewModal();

    // Показываем модалку
    const modal = document.getElementById(config.modalId);
    if (modal) {
      modal.classList.remove('hidden');
    } else {
      logger.error('Item modal not found', { modalId: config.modalId });
      return;
    }

    // Показываем изображение
    this.showImageInModal(config.data.imageUrl);

    // Показываем информацию о классификации
    this.showClassificationInfo(
      config.data.category,
      config.data.subtype,
      config.data.color,
      config.data.material,
      config.data.style,
      undefined, // fit - НЕ показываем
      undefined, // description - НЕ показываем
      config.allowEditColorMaterial,
      config.allowEditCategory
    );

    // Настраиваем обработчики
    this.setupItemModalListeners(config);

    logger.info('Item modal shown');
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
      // ПОЛНОСТЬЮ удаляем элемент из DOM
      infoElement.remove();
    }

    // Очищаем текущие данные
    this.currentModalData = null;

    logger.info('Preview modal cleared');
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
    subtype?: string,
    color?: string,
    material?: string,
    style?: string,
    fit?: string,
    description?: string,
    allowEditColorMaterial?: boolean,
    allowEditCategory?: boolean
  ): void {
    // Обновляем данные в currentModalData если они есть
    if (this.currentModalData) {
      this.currentModalData.category = category;
      if (subtype !== undefined) this.currentModalData.subtype = subtype;
      if (color !== undefined) this.currentModalData.color = color;
      if (material !== undefined) this.currentModalData.material = material;
      if (style !== undefined) this.currentModalData.style = style;
      if (fit !== undefined) this.currentModalData.fit = fit;
      if (description !== undefined) this.currentModalData.description = description;
    }

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
    const allowManualSelection = allowEditCategory ||
      (this.currentModal?.type === 'item-modal' && this.currentModal.allowEditCategory);

    // Формируем HTML с информацией
    let infoHtml = '';

    // 1. КАТЕГОРИЯ
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

    // 2. ТИП (SUBTYPE) - текстовое поле
    if (allowEditColorMaterial && subtype !== undefined) {
      infoHtml += `
      <div class="classification-item">
        <span class="classification-label">Тип:</span>
        <input type="text" id="subtype-input" class="classification-input" value="${subtype || ''}" placeholder="Введите тип" enterkeyhint="done" />
      </div>
      `;
    } else if (subtype) {
      infoHtml += `
      <div class="classification-item">
        <span class="classification-label">Тип:</span>
        <span class="classification-value">${subtype}</span>
      </div>
      `;
    }

    // 3. ЦВЕТ - редактируемое поле если разрешено
    if (allowEditColorMaterial) {
      infoHtml += `
      <div class="classification-item">
        <span class="classification-label">Цвет:</span>
        <input type="text" id="color-input" class="classification-input" value="${color || ''}" placeholder="Введите цвет" enterkeyhint="done" />
      </div>
      `;
    } else if (color) {
      infoHtml += `
      <div class="classification-item">
        <span class="classification-label">Цвет:</span>
        <span class="classification-value">${color}</span>
      </div>
      `;
    }

    // 4. МАТЕРИАЛ - редактируемое поле если разрешено
    if (allowEditColorMaterial) {
      infoHtml += `
      <div class="classification-item">
        <span class="classification-label">Материал:</span>
        <input type="text" id="material-input" class="classification-input" value="${material || ''}" placeholder="Введите материал" enterkeyhint="done" />
      </div>
      `;
    } else if (material) {
      infoHtml += `
      <div class="classification-item">
        <span class="classification-label">Материал:</span>
        <span class="classification-value">${material}</span>
      </div>
      `;
    }

    // 5. СТИЛЬ - селектор (как категория)
    if (allowEditColorMaterial && style !== undefined) {
      infoHtml += `
      <div class="classification-item">
        <span class="classification-label">Стиль:</span>
        <select id="style-selector" class="category-selector" data-current="${style}">
          ${this.getStyleOptions(style)}
        </select>
      </div>
      `;
    } else if (style) {
      infoHtml += `
      <div class="classification-item">
        <span class="classification-label">Стиль:</span>
        <span class="classification-value">${style}</span>
      </div>
      `;
    }

    // Посадка, Описание - НЕ показываем (системные поля)

    infoElement.innerHTML = infoHtml;

    // Показываем элемент
    infoElement.style.display = 'block';

    // Настраиваем обработчик для селектора категорий (если он есть)
    if (allowManualSelection) {
      this.setupCategorySelector();
    }

    // Настраиваем обработчики для редактируемых полей (если они есть)
    if (allowEditColorMaterial) {
      this.setupEditableFields();
    }

    logger.info('Classification info shown', {
      category: this.getCategoryNameRu(category),
      color,
      manualSelectionAllowed: allowManualSelection,
      editableColorMaterial: allowEditColorMaterial
    });
  }

  /**
   * Получить HTML опции для селектора стилей
   */
  getStyleOptions(currentStyle: string): string {
    const styles = [
      { key: 'Повседневный', label: 'Повседневный' },
      { key: 'Деловой', label: 'Деловой' },
      { key: 'Спортивный', label: 'Спортивный' },
      { key: 'Уличный', label: 'Уличный' },
      { key: 'Официальный', label: 'Официальный' },
      { key: 'Деловой повседневный', label: 'Деловой повседневный' },
      { key: 'Бохо', label: 'Бохо' },
      { key: 'Винтаж', label: 'Винтаж' },
      { key: 'Минимализм', label: 'Минимализм' },
      { key: 'Романтический', label: 'Романтический' }
    ];

    return styles
      .map(style => `<option value="${style.key}" ${style.key === currentStyle ? 'selected' : ''}>${style.label}</option>`)
      .join('');
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
        oldCategory: this.currentModalData?.category,
        newCategory
      });

      // Обновляем текущие данные
      if (this.currentModalData) {
        this.currentModalData.category = newCategory;
      }

      // Вызываем callback
      if (this.currentModal?.type === 'item-modal' && this.currentModal.onDataChange) {
        this.currentModal.onDataChange('category', newCategory);
      }
    };

    selector.addEventListener('change', handleChange);

    // Добавляем в cleanup
    this.cleanupFunctions.push(() => {
      selector.removeEventListener('change', handleChange);
    });
  }

  /**
   * Настроить обработчики для всех редактируемых полей
   */
  private setupEditableFields(): void {
    // Subtype input
    const subtypeInput = document.getElementById('subtype-input') as HTMLInputElement;
    if (subtypeInput) {
      const handleSubtypeChange = (event: Event) => {
        const target = event.target as HTMLInputElement;
        const newSubtype = target.value;

        logger.debug('Subtype manually changed', { newSubtype });

        if (this.currentModalData) {
          this.currentModalData.subtype = newSubtype;
        }

        if (this.currentModal?.type === 'item-modal' && this.currentModal.onDataChange) {
          this.currentModal.onDataChange('subtype', newSubtype);
        }
      };

      const handleEnter = (event: KeyboardEvent) => {
        if (event.key === 'Enter') {
          subtypeInput.blur();
        }
      };

      subtypeInput.addEventListener('input', handleSubtypeChange);
      subtypeInput.addEventListener('keydown', handleEnter);
      this.cleanupFunctions.push(() => {
        subtypeInput.removeEventListener('input', handleSubtypeChange);
        subtypeInput.removeEventListener('keydown', handleEnter);
      });
    }

    // Color input
    const colorInput = document.getElementById('color-input') as HTMLInputElement;
    if (colorInput) {
      const handleColorChange = (event: Event) => {
        const target = event.target as HTMLInputElement;
        const newColor = target.value;

        logger.debug('Color manually changed', { newColor });

        if (this.currentModalData) {
          this.currentModalData.color = newColor;
        }

        if (this.currentModal?.type === 'item-modal' && this.currentModal.onDataChange) {
          this.currentModal.onDataChange('color', newColor);
        }
      };

      const handleEnter = (event: KeyboardEvent) => {
        if (event.key === 'Enter') {
          colorInput.blur();
        }
      };

      colorInput.addEventListener('input', handleColorChange);
      colorInput.addEventListener('keydown', handleEnter);
      this.cleanupFunctions.push(() => {
        colorInput.removeEventListener('input', handleColorChange);
        colorInput.removeEventListener('keydown', handleEnter);
      });
    }

    // Material input
    const materialInput = document.getElementById('material-input') as HTMLInputElement;
    if (materialInput) {
      const handleMaterialChange = (event: Event) => {
        const target = event.target as HTMLInputElement;
        const newMaterial = target.value;

        logger.debug('Material manually changed', { newMaterial });

        if (this.currentModalData) {
          this.currentModalData.material = newMaterial;
        }

        if (this.currentModal?.type === 'item-modal' && this.currentModal.onDataChange) {
          this.currentModal.onDataChange('material', newMaterial);
        }
      };

      const handleEnter = (event: KeyboardEvent) => {
        if (event.key === 'Enter') {
          materialInput.blur();
        }
      };

      materialInput.addEventListener('input', handleMaterialChange);
      materialInput.addEventListener('keydown', handleEnter);
      this.cleanupFunctions.push(() => {
        materialInput.removeEventListener('input', handleMaterialChange);
        materialInput.removeEventListener('keydown', handleEnter);
      });
    }

    // Style selector
    const styleSelector = document.getElementById('style-selector') as HTMLSelectElement;
    if (styleSelector) {
      const handleStyleChange = (event: Event) => {
        const target = event.target as HTMLSelectElement;
        const newStyle = target.value;

        logger.info('Style manually changed', { newStyle });

        if (this.currentModalData) {
          this.currentModalData.style = newStyle;
        }

        if (this.currentModal?.type === 'item-modal' && this.currentModal.onDataChange) {
          this.currentModal.onDataChange('style', newStyle);
        }
      };

      styleSelector.addEventListener('change', handleStyleChange);
      this.cleanupFunctions.push(() => {
        styleSelector.removeEventListener('change', handleStyleChange);
      });
    }
  }

  /**
   * Получить текущие данные модального окна
   */
  getCurrentModalData(): ItemModalData | null {
    if (!this.currentModalData) {
      return null;
    }

    // Обновляем данные из inputs если они есть
    const categorySelector = document.getElementById('category-selector') as HTMLSelectElement;
    const subtypeInput = document.getElementById('subtype-input') as HTMLInputElement;
    const colorInput = document.getElementById('color-input') as HTMLInputElement;
    const materialInput = document.getElementById('material-input') as HTMLInputElement;
    const styleSelector = document.getElementById('style-selector') as HTMLSelectElement;

    if (categorySelector) {
      this.currentModalData.category = categorySelector.value as ClothingCategory;
    }
    if (subtypeInput) {
      this.currentModalData.subtype = subtypeInput.value;
    }
    if (colorInput) {
      this.currentModalData.color = colorInput.value;
    }
    if (materialInput) {
      this.currentModalData.material = materialInput.value;
    }
    if (styleSelector) {
      this.currentModalData.style = styleSelector.value;
    }

    return this.currentModalData;
  }



  // ============================================
  // ПУБЛИЧНЫЕ МЕТОДЫ - CAPSULE PREVIEW
  // ============================================

  /**
   * Показать предпросмотр капсулы из публичной ленты
   * Использует UICanvasResultScreen без кнопок действий
   * 
   * @param imageUrl - URL изображения капсулы
   * @param onClose - Callback при закрытии (опционально)
   */
  showCapsulePreview(imageUrl: string, onClose?: () => void): void {
    logger.info('Showing capsule preview from feed', { imageUrl });

    // Создаем экземпляр UICanvasResultScreen
    const previewScreen = new UICanvasResultScreen({
      screenId: 'capsule-result-screen',
      onDone: () => {
        // Скрываем экран и вызываем callback
        previewScreen.hide();
        if (onClose) {
          onClose();
        }
        logger.info('Capsule preview closed');
      }
    });

    // Показываем экран БЕЗ кнопок (showButtons = false)
    previewScreen.show(imageUrl, false);

    logger.info('Capsule preview shown successfully');
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
  }

  /**
   * Уничтожить менеджер модалок
   */
  destroy(): void {
    logger.info('Destroying UIModalManager');

    this.hide();
    this.cleanup();

    this.currentModal = null;
  }



  // ============================================
  // ПРИВАТНЫЕ МЕТОДЫ - ITEM MODAL
  // ============================================

  /**
   * Настроить обработчики для универсального модального окна вещи
   */
  private setupItemModalListeners(config: ItemModalConfig): void {
    // Кнопка подтверждения
    const confirmBtn = document.getElementById('wardrobe-preview-confirm') as HTMLElement;
    if (confirmBtn) {
      const handleConfirm = () => {
        logger.info('Item modal confirm button clicked');
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
        logger.info('Item modal cancel button clicked');
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
        logger.info('Item modal overlay clicked');
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
      cleanupFunctionsCount: this.cleanupFunctions.length
    };
  }
}

// Создаем глобальный экземпляр менеджера модалок
export const uiModalManager = new UIModalManager();
