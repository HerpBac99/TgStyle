/**
 * Менеджер гардероба
 * Координирует UI, сервисы и обработку данных
 */

import { logger } from '../logger';
import { WardrobeItem, ClassificationResult } from '@/types/wardrobe';
import { PhotoUploadHandler } from '../photoUploadManager';
import { wardrobeService } from './WardrobeService';
import { photoProcessor } from '../shared/PhotoProcessor';
import { fileToBase64 } from '../shared/utils';
import { uiModalManager } from '../uiModalManager';

/**
 * Менеджер гардероба
 */
export class WardrobeManager implements PhotoUploadHandler {
  private cleanupFunctions: (() => void)[] = [];
  private wardrobeItems: WardrobeItem[] = [];
  private currentPreviewImage: string | null = null;
  private currentClassification: ClassificationResult | null = null;
  private currentFilter: string = 'ALL';

  constructor() {
    logger.info('WardrobeManager initialized');
  }

  /**
   * Открыть гардероб
   */
  async handleWardrobeOpen(): Promise<void> {
    logger.info('Wardrobe opened');

    // Настраиваем обработчики
    this.setupEventListeners();

    // Загружаем вещи
    await this.loadWardrobe();

    // Создаем фильтры
    this.createFilters();

    // Рендерим грид
    this.renderGrid();
  }

  /**
   * Настройка обработчиков событий
   */
  private setupEventListeners(): void {
    const addBtn = document.getElementById('add-item-btn');
    const confirmBtn = document.getElementById('wardrobe-preview-confirm');
    const cancelBtn = document.getElementById('wardrobe-preview-cancel');

    if (addBtn) {
      const handleAdd = () => this.handlePhotoUpload();
      addBtn.addEventListener('click', handleAdd);
      this.cleanupFunctions.push(() => addBtn.removeEventListener('click', handleAdd));
    }

    if (confirmBtn) {
      const handleConfirm = () => this.confirmPreview();
      confirmBtn.addEventListener('click', handleConfirm);
      this.cleanupFunctions.push(() => confirmBtn.removeEventListener('click', handleConfirm));
    }

    if (cancelBtn) {
      const handleCancel = () => this.cancelPreview();
      cancelBtn.addEventListener('click', handleCancel);
      this.cleanupFunctions.push(() => cancelBtn.removeEventListener('click', handleCancel));
    }
  }

  /**
   * Загрузить гардероб
   */
  private async loadWardrobe(): Promise<void> {
    try {
      this.wardrobeItems = await wardrobeService.loadWardrobe();
      logger.info(`Loaded ${this.wardrobeItems.length} items`);
    } catch (error) {
      logger.error('Error loading wardrobe', error);
      this.wardrobeItems = [];
    }
  }

  /**
   * Создать фильтры
   */
  private createFilters(): void {
    const filterContainer = document.getElementById('wardrobe-filters');
    if (!filterContainer) return;

    filterContainer.innerHTML = '';

    const categories = [
      { key: 'ALL', label: 'Все' },
      { key: 'OUTERWEAR', label: 'Верхняя одежда' },
      { key: 'INNERWEAR', label: 'Кофты'},
      { key: 'BODYWEAR', label: 'Футболки и рубашки' },
      { key: 'FULLBODY', label: 'Платья и костюмы'},
      { key: 'LEGWEAR', label: 'Штаны' },
      { key: 'FOOTWEAR', label: 'Обувь' },
      { key: 'HEADWEAR', label: 'Головные уборы' },
      { key: 'ACCESSORIES', label: 'Аксессуары' }
    ];

    categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = `wardrobe-filter-btn${cat.key === this.currentFilter ? ' active' : ''}`;
      btn.textContent = cat.label;
      btn.dataset['category'] = cat.key;

      btn.addEventListener('click', () => {
        this.currentFilter = cat.key;
        this.updateFilterButtons();
        this.renderGrid();
      });

      filterContainer.appendChild(btn);
    });
  }

  /**
   * Обновить состояние кнопок фильтров
   */
  private updateFilterButtons(): void {
    const buttons = document.querySelectorAll('.wardrobe-filter-btn');
    buttons.forEach(btn => {
      const category = (btn as HTMLElement).dataset['category'];
      btn.classList.toggle('active', category === this.currentFilter);
    });
  }

  /**
   * Отрендерить грид
   */
  private renderGrid(): void {
    const grid = document.getElementById('wardrobe-clothes-grid');
    if (!grid) {
      logger.error('Wardrobe grid element not found!');
      return;
    }

    // Фильтруем вещи
    const filteredItems = wardrobeService.filterByCategory(this.wardrobeItems, this.currentFilter);

    // Сохраняем кнопку "Добавить" если она есть
    const addBtn = document.getElementById('add-item-btn');
    
    // Очищаем грид
    grid.innerHTML = '';
    
    // Возвращаем кнопку "Добавить" обратно
    if (addBtn) {
      grid.appendChild(addBtn);
    }

    // Добавляем карточки
    filteredItems.forEach(item => {
      const card = this.createItemCard(item);
      grid.appendChild(card);
    });
  }

  /**
   * Создать карточку вещи
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

    // Обработчик удаления (долгое нажатие)
    let longPressTimer: number;

    const startLongPress = () => {
      longPressTimer = window.setTimeout(() => {
        if (confirm('Удалить этот предмет из гардероба?')) {
          this.removeItem(item.id);
        }
      }, 800);
    };

    const cancelLongPress = () => clearTimeout(longPressTimer);

    card.addEventListener('mousedown', startLongPress);
    card.addEventListener('mouseup', cancelLongPress);
    card.addEventListener('mouseleave', cancelLongPress);
    card.addEventListener('touchstart', startLongPress);
    card.addEventListener('touchend', cancelLongPress);

    return card;
  }

  /**
   * Удалить вещь
   */
  private async removeItem(itemId: number): Promise<void> {
    try {
      await wardrobeService.deleteItem(itemId);

      // Удаляем из локального массива
      const index = this.wardrobeItems.findIndex(item => item.id === itemId);
      if (index !== -1) {
        this.wardrobeItems.splice(index, 1);
      }

      // Перерисовываем
      this.renderGrid();

      logger.info(`Item removed. Remaining: ${this.wardrobeItems.length}`);
    } catch (error) {
      alert('Ошибка при удалении предмета. Попробуйте еще раз.');
    }
  }

  // ============================================
  // PhotoUploadHandler интерфейс
  // ============================================

  /**
   * Показать модальное окно предпросмотра
   */
  showPreviewModal(): void {
    uiModalManager.showWardrobePreviewModal({
      type: 'wardrobe-preview',
      modalId: 'wardrobe-preview-modal',
      allowManualCategorySelection: true, // ✅ Разрешаем ручной выбор категории
      onCategoryChange: (newCategory) => {
        // Обновляем категорию в текущих данных классификации
        if (this.currentClassification) {
          this.currentClassification.category = newCategory;
        }
      },
      onConfirm: () => this.confirmPreview(),
      onCancel: () => this.cancelPreview()
    });
  }

  /**
   * Показать/скрыть индикатор загрузки
   */
  showLoadingInModal(show: boolean): void {
    uiModalManager.showLoadingInModal(show);
  }

  /**
   * Обработать фото с удалением фона
   */
  async processPhotoWithBackgroundRemoval(file: File): Promise<void> {
    try {
      const base64 = await fileToBase64(file);
      logger.info('Processing photo with background removal');

      // Классифицируем и удаляем фон
      const result = await photoProcessor.classifyAndRemoveBackground(base64);

      // Скрываем индикатор загрузки
      this.showLoadingInModal(false);

      // Показываем результат
      uiModalManager.showImageInModal(result.processedImage);
      uiModalManager.showClassificationInfo(
        result.classification.category,
        result.classification.color,
        result.classification.material
      );

      // Сохраняем для подтверждения
      this.currentPreviewImage = result.processedImage;
      this.currentClassification = result.classification;

    } catch (error) {
      this.showLoadingInModal(false);
      logger.error('Error processing photo', error);

      // Fallback - показываем оригинальное фото
      try {
        const base64 = await fileToBase64(file);
        uiModalManager.showImageInModal(base64);
        this.currentPreviewImage = base64;
      } catch (fallbackError) {
        logger.error('Error showing original photo', fallbackError);
        uiModalManager.hide();
      }
    }
  }

  /**
   * Конвертировать файл в base64
   */
  async fileToBase64(file: File): Promise<string> {
    return fileToBase64(file);
  }

  /**
   * Обработать загрузку фото
   */
  async handlePhotoUpload(): Promise<void> {
    try {

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';

      input.onchange = async (event) => {
        try {
          const target = event.target as HTMLInputElement;
          const file = target.files?.[0];

          if (file) {
            this.showPreviewModal();
            this.showLoadingInModal(true);
            await this.processPhotoWithBackgroundRemoval(file);
          }
        } catch (error) {
          logger.error('Error in photo upload handler', error);
        }
      };

      document.body.appendChild(input);
      input.click();

      setTimeout(() => document.body.removeChild(input), 1000);

    } catch (error) {
      logger.error('Error in handlePhotoUpload', error);
    }
  }

  /**
   * Подтвердить предпросмотр и сохранить
   */
  private async confirmPreview(): Promise<void> {
    if (!this.currentPreviewImage || !this.currentClassification) {
      return;
    }

    // Получаем финальную категорию (может быть изменена пользователем)
    const finalCategory = uiModalManager.getCurrentCategory();
    if (finalCategory) {
      this.currentClassification.category = finalCategory;
      logger.info('Using manually selected category', { category: finalCategory });
    }

    uiModalManager.hide();

    const imageToSave = this.currentPreviewImage;
    const classification = this.currentClassification;

    this.currentPreviewImage = null;
    this.currentClassification = null;

    try {
      // Сохраняем через сервис
      const item = await photoProcessor.saveToWardrobe(imageToSave, classification);

      // Добавляем в локальный массив
      this.wardrobeItems.push(item);

      // Перерисовываем
      this.renderGrid();

      // Отправляем событие
      window.dispatchEvent(new CustomEvent('wardrobe:item-saved', {
        detail: { item }
      }));

      logger.info('Wardrobe item added', { id: item.id });

    } catch (error) {
      alert('Ошибка при сохранении предмета. Попробуйте еще раз.');
    }
  }

  /**
   * Отменить предпросмотр
   */
  private cancelPreview(): void {
    this.currentPreviewImage = null;
    this.currentClassification = null;
  }

  /**
   * Получить статус менеджера
   */
  getStatus() {
    return {
      initialized: true,
      itemsCount: this.wardrobeItems.length,
      currentFilter: this.currentFilter,
      hasPreviewImage: !!this.currentPreviewImage,
      cleanupFunctionsCount: this.cleanupFunctions.length
    };
  }

  /**
   * Очистка
   */
  destroy(): void {
    this.cleanupFunctions.forEach(cleanup => cleanup());
    this.cleanupFunctions = [];
  }
}

// Экспортируем синглтон
export const wardrobeManager = new WardrobeManager();
