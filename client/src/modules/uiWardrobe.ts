/**
 * Модуль для управления UI гардероба
 * Грид с карточками одежды и модальное окно предпросмотра
 */

import { logger } from './logger';

/**
 * Интерфейс для элемента гардероба
 */
interface WardrobeItem {
  id: number;
  imageUrl: string;
  name?: string;
  category?: string;
  color?: string;
  tags?: string[];
  createdAt: string;
}

/**
 * Класс для управления UI гардероба с гридом карточек
 */
export class UIWardrobeManager {
  private cleanupFunctions: (() => void)[] = [];
  private wardrobeItems: WardrobeItem[] = [];
  private currentPreviewImage: string | null = null;

  constructor() {
    logger.info('Wardrobe Grid Manager initialized');
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
        this.handlePhotoUpload();
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
   * Обработчик загрузки фото
   */
  private async handlePhotoUpload(): Promise<void> {
    try {
      logger.info('Starting photo upload process');

      // Создаем input для выбора файла
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';

      input.onchange = async (event) => {
        try {
          logger.info('Input onchange triggered');
          const target = event.target as HTMLInputElement;
          const file = target.files?.[0];

          if (file) {
            logger.info('Photo selected for upload', { fileName: file.name, size: file.size });

            // Показываем модальное окно с индикатором загрузки
            this.showPreviewModal();
            this.showLoadingInModal(true);

            // Обрабатываем фото с удалением фона
            await this.processPhotoWithBackgroundRemoval(file);
          } else {
            logger.warn('No file selected');
          }
        } catch (error) {
          logger.error('Error in photo upload onchange handler', error);
        }
      };

      // Добавляем input в DOM и кликаем по нему
      document.body.appendChild(input);
      logger.info('Input element added to DOM, triggering click');
      input.click();

      // Удаляем input после использования
      setTimeout(() => {
        document.body.removeChild(input);
        logger.info('Input element removed from DOM');
      }, 1000);

    } catch (error) {
      logger.error('Error in handlePhotoUpload', error);
    }
  }

  /**
   * Обработать фото с удалением фона
   */
  private async processPhotoWithBackgroundRemoval(file: File): Promise<void> {
    try {
      // Конвертируем файл в base64
      const base64 = await this.fileToBase64(file);

      logger.info('Sending photo to remove background...');

      // Вызываем API через прокси на нашем сервере
      const response = await fetch('/api/remove-background', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_base64: base64
        })
      });

      if (!response.ok) {
        throw new Error(`Background removal failed: ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Background removal failed');
      }

      logger.info('Background removed successfully', {
        timing: result.timing,
        originalSize: result.image_info?.original_size,
        resultSize: result.image_info?.result_size
      });

      // Скрываем индикатор загрузки
      this.showLoadingInModal(false);

      // Показываем обработанное изображение в модальном окне
      this.showImageInModal(result.image_base64);

      // Сохраняем текущее изображение для подтверждения
      this.currentPreviewImage = result.image_base64;

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
   * Показать модальное окно предпросмотра
   */
  private showPreviewModal(): void {
    const modal = document.getElementById('wardrobe-preview-modal');
    const imageElement = document.getElementById('wardrobe-preview-image') as HTMLImageElement;
    
    // Очищаем предыдущее изображение
    if (imageElement) {
      imageElement.src = '';
    }
    
    if (modal) {
      modal.classList.remove('hidden');
    }
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
  private showLoadingInModal(show: boolean): void {
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
   * Подтвердить предпросмотр и добавить карточку
   */
  private async confirmPreview(): Promise<void> {
    if (!this.currentPreviewImage) {
      logger.warn('No preview image to confirm');
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

    // Сохраняем imageBase64 для отправки на сервер
    const imageToSave = this.currentPreviewImage;

    // Перерисовываем грид сразу
    this.renderGrid();

    // Скрываем модальное окно сразу
    this.hidePreviewModal();

    // Очищаем текущее превью
    this.currentPreviewImage = null;

    logger.info('Item added to grid, saving to server in background');

    // Сохраняем на сервер в фоне
    try {
      // Получаем initData из Telegram WebApp
      const initData = (window as any).Telegram?.WebApp?.initData || '';

      // Отправляем на сервер
      const response = await fetch('/api/wardrobe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          initData,
          imageBase64: imageToSave
        })
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to save item');
      }

      logger.info('Item saved successfully on server', { id: result.item.id });

      // Заменяем временный элемент на реальный с сервера
      const index = this.wardrobeItems.findIndex(item => item.id === tempItem.id);
      if (index !== -1) {
        this.wardrobeItems[index] = result.item;
        // Обновляем грид с реальными данными
        this.renderGrid();
      }

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

    // Очищаем текущее превью
    this.currentPreviewImage = null;
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

    // Добавляем карточки одежды
    this.wardrobeItems.forEach(item => {
      const card = this.createItemCard(item);
      grid.insertBefore(card, addBtn); // Вставляем перед кнопкой добавления
    });

    logger.info(`Grid rendered with ${this.wardrobeItems.length} items`);
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
   * Загрузить элементы гардероба с сервера
   */
  private async loadWardrobeItems(): Promise<void> {
    try {
      logger.info('Loading wardrobe items from server');

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
  private fileToBase64(file: File): Promise<string> {
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
  }
}

// Создаем глобальный экземпляр менеджера гардероба
export const uiWardrobeManager = new UIWardrobeManager();
