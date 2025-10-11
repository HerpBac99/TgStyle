/**
 * Модуль для управления Capsules функционалом (РЕФАКТОРИНГ)
 * Координатор между Grid, Modal, Canvas и Navigation
 */

import { logger } from './logger';
import { WardrobeItem, PhotoUploadManager, PhotoUploadHandler } from './photoUploadManager';
import { navigationManager } from './navigationManager';
import { UICapsulesGrid, StyleCapsule } from './uiCapsulesGrid';
import { uiModalManager } from './uiModalManager';
import { UICanvasEditor, CanvasItem } from './uiCanvasEditor';

/**
 * Класс для управления Capsules функционалом
 * 
 * АРХИТЕКТУРА ПОСЛЕ РЕФАКТОРИНГА:
 * - UICapsulesGrid - управление гридом капсул
 * - UIModalManager - управление модальными окнами
 * - UICanvasEditor - управление canvas
 * - NavigationManager - управление BackButton
 * - UICapsulesManager - координация между компонентами
 */
export class UICapsulesManager {
  // Дочерние компоненты
  private capsulesGrid: UICapsulesGrid;
  private canvasEditor: UICanvasEditor | null = null;
  
  // Состояние
  private wardrobeItems: WardrobeItem[] = [];
  private capsules: StyleCapsule[] = [];
  private currentCapsuleId: number | null = null;
  
  // Управление режимами
  private mode: 'grid' | 'selection' | 'canvas' | null = null;
  
  // Выбранные элементы для создания капсулы
  private selectedItems: WardrobeItem[] = [];
  
  // Фото менеджер для добавления новых вещей
  private photoUploadManager: PhotoUploadManager;
  private photoUploadHandler: PhotoUploadHandler;

  constructor() {
    logger.info('UICapsulesManager initialized (refactored)');
    
    // Инициализируем грид капсул
    this.capsulesGrid = new UICapsulesGrid({
      onAdd: () => this.handleAddCapsuleClick(),
      onView: (id) => this.handleViewCapsule(id),
      onDelete: (id) => this.handleDeleteCapsule(id)
    });
    
    // Инициализируем фото менеджер
    this.photoUploadManager = new PhotoUploadManager();
    this.photoUploadHandler = this.createPhotoUploadHandler();
    this.photoUploadManager.setHandler(this.photoUploadHandler);
    
    // Подписываемся на событие сохранения нового элемента гардероба
    window.addEventListener('wardrobe:item-saved', ((event: CustomEvent) => {
      const { item } = event.detail;
      this.handleNewItemSaved(item);
    }) as EventListener);
  }

  // ============================================
  // ПУБЛИЧНЫЕ МЕТОДЫ
  // ============================================

  /**
   * Обработчик открытия capsules - показывает грид с капсулами
   */
  async handleCapsulesOpen(): Promise<void> {
    try {
      this.mode = 'grid';
      
      // Загружаем капсулы с сервера
      await this.loadCapsules();
      
      // Показываем и рендерим грид
      this.capsulesGrid.show();
      this.capsulesGrid.render(this.capsules);
      
      logger.info('Capsules grid opened', { capsulesCount: this.capsules.length });
    } catch (error) {
      logger.error('Error opening capsules grid', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Закрыть capsules полностью
   */
  closeCapsules(): void {
    logger.info('Closing capsules');
    
    // Очистка навигации
    navigationManager.clear();
    
    // Очистка компонентов
    if (this.canvasEditor) {
      this.canvasEditor.hide();
      this.canvasEditor.destroy();
      this.canvasEditor = null;
    }
    
    uiModalManager.hide();
    this.capsulesGrid.hide();
    
    // Сброс состояния
    this.mode = null;
    this.currentCapsuleId = null;
    this.selectedItems = [];
  }

  // ============================================
  // СОЗДАНИЕ НОВОЙ КАПСУЛЫ
  // ============================================

  /**
   * Обработчик клика по кнопке "Добавить капсулу"
   */
  private async handleAddCapsuleClick(): Promise<void> {
    try {
      logger.info('Add capsule button clicked');
      
      this.mode = 'selection';
      this.currentCapsuleId = null;
      this.selectedItems = [];
      
      // Скрываем грид
      this.capsulesGrid.hide();
      
      // Загружаем элементы гардероба
      await this.loadWardrobeItems();
      
      // Показываем модалку выбора одежды
      uiModalManager.showClothingSelectionModal({
        type: 'clothing-selection',
        modalId: 'capsules-modal',
        wardrobeItems: this.wardrobeItems,
        onConfirm: (selectedItems) => this.handleClothingConfirmed(selectedItems),
        onCancel: () => this.handleClothingCancelled()
      });
      
      logger.info('Clothing selection modal shown');
    } catch (error) {
      logger.error('Error opening add capsule modal', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Обработчик подтверждения выбора одежды
   */
  private handleClothingConfirmed(selectedItems: WardrobeItem[]): void {
    logger.info('Clothing confirmed', { selectedCount: selectedItems.length });
    
    this.mode = 'canvas';
    this.selectedItems = selectedItems;
    
    // Скрываем модалку (уже скрыта в UIModalManager)
    // Инициализируем canvas
    this.initializeCanvasEditor();
    
    // Загружаем выбранные элементы БЕЗ сохраненных позиций
    const items: CanvasItem[] = this.sortItemsByLayer(selectedItems).map(item => ({ item }));
    this.canvasEditor!.loadItems(items);
    
    // Настраиваем навигацию (возврат к модалке)
    navigationManager.push(() => {
      this.returnToClothingSelection();
    }, 'Return to clothing selection from new capsule');
  }

  /**
   * Обработчик отмены выбора одежды
   */
  private handleClothingCancelled(): void {
    logger.info('Clothing selection cancelled');
    
    // Возврат к гриду
    this.mode = 'grid';
    this.selectedItems = [];
    this.capsulesGrid.show();
  }

  /**
   * Вернуться к модальному окну выбора одежды
   */
  private returnToClothingSelection(): void {
    logger.info('Returning to clothing selection');
    
    // Скрываем canvas
    if (this.canvasEditor) {
      this.canvasEditor.hide();
    }
    
    // Удаляем обработчик возврата
    navigationManager.pop();
    
    // Показываем модалку снова
    this.handleAddCapsuleClick();
  }

  // ============================================
  // РЕДАКТИРОВАНИЕ СУЩЕСТВУЮЩЕЙ КАПСУЛЫ
  // ============================================

  /**
   * Обработчик просмотра капсулы
   */
  private async handleViewCapsule(capsuleId: number): Promise<void> {
    try {
      logger.info('Viewing capsule', { capsuleId });
      
      this.mode = 'canvas';
      this.currentCapsuleId = capsuleId;
      
      // Скрываем грид
      this.capsulesGrid.hide();
      
      // Загружаем данные капсулы
      const capsuleData = await this.loadCapsuleData(capsuleId);
      
      // Загружаем элементы гардероба для возможности добавления новых вещей
      await this.loadWardrobeItems();
      
      // Инициализируем canvas
      this.initializeCanvasEditor();
      
      // УНИФИЦИРОВАННАЯ ЗАГРУЗКА: восстанавливаем с сохраненными позициями
      await this.canvasEditor!.restoreState(capsuleData.canvasData);
      
      // Настраиваем навигацию (возврат к гриду)
      navigationManager.push(() => {
        this.returnToCapsulesGrid();
      }, 'Return to capsules grid from edit');
      
      logger.info('Capsule rendered on canvas', { capsuleId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error viewing capsule', { error: errorMessage, capsuleId });
      alert('Ошибка при просмотре капсулы. Попробуйте еще раз.');
      
      // Возврат к гриду при ошибке
      this.returnToCapsulesGrid();
    }
  }

  /**
   * Обработчик удаления капсулы
   */
  private async handleDeleteCapsule(capsuleId: number): Promise<void> {
    logger.info('Deleting capsule', { capsuleId });

    try {
      // Получаем initData из Telegram WebApp
      const initData = (window as any).Telegram?.WebApp?.initData || '';

      // Отправляем запрос на сервер
      const response = await fetch(`/api/capsules/${capsuleId}?initData=${encodeURIComponent(initData)}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete capsule');
      }

      logger.info('Capsule deleted successfully', { capsuleId });

      // Удаляем из массива
      const index = this.capsules.findIndex(capsule => capsule.id === capsuleId);
      if (index !== -1) {
        this.capsules.splice(index, 1);
      }

      // Перерисовываем грид
      this.capsulesGrid.render(this.capsules);

      logger.info(`Capsule removed. Remaining capsules: ${this.capsules.length}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error removing capsule', { error: errorMessage, capsuleId });

      alert('Ошибка при удалении капсулы. Попробуйте еще раз.');
    }
  }

  /**
   * Вернуться к гриду капсул
   */
  private returnToCapsulesGrid(): void {
    logger.info('Returning to capsules grid');
    
    // Скрываем canvas
    if (this.canvasEditor) {
      this.canvasEditor.hide();
    }
    
    // Удаляем обработчик возврата
    navigationManager.pop();
    
    // Показываем грид
    this.mode = 'grid';
    this.currentCapsuleId = null;
    this.capsulesGrid.show();
  }

  // ============================================
  // ИНИЦИАЛИЗАЦИЯ CANVAS EDITOR
  // ============================================

  /**
   * Инициализировать canvas editor
   */
  private initializeCanvasEditor(): void {
    if (this.canvasEditor) {
      // Canvas уже существует - просто показываем и повторно инициализируем
      this.canvasEditor.show();
      this.canvasEditor.initializeCanvas();
      return;
    }
    
    // Создаем новый canvas editor
    this.canvasEditor = new UICanvasEditor({
      containerId: 'capsules-canvas-container',
      canvasId: 'capsules-canvas',
      onAddItem: () => this.handleCanvasAddItem(),
      onSave: () => this.handleCanvasSave()
    });
    
    this.canvasEditor.show();
    this.canvasEditor.initializeCanvas();
    
    logger.info('Canvas editor initialized');
  }

  // ============================================
  // ОБРАБОТЧИКИ CANVAS КНОПОК
  // ============================================

  /**
   * Обработчик кнопки "Добавить одежду" на canvas
   */
  private async handleCanvasAddItem(): Promise<void> {
    logger.info('Canvas add item button clicked');
    
    // Открываем upload фото через photoUploadManager
    await this.photoUploadManager.handlePhotoUpload();
  }

  /**
   * Обработчик сохранения нового элемента гардероба
   */
  private async handleNewItemSaved(item: WardrobeItem): Promise<void> {
    logger.info('New wardrobe item saved, adding to canvas', { itemId: item.id });
    
    // Добавляем элемент в массив wardrobeItems
    this.wardrobeItems.push(item);
    
    // Если canvas активен - добавляем элемент на него
    if (this.canvasEditor && this.mode === 'canvas') {
      await this.canvasEditor.addItem({ item });
    }
  }

  /**
   * Обработчик кнопки "Сохранить капсулу" на canvas
   */
  private async handleCanvasSave(): Promise<void> {
    if (!this.canvasEditor) {
      logger.error('Canvas editor not available');
      return;
    }
    
    try {
      logger.info('Canvas save button clicked', {
        isEditMode: !!this.currentCapsuleId,
        capsuleId: this.currentCapsuleId
      });
      
      // Получаем состояние canvas
      const state = await this.canvasEditor.getState();
      
      if (this.currentCapsuleId) {
        // Обновление существующей капсулы
        await this.updateCapsule(this.currentCapsuleId, state);
      } else {
        // Создание новой капсулы
        await this.createCapsule(state);
      }
      
      // Возврат к гриду
      this.returnToCapsulesGrid();
      
      // Перезагружаем капсулы
      await this.loadCapsules();
      this.capsulesGrid.render(this.capsules);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error saving capsule', { error: errorMessage, isEditMode: !!this.currentCapsuleId });
      alert('Ошибка при сохранении капсулы. Попробуйте еще раз.');
    }
  }

  // ============================================
  // СЕРВЕРНЫЕ ОПЕРАЦИИ
  // ============================================

  /**
   * Загрузить капсулы с сервера
   */
  private async loadCapsules(): Promise<void> {
    try {
      logger.info('Loading capsules from server');

      const initData = (window as any).Telegram?.WebApp?.initData || '';

      const response = await fetch(`/api/capsules?initData=${encodeURIComponent(initData)}`, {
        method: 'GET'
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to load capsules');
      }

      this.capsules = result.capsules || [];
      logger.info(`Loaded ${this.capsules.length} capsules from server`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error loading capsules', { error: errorMessage });
      this.capsules = [];
    }
  }

  /**
   * Загрузить данные конкретной капсулы с сервера
   */
  private async loadCapsuleData(capsuleId: number): Promise<any> {
    try {
      logger.info('Loading capsule data from server', { capsuleId });

      const initData = (window as any).Telegram?.WebApp?.initData || '';

      const response = await fetch(`/api/capsules/${capsuleId}?initData=${encodeURIComponent(initData)}`, {
        method: 'GET'
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to load capsule data');
      }

      logger.info('Capsule data loaded successfully', { capsuleId });
      return result.capsule;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error loading capsule data', { error: errorMessage, capsuleId });
      throw error;
    }
  }

  /**
   * Загрузить элементы гардероба с сервера
   */
  private async loadWardrobeItems(): Promise<void> {
    try {
      logger.info('Loading wardrobe items from server');

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
      logger.info(`Loaded ${this.wardrobeItems.length} wardrobe items from server`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error loading wardrobe items for capsules', { error: errorMessage });
      this.wardrobeItems = [];
    }
  }

  /**
   * Создать новую капсулу на сервере
   */
  private async createCapsule(state: any): Promise<void> {
    try {
      logger.info('Creating new capsule on server');

      const initData = (window as any).Telegram?.WebApp?.initData || '';

      // Создаем временную капсулу для оптимистичного обновления UI
      const tempCapsule: StyleCapsule = {
        id: Date.now(), // временный ID
        name: `Капсула ${new Date().toLocaleDateString()}`,
        thumbnailUrl: state.thumbnailImage,
        createdAt: new Date().toISOString()
      };

      // Добавляем в массив капсул сразу
      this.capsules.unshift(tempCapsule);

      // Отправляем на сервер
      const response = await fetch('/api/capsules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          initData,
          name: tempCapsule.name,
          canvasData: state.canvasData,
          thumbnailImage: state.thumbnailImage,
          itemIds: state.canvasData.selected_items?.map((item: WardrobeItem) => item.id) || []
        })
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to save capsule');
      }

      logger.info('Capsule saved successfully on server', { id: result.capsule.id });

      // Заменяем временную капсулу на реальную с сервера
      const index = this.capsules.findIndex(capsule => capsule.id === tempCapsule.id);
      if (index !== -1) {
        this.capsules[index] = result.capsule;
      }

      // Показываем сообщение об успехе
      if ((window as any).Telegram?.WebApp?.showPopup) {
        (window as any).Telegram.WebApp.showPopup({
          message: 'Капсула успешно сохранена!',
          buttons: [{ id: 'ok', type: 'close' }]
        });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error saving capsule to server', { error: errorMessage });

      // Удаляем временную капсулу при ошибке
      this.capsules = this.capsules.filter(c => c.id !== Date.now());

      throw error;
    }
  }

  /**
   * Обновить капсулу на сервере
   */
  private async updateCapsule(capsuleId: number, state: any): Promise<void> {
    try {
      logger.info('Updating capsule on server', { capsuleId });

      const initData = (window as any).Telegram?.WebApp?.initData || '';

      // Обновляем в массиве оптимистично
      const index = this.capsules.findIndex(c => c.id === capsuleId);
      if (index !== -1 && this.capsules[index]) {
        this.capsules[index]!.thumbnailUrl = state.thumbnailImage;
      }

      // Отправляем на сервер
      const response = await fetch(`/api/capsules/${capsuleId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          initData,
          canvasData: state.canvasData,
          thumbnailImage: state.thumbnailImage,
          itemIds: state.canvasData.selected_items?.map((item: WardrobeItem) => item.id) || []
        })
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to update capsule');
      }

      logger.info('Capsule updated successfully on server', { capsuleId });

      // Заменяем на данные с сервера
      if (index !== -1) {
        this.capsules[index] = result.capsule;
      }

      // Показываем сообщение об успехе
      if ((window as any).Telegram?.WebApp?.showPopup) {
        (window as any).Telegram.WebApp.showPopup({
          message: 'Капсула успешно обновлена!',
          buttons: [{ id: 'ok', type: 'close' }]
        });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Error updating capsule on server', { error: errorMessage, capsuleId });

      // При ошибке перезагружаем капсулы с сервера
      await this.loadCapsules();

      throw error;
    }
  }

  // ============================================
  // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
  // ============================================

  /**
   * Сортировать элементы по слоям одежды (от нижнего к верхнему)
   */
  private sortItemsByLayer(items: WardrobeItem[]): WardrobeItem[] {
    const layerOrder: Record<string, number> = {
      'LEGWEAR': 1,
      'BODYWEAR': 2,
      'INNERWEAR': 3,
      'FULLBODY': 4,
      'FOOTWEAR': 5,
      'OUTERWEAR': 6,
      'HEADWEAR': 7,
      'ACCESSORIES': 8
    };

    return items.sort((a, b) => {
      const aLayer = layerOrder[a.category?.toUpperCase() || ''] || 99;
      const bLayer = layerOrder[b.category?.toUpperCase() || ''] || 99;
      return aLayer - bLayer;
    });
  }

  /**
   * Создать обработчик для загрузки фото в контексте капсул
   */
  private createPhotoUploadHandler(): PhotoUploadHandler {
    return {
      showPreviewModal: () => {
        uiModalManager.showWardrobePreviewModal({
          type: 'wardrobe-preview',
          modalId: 'wardrobe-preview-modal',
          onConfirm: () => this.handlePhotoPreviewConfirm(),
          onCancel: () => this.handlePhotoPreviewCancel()
        });
      },

      showLoadingInModal: (show: boolean) => {
        uiModalManager.showLoadingInModal(show);
      },

      processPhotoWithBackgroundRemoval: async (_file: File) => {
        // Эта логика остается в UIWardrobeManager
        // Здесь просто заглушка
        logger.warn('processPhotoWithBackgroundRemoval called in capsules context');
      },

      fileToBase64: async (file: File) => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }
    };
  }

  /**
   * Обработчик подтверждения предпросмотра фото
   */
  private handlePhotoPreviewConfirm(): void {
    logger.info('Photo preview confirmed in capsules context');
    // Логика сохранения будет в UIWardrobeManager
    // Здесь просто скрываем модалку
  }

  /**
   * Обработчик отмены предпросмотра фото
   */
  private handlePhotoPreviewCancel(): void {
    logger.info('Photo preview cancelled in capsules context');
  }

  /**
   * Получить статус менеджера capsules
   */
  getStatus() {
    return {
      initialized: true,
      mode: this.mode,
      canvasVisible: this.canvasEditor?.getStatus().isVisible || false,
      canvasReady: this.canvasEditor?.getStatus().isInitialized || false,
      itemsCount: this.wardrobeItems.length,
      capsulesCount: this.capsules.length,
      selectedCount: this.selectedItems.length,
      currentCapsuleId: this.currentCapsuleId,
      isEditMode: !!this.currentCapsuleId,
      navigationStackSize: navigationManager.getStackSize()
    };
  }

  /**
   * Очистка ресурсов
   */
  destroy(): void {
    logger.info('Destroying UICapsulesManager');
    
    this.closeCapsules();
    
    this.wardrobeItems = [];
    this.capsules = [];
    this.selectedItems = [];
    this.currentCapsuleId = null;
    
    if (this.canvasEditor) {
      this.canvasEditor.destroy();
      this.canvasEditor = null;
    }
    
    this.capsulesGrid.destroy();
  }
}

// Создаем глобальный экземпляр менеджера capsules
export const uiCapsulesManager = new UICapsulesManager();
