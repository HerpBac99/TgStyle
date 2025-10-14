/**
 * Менеджер капсул
 * Координирует UI, сервисы и обработку данных
 */

import { logger } from '../logger';
import { WardrobeItem } from '@/types/wardrobe';
import { CanvasItem } from '@/types/capsules';
import { StyleCapsule } from '../uiCapsulesGrid';
import { PhotoUploadHandler } from '../photoUploadManager';
import { capsulesService } from './CapsulesService';
import { photoProcessor } from '../shared/PhotoProcessor';
import { itemSelector } from '../shared/ItemSelector';
import { dataLoader } from '../shared/DataLoader';
import { fileToBase64 } from '../shared/utils';
import { dataCacheManager } from '../dataCache';
import { UICapsulesGrid } from '../uiCapsulesGrid';
import { UICanvasEditor } from '../uiCanvasEditor';
import { uiModalManager } from '../uiModalManager';
import { navigationManager } from '../navigationManager';
import { capsulesSharing } from './CapsulesSharing';

/**
 * Менеджер капсул
 */
export class CapsulesManager implements PhotoUploadHandler {
  // Компоненты UI
  private capsulesGrid: UICapsulesGrid;
  private canvasEditor: UICanvasEditor | null = null;

  // Данные
  private wardrobeItems: WardrobeItem[] = [];
  private capsules: StyleCapsule[] = [];
  private currentCapsuleId: number | null = null;

  // Состояние
  private mode: 'grid' | 'selection' | 'canvas' | null = null;
  private selectedItems: WardrobeItem[] = [];

  // Предпросмотр фото
  private currentPreviewImage: string | null = null;
  private currentClassification: any = null;

  constructor() {
    logger.info('CapsulesManager initialized');

    // Инициализируем грид капсул
    this.capsulesGrid = new UICapsulesGrid({
      onAdd: () => this.handleAddCapsuleClick(),
      onView: (id) => this.handleViewCapsule(id),
      onDelete: (id) => this.handleDeleteCapsule(id)
    });

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
   * Открыть грид капсул
   */
  async handleCapsulesOpen(): Promise<void> {
    try {
      this.mode = 'grid';

      // Загружаем капсулы
      await this.loadCapsules();

      // Показываем грид
      this.capsulesGrid.show();
      this.capsulesGrid.render(this.capsules);

      logger.info('Capsules opened', { count: this.capsules.length });
    } catch (error) {
      logger.error('Error opening capsules grid', error);
    }
  }

  /**
   * Закрыть capsules полностью
   */
  closeCapsules(): void {
    logger.info('Closing capsules');

    navigationManager.clear();

    if (this.canvasEditor) {
      this.canvasEditor.hide();
      this.canvasEditor.destroy();
      this.canvasEditor = null;
    }

    uiModalManager.hide();
    this.capsulesGrid.hide();

    this.mode = null;
    this.currentCapsuleId = null;
    this.selectedItems = [];
  }

  // ============================================
  // СОЗДАНИЕ НОВОЙ КАПСУЛЫ
  // ============================================

  /**
   * Обработчик клика "Добавить капсулу"
   */
  private async handleAddCapsuleClick(): Promise<void> {
    try {

      this.mode = 'selection';
      this.currentCapsuleId = null;
      this.selectedItems = [];

      this.capsulesGrid.hide();

      // Загружаем гардероб
      await this.loadWardrobeItems();

      // Показываем селектор вещей
      itemSelector.show({
        wardrobeItems: this.wardrobeItems,
        onConfirm: (items) => this.handleClothingConfirmed(items),
        onCancel: () => this.handleClothingCancelled(),
        onAdd: () => this.handlePhotoUpload()
      });
    } catch (error) {
      logger.error('Error opening add capsule modal', error);
    }
  }

  /**
   * Обработчик подтверждения выбора одежды
   */
  private handleClothingConfirmed(selectedItems: WardrobeItem[]): void {

    this.mode = 'canvas';
    this.selectedItems = selectedItems;

    // Инициализируем canvas
    this.initializeCanvasEditor();

    // Загружаем выбранные элементы БЕЗ сохраненных позиций
    const items: CanvasItem[] = capsulesService.sortItemsByLayer(selectedItems).map(item => ({ item }));
    this.canvasEditor!.loadItems(items);

    // Настраиваем навигацию
    navigationManager.push(() => {
      this.returnToClothingSelection();
    }, 'Return to clothing selection from new capsule');
  }

  /**
   * Обработчик отмены выбора одежды
   */
  private handleClothingCancelled(): void {

    this.mode = 'grid';
    this.selectedItems = [];
    this.capsulesGrid.show();
  }

  /**
   * Вернуться к выбору одежды
   */
  private returnToClothingSelection(): void {

    if (this.canvasEditor) {
      this.canvasEditor.hide();
    }

    navigationManager.pop();
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

      this.mode = 'canvas';
      this.currentCapsuleId = capsuleId;

      this.capsulesGrid.hide();

      // Загружаем данные капсулы
      const capsuleData = await capsulesService.loadCapsule(capsuleId);

      // Загружаем гардероб
      await this.loadWardrobeItems();

      // Инициализируем canvas
      this.initializeCanvasEditor();

      // Восстанавливаем состояние
      await this.canvasEditor!.restoreState((capsuleData as any).canvasData);

      // Настраиваем навигацию
      navigationManager.push(() => {
        this.returnToCapsulesGrid();
      }, 'Return to capsules grid from edit');
    } catch (error) {
      logger.error('Error viewing capsule', error);
      alert('Ошибка при просмотре капсулы. Попробуйте еще раз.');
      this.returnToCapsulesGrid();
    }
  }

  /**
   * Обработчик удаления капсулы
   */
  private async handleDeleteCapsule(capsuleId: number): Promise<void> {
    try {
      await capsulesService.deleteCapsule(capsuleId);

      // Удаляем из массива
      const index = this.capsules.findIndex(capsule => capsule.id === capsuleId);
      if (index !== -1) {
        this.capsules.splice(index, 1);
      }

      // Перерисовываем грид
      this.capsulesGrid.render(this.capsules);

      logger.info('Capsule deleted', { capsuleId, remaining: this.capsules.length });

    } catch (error) {
      logger.error('Error removing capsule', error);
      alert('Ошибка при удалении капсулы. Попробуйте еще раз.');
    }
  }

  /**
   * Вернуться к гриду капсул
   */
  private returnToCapsulesGrid(): void {

    if (this.canvasEditor) {
      this.canvasEditor.hide();
    }

    navigationManager.pop();

    this.mode = 'grid';
    this.currentCapsuleId = null;
    this.capsulesGrid.show();
  }

  // ============================================
  // CANVAS EDITOR
  // ============================================

  /**
   * Инициализировать canvas editor
   */
  private initializeCanvasEditor(): void {
    if (this.canvasEditor) {
      this.canvasEditor.show();
      this.canvasEditor.initializeCanvas();
      return;
    }

    this.canvasEditor = new UICanvasEditor({
      containerId: 'capsules-canvas-container',
      canvasId: 'capsules-canvas',
      onAddItem: () => this.handleCanvasAddItem(),
      onSave: () => this.handleCanvasSave(),
      onShare: () => this.handleCanvasShare()
    });

    this.canvasEditor.show();
    this.canvasEditor.initializeCanvas();
  }

  /**
   * Обработчик кнопки "Добавить одежду" на canvas
   */
  private async handleCanvasAddItem(): Promise<void> {
    if (!this.canvasEditor) {
      logger.error('Canvas editor not available');
      return;
    }

    try {
      // Получаем текущие вещи на canvas
      const currentItemIds = this.canvasEditor.getItemIds();

      // Скрываем canvas
      this.canvasEditor.hide();

      // Показываем селектор с предвыбранными вещами
      itemSelector.show({
        wardrobeItems: this.wardrobeItems,
        preselectedIds: new Set(currentItemIds),
        onConfirm: (items) => this.handleAddToCanvasConfirmed(items, currentItemIds),
        onCancel: () => this.handleAddToCanvasCancelled(),
        onAdd: () => this.handlePhotoUpload()
      });

    } catch (error) {
      logger.error('Error opening add to canvas modal', error);
    }
  }

  /**
   * Обработчик подтверждения добавления вещей на canvas
   */
  private async handleAddToCanvasConfirmed(selectedItems: WardrobeItem[], previousItemIds: number[]): Promise<void> {

    if (this.canvasEditor) {
      this.canvasEditor.show();

      // Добавляем новые вещи
      const previousIdsSet = new Set(previousItemIds);
      const newItems = selectedItems.filter(item => !previousIdsSet.has(item.id));

      for (const item of newItems) {
        await this.canvasEditor.addItem({ item });
      }

      // Удаляем снятые с выбора
      const selectedIdsSet = new Set(selectedItems.map(item => item.id));
      const itemsToRemove = previousItemIds.filter(id => !selectedIdsSet.has(id));

      if (itemsToRemove.length > 0) {
        for (const itemId of itemsToRemove) {
          await this.canvasEditor.removeItemById(itemId);
        }
      }
    }
  }

  /**
   * Обработчик отмены добавления вещей на canvas
   */
  private handleAddToCanvasCancelled(): void {

    if (this.canvasEditor) {
      this.canvasEditor.show();
    }
  }

  /**
   * Обработчик сохранения капсулы
   */
  private async handleCanvasSave(): Promise<void> {
    if (!this.canvasEditor) {
      logger.error('Canvas editor not available');
      return;
    }

    try {
      // Получаем состояние canvas с показом модального окна
      const state = await uiModalManager.executeWithLoadingModal({
        modalType: 'canvas',
        loadingText: 'Обрабатываем образ...',
        asyncOperation: () => this.canvasEditor!.getState()
      });

      if (this.currentCapsuleId) {
        // Обновление существующей капсулы
        const updated = await capsulesService.updateCapsule(this.currentCapsuleId, {
          canvasData: state.canvasData,
          thumbnailImage: state.thumbnailImage,
          itemIds: state.canvasData.selected_items?.map((item: WardrobeItem) => item.id) || []
        });

        // Обновляем в массиве
        const index = this.capsules.findIndex(c => c.id === this.currentCapsuleId);
        if (index !== -1) {
          this.capsules[index] = updated as StyleCapsule;
        }

      } else {
        // Создание новой капсулы
        const created = await capsulesService.createCapsule({
          name: `Капсула ${new Date().toLocaleDateString()}`,
          canvasData: state.canvasData,
          thumbnailImage: state.thumbnailImage,
          itemIds: state.canvasData.selected_items?.map((item: WardrobeItem) => item.id) || []
        });

        // Добавляем в массив
        this.capsules.unshift(created as StyleCapsule);
        logger.info('Capsule created', { id: created.id });
      }

      // Возврат к гриду
      this.returnToCapsulesGrid();

      // Перерисовываем грид
      this.capsulesGrid.render(this.capsules);

    } catch (error) {
      logger.error('Error saving capsule', error);
      alert('Ошибка при сохранении капсулы. Попробуйте еще раз.');
    }
  }

  /**
   * Обработчик sharing капсулы
   */
  private async handleCanvasShare(): Promise<void> {
    if (!this.canvasEditor) {
      logger.error('Canvas editor not available');
      return;
    }

    try {
      // Получаем данные капсулы (если сохранена)
      const capsule = this.capsules.find(c => c.id === this.currentCapsuleId);
      const capsuleName = capsule?.name || `Капсула ${new Date().toLocaleDateString()}`;
      
      // ИСПОЛЬЗУЕМ ТУ ЖЕ ЛОГИКУ ЧТО И ПРИ СОХРАНЕНИИ!
      // Получаем актуальное состояние canvas (включая thumbnailImage с правильными пропорциями)
      const state = await this.canvasEditor.getState();
      
      logger.info('Sharing capsule', { 
        id: this.currentCapsuleId, 
        name: capsuleName,
        hasThumbnail: !!state.thumbnailImage 
      });

      // Вызываем сервис sharing с актуальным thumbnail
      const success = await capsulesSharing.shareCapsule(
        this.canvasEditor,
        capsuleName,
        this.currentCapsuleId || undefined,
        state.thumbnailImage  // Используем актуальный thumbnail из canvas
      );

      if (success) {
        logger.info('Capsule shared successfully', { id: this.currentCapsuleId });
      } else {
        logger.error('Failed to share capsule');
      }

    } catch (error) {
      logger.error('Error sharing capsule', error);
    }
  }

  // ============================================
  // ЗАГРУЗКА ДАННЫХ
  // ============================================

  /**
   * Загрузить капсулы
   */
  private async loadCapsules(): Promise<void> {
    try {
      this.capsules = await dataLoader.loadWithCacheFallback<StyleCapsule>(
        () => dataCacheManager.getCapsules() as StyleCapsule[],
        async () => {
          const data = await capsulesService.loadCapsules();
          return data as StyleCapsule[];
        }
      );
      logger.info(`Loaded ${this.capsules.length} capsules`);
    } catch (error) {
      logger.error('Error loading capsules', error);
      this.capsules = [];
    }
  }

  /**
   * Загрузить элементы гардероба
   */
  private async loadWardrobeItems(): Promise<void> {
    try {
      this.wardrobeItems = await dataLoader.loadWithCacheFallback<WardrobeItem>(
        () => dataCacheManager.getWardrobeItems(),
        async () => {
          const initData = (window as any).Telegram?.WebApp?.initData || '';
          const response = await fetch(`/api/wardrobe?initData=${encodeURIComponent(initData)}`);
          
          if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
          }
          
          const result = await response.json();
          
          if (!result.success) {
            throw new Error(result.error || 'Failed to load items');
          }
          
          return result.items;
        }
      );
      logger.info(`Loaded ${this.wardrobeItems.length} wardrobe items`);
    } catch (error) {
      logger.error('Error loading wardrobe items', error);
      this.wardrobeItems = [];
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
      logger.info('Starting photo upload process');

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';

      input.onchange = async (event) => {
        try {
          const target = event.target as HTMLInputElement;
          const file = target.files?.[0];

          if (file) {
            logger.info('Photo selected for upload', { fileName: file.name });

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
      logger.warn('No preview data to confirm');
      return;
    }

    logger.info('Confirming preview - saving item');

    uiModalManager.hide();

    const imageToSave = this.currentPreviewImage;
    const classification = this.currentClassification;

    this.currentPreviewImage = null;
    this.currentClassification = null;

    try {
      // Сохраняем через сервис
      const item = await photoProcessor.saveToWardrobe(imageToSave, classification);

      logger.info('Item saved successfully', { id: item.id });

      // Отправляем событие
      window.dispatchEvent(new CustomEvent('wardrobe:item-saved', {
        detail: { item }
      }));

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
   * Обработчик сохранения нового элемента гардероба
   */
  private async handleNewItemSaved(item: WardrobeItem): Promise<void> {

    // Добавляем в массив
    this.wardrobeItems.push(item);

    // Если модальное окно выбора открыто - обновляем
    if (this.mode === 'selection') {
      itemSelector.update(this.wardrobeItems, true);
    }

    // Если canvas активен - добавляем на него
    if (this.canvasEditor && this.mode === 'canvas') {
      await this.canvasEditor.addItem({ item });
    }
  }

  /**
   * Получить статус менеджера
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
    logger.info('Destroying CapsulesManager');

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

// Экспортируем синглтон
export const capsulesManager = new CapsulesManager();
