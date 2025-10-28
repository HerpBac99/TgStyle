/**
 * Менеджер капсул (РЕФАКТОРЕННЫЙ)
 * Координирует UI, сервисы и обработку данных
 * 
 * ДЕЛЕГИРОВАНИЕ:
 * - Flow управление → CapsuleFlowManager
 * - Выбор вещей → CapsuleSelectionManager
 * - Состояние canvas → CanvasStateManager
 * - Обработка изображений → ImageProcessingService
 * - Модальные окна → ModalService
 */

import { logger } from '../logger';
import { navigationManager } from '../navigationManager';
import { authManager } from '../auth';
import { WardrobeItem } from '@/types/wardrobe';
import { CanvasItem, GeneratedCapsule } from '@/types/capsules';
import { StyleCapsule } from '../uiCapsulesGrid';
import { PhotoUploadHandler, ClothingCategory } from '../photoUploadManager';
import { capsulesService } from './CapsulesService';
import { wardrobeService } from '../wardrobe/WardrobeService';
import { photoProcessor } from '../shared/PhotoProcessor';
import { dataLoader } from '../shared/DataLoader';
import { fileToBase64 } from '../shared/utils';
import { dataCacheManager } from '../dataCache';
import { UICapsulesGrid } from '../uiCapsulesGrid';
import { UICanvasEditor } from '../uiCanvasEditor';
import { UICanvasResultScreen } from '../uiCanvasResultScreen';
import { uiModalManager } from '../uiModalManager';
import { capsulesSharing } from './CapsulesSharing';
import { capsuleGenerationService } from './CapsuleGenerationService';

// НОВЫЕ МОДУЛИ
import { capsuleFlowManager, CapsuleFlowManager } from './CapsuleFlowManager';
import { capsuleSelectionManager, CapsuleSelectionManager } from './CapsuleSelectionManager';
import { canvasStateManager, CanvasStateManager } from './CanvasStateManager';
import { imageProcessingService } from '../shared/ImageProcessingService';
import { modalService, ModalService } from '../shared/ModalService';
import { CapsuleErrorHandler } from './CapsuleErrorHandler';

/**
 * Менеджер капсул (РЕФАКТОРЕННЫЙ)
 */
export class CapsulesManager implements PhotoUploadHandler {
  // НОВЫЕ ЗАВИСИМОСТИ
  private flowManager: CapsuleFlowManager;
  private selectionManager: CapsuleSelectionManager;
  private stateManager: CanvasStateManager;
  private imageService: typeof imageProcessingService;
  private modalSvc: ModalService;

  // Компоненты UI
  private capsulesGrid: UICapsulesGrid;
  private canvasEditor: UICanvasEditor | null = null;
  private resultScreen: UICanvasResultScreen | null = null;

  // Данные
  private capsules: StyleCapsule[] = [];

  // Предпросмотр фото (для PhotoUploadHandler)
  private currentPreviewImage: string | null = null;
  private currentClassification: any = null;

  // Event listeners для очистки
  private wardrobeItemSavedHandler: EventListener;
  private canvasModifiedHandler: EventListener;

  constructor() {
    logger.info('CapsulesManager initialized (REFACTORED)');

    // ВНЕДРЕНИЕ ЗАВИСИМОСТЕЙ
    this.flowManager = capsuleFlowManager;
    this.selectionManager = capsuleSelectionManager;
    this.stateManager = canvasStateManager;
    this.imageService = imageProcessingService;
    this.modalSvc = modalService;

    // Настраиваем callbacks для flowManager
    this.flowManager.setCallbacks({
      onMoveToSelection: () => this.showSelectionModal(),
      onMoveToCanvas: () => this.showCanvas(),
      onMoveToResult: () => this.showResultScreen(),
      onGoBack: () => this.handleGoBack(),
      onComplete: () => this.handleFlowComplete(),
      onCancel: () => this.handleFlowCancel()
    });

    // Настраиваем callbacks для selectionManager
    this.selectionManager.updateConfig({
      onAddItem: () => this.handleSelectionAddItem()
    });

    // Инициализируем грид капсул
    this.capsulesGrid = new UICapsulesGrid({
      onAdd: () => this.handleAddCapsuleClick(),
      onView: (id) => this.handleViewCapsule(id),
      onDelete: (id) => this.handleDeleteCapsule(id),
      onGenerate: (capsule) => this.handleGeneratedCapsule(capsule)
    });

    // Подписываемся на событие сохранения нового элемента гардероба
    this.wardrobeItemSavedHandler = ((event: CustomEvent) => {
      const { item } = event.detail;
      this.handleNewItemSaved(item);
    }) as EventListener;

    window.addEventListener('wardrobe:item-saved', this.wardrobeItemSavedHandler);

    // ОПТИМИЗАЦИЯ: Подписываемся на событие изменения canvas для установки флага dirty
    this.canvasModifiedHandler = (() => {
      this.handleCanvasModified();
    }) as EventListener;

    window.addEventListener('canvas:modified', this.canvasModifiedHandler);
  }

  // ============================================
  // ПУБЛИЧНЫЕ МЕТОДЫ
  // ============================================

  /**
   * Открыть грид капсул
   * ОПТИМИЗАЦИЯ: Инвалидирует старый кэш при открытии
   */
  async handleCapsulesOpen(): Promise<void> {
    await CapsuleErrorHandler.handleWithFallback(
      async () => {
        // ОПТИМИЗАЦИЯ: Инвалидируем старый кэш (старше 1 часа)
        this.stateManager.invalidateOldCache(60 * 60 * 1000);

        // Загружаем капсулы
        await this.loadCapsules();

        // Показываем грид
        this.capsulesGrid.show();
        this.capsulesGrid.render(this.capsules);

        logger.info('Capsules opened', {
          count: this.capsules.length,
          cacheStats: this.stateManager.getCacheStats()
        });
      },
      () => {
        // Fallback: показываем грид с пустым массивом
        this.capsules = [];
        this.capsulesGrid.show();
        this.capsulesGrid.render(this.capsules);
      },
      CapsuleErrorHandler.createContext('Открытие капсул')
    );
  }

  /**
   * Закрыть capsules полностью
   */
  closeCapsules(): void {
    logger.info('Closing capsules');

    // Отменяем flow если активен
    this.flowManager.cancel();

    if (this.canvasEditor) {
      this.canvasEditor.hide();
      this.canvasEditor.destroy();
      this.canvasEditor = null;
    }

    uiModalManager.hide();
    this.capsulesGrid.hide();
  }

  // ============================================
  // СОЗДАНИЕ НОВОЙ КАПСУЛЫ (ДЕЛЕГИРОВАНО)
  // ============================================

  /**
   * Обработчик клика "Добавить капсулу"
   * ДЕЛЕГИРУЕТ в CapsuleFlowManager
   */
  private async handleAddCapsuleClick(): Promise<void> {
    await CapsuleErrorHandler.handleWithFallback(
      async () => {
        logger.info('Starting new capsule creation');

        // Скрываем грид
        this.capsulesGrid.hide();

        // ДЕЛЕГИРУЕМ управление flow в CapsuleFlowManager
        await this.flowManager.startNewCapsule();
      },
      () => {
        // Fallback: возвращаемся к гриду
        this.capsulesGrid.show();
      },
      CapsuleErrorHandler.createContext('Создание новой капсулы')
    );
  }

  /**
   * Показать модальное окно выбора вещей
   * Вызывается через callback из CapsuleFlowManager
   */
  private async showSelectionModal(): Promise<void> {
    await CapsuleErrorHandler.handleWithFallback(
      async () => {
        logger.info('Showing selection modal for new capsule');

        // Получаем уже выбранные элементы из flowManager (для возврата с канваса)
        const currentSelectedItems = this.flowManager.getSelectedItems();
        const preselectedIds = currentSelectedItems.map(item => item.id);

        // ДЕЛЕГИРУЕМ в единый метод выбора с предвыбранными элементами
        const selectedItems = await this.showItemSelection(preselectedIds, 'new-capsule');

        if (selectedItems.length > 0) {
          // Сохраняем выбранные вещи в flowManager
          this.flowManager.setSelectedItems(selectedItems);

          // Переходим на canvas
          this.flowManager.moveToCanvas();
        } else {
          // Отмена - возвращаемся к гриду
          this.flowManager.cancel();
        }
      },
      () => {
        // Fallback: отменяем flow
        this.flowManager.cancel();
      },
      CapsuleErrorHandler.createContext('Выбор вещей для капсулы')
    );
  }

  /**
   * ЕДИНЫЙ МЕТОД для показа выбора вещей
   * Используется как для создания новой капсулы, так и для добавления вещей на canvas
   * 
   * @param preselectedIds - ID предварительно выбранных вещей (опционально)
   * @param context - контекст вызова ('new-capsule' | 'canvas-add')
   * @returns Promise с выбранными вещами
   */
  private async showItemSelection(
    preselectedIds?: number[],
    context: 'new-capsule' | 'canvas-add' = 'new-capsule'
  ): Promise<WardrobeItem[]> {
    return await CapsuleErrorHandler.handleWithFallback(
      async () => {
        logger.info('Showing item selection', {
          context,
          preselectedCount: preselectedIds?.length || 0
        });

        // ДЕЛЕГИРУЕМ в CapsuleSelectionManager
        const selectedItems = await this.selectionManager.show(preselectedIds);

        logger.info('Item selection completed', {
          context,
          selectedCount: selectedItems.length
        });

        return selectedItems;
      },
      () => {
        // Fallback: возвращаем пустой массив
        logger.warn('Item selection failed, returning empty array');
        return [];
      },
      CapsuleErrorHandler.createContext('Выбор вещей', {
        additionalData: { context, preselectedCount: preselectedIds?.length || 0 }
      })
    );
  }

  // ============================================
  // РЕДАКТИРОВАНИЕ СУЩЕСТВУЮЩЕЙ КАПСУЛЫ (ДЕЛЕГИРОВАНО)
  // ============================================

  /**
   * Обработчик просмотра капсулы (показ результата с кнопкой редактирования)
   */
  private async handleViewCapsule(capsuleId: number): Promise<void> {
    await CapsuleErrorHandler.handleWithFallback(
      async () => {
        logger.info('Starting capsule view', { capsuleId });

        this.capsulesGrid.hide();

        // Сначала пытаемся получить изображение из кэша капсул
        const cachedCapsules = dataCacheManager.getCapsules();
        const cachedCapsule = cachedCapsules.find(c => c.id === capsuleId);

        let thumbnailUrl: string;
        
        if (cachedCapsule && cachedCapsule.thumbnailUrl) {
          // Используем изображение из кэша
          thumbnailUrl = cachedCapsule.thumbnailUrl;
        } else {
          // Загружаем данные капсулы с сервера только для получения изображения
          const capsuleData = await capsulesService.loadCapsule(capsuleId);
          
          // Используем thumbnailUrl из API или fallback
          thumbnailUrl = capsuleData.thumbnailUrl || `/api/capsules/${capsuleId}/thumbnail`;
        }

        // Получаем информацию о текущем пользователе (авторе капсулы)
        // Поскольку пользователь видит только свои капсулы, автор всегда текущий пользователь
        const currentUser = authManager.getCurrentUser();
        const author = currentUser ? {
          firstName: currentUser.first_name,
          ...(currentUser.last_name && { lastName: currentUser.last_name })
        } : undefined;

        // Показываем экран результата с кнопкой редактирования
        await this.showCapsuleResult(capsuleId, thumbnailUrl, author);
      },
      () => {
        logger.error('Failed to view capsule, returning to grid');
        this.capsulesGrid.show();
      },
      CapsuleErrorHandler.createContext('Просмотр капсулы', { capsuleId })
    );
  }

  /**
   * Обработчик редактирования капсулы (переход на канвас)
   */
  private async handleEditCapsule(capsuleId: number): Promise<void> {
    await CapsuleErrorHandler.handleWithFallback(
      async () => {
        logger.info('Starting capsule edit', { capsuleId });

        // ДЕЛЕГИРУЕМ управление flow в CapsuleFlowManager
        await this.flowManager.editCapsule(capsuleId);

        // Генерируем ключ кэша
        const cacheKey = `capsule-${capsuleId}`;

        // ОПТИМИЗАЦИЯ: Проверяем кэш перед загрузкой с сервера
        let cachedState = this.stateManager.getCachedState(cacheKey);

        if (!cachedState) {
          // Загружаем данные капсулы с сервера
          const capsuleData = await capsulesService.loadCapsule(capsuleId);

          // Создаем состояние для кэширования
          cachedState = {
            canvasData: (capsuleData as any).canvasData,
            thumbnailImage: (capsuleData as any).thumbnailImage || '',
            itemIds: (capsuleData as any).itemIds || [],
            timestamp: Date.now(),
            isDirty: false
          };

          logger.info('Capsule loaded from server', { capsuleId });
        } else {
          logger.info('Capsule loaded from cache', { capsuleId });
        }

        // Инициализируем canvas
        this.initializeCanvasEditor();

        // Восстанавливаем состояние через CanvasStateManager с кэшированием
        await this.stateManager.restoreState(this.canvasEditor!, cachedState);

        // Сохраняем в кэш если еще не было
        if (!this.stateManager.hasCachedState(cacheKey)) {
          await this.stateManager.saveState(this.canvasEditor!, cacheKey);
        }
      },
      () => {
        // Fallback: возвращаемся к гриду
        this.capsulesGrid.show();
        this.flowManager.cancel();
      },
      CapsuleErrorHandler.createContext('Редактирование капсулы', { capsuleId })
    );
  }

  /**
   * Обработчик удаления капсулы
   */
  private async handleDeleteCapsule(capsuleId: number): Promise<void> {
    await CapsuleErrorHandler.handleWithFallback(
      async () => {
        await capsulesService.deleteCapsule(capsuleId);

        // Удаляем из массива
        const index = this.capsules.findIndex(capsule => capsule.id === capsuleId);
        if (index !== -1) {
          this.capsules.splice(index, 1);
        }

        // Перерисовываем грид
        this.capsulesGrid.render(this.capsules);

        logger.info('Capsule deleted', { capsuleId, remaining: this.capsules.length });
      },
      () => {
        // Fallback: перерисовываем грид без изменений
        this.capsulesGrid.render(this.capsules);
      },
      CapsuleErrorHandler.createContext('Удаление капсулы', { capsuleId })
    );
  }

  /**
   * Обработчик выбора сгенерированной капсулы
   */
  private async handleGeneratedCapsule(capsule: GeneratedCapsule): Promise<void> {
    await CapsuleErrorHandler.handleWithFallback(
      async () => {
        logger.info('Handling generated capsule', { name: capsule.name });

        // Инициализируем canvas editor если еще не инициализирован
        if (!this.canvasEditor) {
          this.initializeCanvasEditor();
        }

        if (!this.canvasEditor) {
          throw new Error('Canvas editor not initialized');
        }

        // Скрываем грид капсул
        this.capsulesGrid.hide();

        // Показываем canvas editor
        this.canvasEditor.show();

        // Загружаем сгенерированную капсулу на canvas
        await this.canvasEditor.loadGeneratedCapsule(capsule);

        // Сохраняем metadata в flowManager
        this.flowManager.setMetadata({
          isGenerated: true,
          source: 'ai_generated',
          recommendations: capsule.recommendations,
          reasoning: capsule.reasoning,
          description: capsule.description,
          season: capsuleGenerationService.getCurrentSeason()
        });

        // Сохраняем название капсулы
        (this.canvasEditor as any).generatedCapsuleName = capsule.name;

        logger.info('Generated capsule loaded to canvas', { name: capsule.name });
      },
      () => {
        // Fallback: возвращаемся к гриду
        this.capsulesGrid.show();
        this.flowManager.cancel();
      },
      CapsuleErrorHandler.createContext('Загрузка сгенерированной капсулы', {
        additionalData: { capsuleName: capsule.name }
      })
    );
  }

  // ============================================
  // CANVAS EDITOR (УПРОЩЕНО)
  // ============================================

  /**
   * Показать canvas
   * Вызывается через callback из CapsuleFlowManager
   * ОПТИМИЗАЦИЯ: Использует кэш для быстрого восстановления состояния
   */
  private async showCanvas(): Promise<void> {
    await CapsuleErrorHandler.handleWithFallback(
      async () => {
        logger.info('Showing canvas');

        // Инициализируем canvas если нужно
        if (!this.canvasEditor) {
          this.initializeCanvasEditor();
        }

        // Получаем выбранные вещи из flowManager
        const selectedItems = this.flowManager.getSelectedItems();

        if (selectedItems.length > 0) {
          // ОПТИМИЗАЦИЯ: Проверяем кэш состояния canvas
          const capsuleId = this.flowManager.getCapsuleId();
          const cacheKey = capsuleId ? `capsule-${capsuleId}` : `temp-canvas`;
          const cachedState = this.stateManager.getCachedState(cacheKey);

          // Если есть кэш и элементы совпадают - восстанавливаем из кэша
          if (cachedState && this.itemsMatch(cachedState.itemIds, selectedItems.map(i => i.id))) {
            logger.info('Restoring canvas from cache', { cacheKey });
            await this.stateManager.restoreState(this.canvasEditor!, cachedState);
          } else {
            // Иначе загружаем элементы заново
            const items: CanvasItem[] = capsulesService.sortItemsByLayer(selectedItems).map(item => ({ item }));
            await this.canvasEditor!.loadItems(items);

            // Сохраняем в кэш для будущего использования
            await this.stateManager.saveState(this.canvasEditor!, cacheKey);
            logger.info('Canvas state saved to cache', { cacheKey });
          }
        }

        // Скрываем экран результата если он показан
        if (this.resultScreen) {
          this.resultScreen.hide();
        }

        // Показываем canvas
        this.canvasEditor!.show();
      },
      () => {
        // Fallback: отменяем flow
        this.flowManager.cancel();
      },
      CapsuleErrorHandler.createContext('Показ canvas редактора')
    );
  }

  /**
   * ОПТИМИЗАЦИЯ: Проверить совпадают ли списки ID элементов
   */
  private itemsMatch(cachedIds: number[], currentIds: number[]): boolean {
    if (cachedIds.length !== currentIds.length) {
      return false;
    }

    const cachedSet = new Set(cachedIds);
    return currentIds.every(id => cachedSet.has(id));
  }

  /**
   * Инициализировать canvas editor
   * SINGLETON: Использует UICanvasEditor.getInstance()
   */
  private initializeCanvasEditor(): void {
    logger.debug('initializeCanvasEditor called');

    // SINGLETON: Получаем единственный экземпляр
    this.canvasEditor = UICanvasEditor.getInstance({
      containerId: 'capsules-canvas-container',
      canvasId: 'capsules-canvas',
      onAddItem: () => this.handleCanvasAddItem(),
      onNext: () => this.handleCanvasNext(),
      onItemDeleted: (itemId: number) => this.handleCanvasItemDeleted(itemId)
    });

    logger.debug('Canvas editor singleton obtained');
    this.canvasEditor.show();
    this.canvasEditor.initializeCanvas();
  }

  /**
   * Обработчик возврата назад
   * Сохраняет состояние канваса перед переходом
   */
  private async handleGoBack(): Promise<void> {
    try {
      // Если находимся на канвасе, сохраняем его состояние
      if (this.flowManager.getCurrentStep() === 'canvas' && this.canvasEditor) {
        logger.info('Saving canvas state before going back');

        // Сохраняем состояние канваса в stateManager
        await this.stateManager.saveState(this.canvasEditor, 'temp-canvas');

        logger.info('Canvas state saved before going back');
      }
    } catch (error) {
      logger.error('Error saving canvas state before going back', {
        error: error instanceof Error ? error.message : String(error)
      });
      // Не блокируем переход назад из-за ошибки сохранения
    }
  }

  /**
   * Обработчик кнопки "Добавить вещь" в модальном окне выбора
   * Открывает загрузку фото для добавления новой вещи в гардероб
   */
  private async handleSelectionAddItem(): Promise<void> {
    await CapsuleErrorHandler.handleWithFallback(
      async () => {
        logger.info('Add item button clicked in selection modal');

        // Используем существующий метод для загрузки фото
        await this.handleWardrobePhotoUpload();
      },
      () => {
        logger.warn('Failed to handle add item in selection modal');
      },
      CapsuleErrorHandler.createContext('Добавление вещи из модального окна выбора')
    );
  }

  /**
   * Обработчик удаления элемента с канваса
   * Синхронизирует состояние flowManager с актуальным состоянием канваса
   */
  private handleCanvasItemDeleted(itemId: number): void {
    logger.info('Item deleted from canvas, updating flowManager', { itemId });

    // Получаем текущие выбранные элементы из flowManager
    const currentSelectedItems = this.flowManager.getSelectedItems();

    // Удаляем элемент из списка выбранных
    const updatedSelectedItems = currentSelectedItems.filter(item => item.id !== itemId);

    // Обновляем состояние в flowManager
    this.flowManager.setSelectedItems(updatedSelectedItems);

    logger.info('FlowManager updated after item deletion', {
      removedItemId: itemId,
      remainingItemsCount: updatedSelectedItems.length,
      remainingItemIds: updatedSelectedItems.map(item => item.id)
    });
  }

  /**
   * Обработчик кнопки "Добавить одежду" на canvas
   * ИСПОЛЬЗУЕТ ЕДИНЫЙ МЕТОД showItemSelection()
   * ОПТИМИЗАЦИЯ: Помечает состояние как dirty при изменениях
   */
  private async handleCanvasAddItem(): Promise<void> {
    if (!this.canvasEditor) {
      logger.error('Canvas editor not available');
      return;
    }

    await CapsuleErrorHandler.handleWithFallback(
      async () => {
        // Получаем текущие вещи на canvas
        const currentItemIds = this.canvasEditor!.getItemIds();

        // Скрываем canvas
        this.canvasEditor!.hide();

        // ИСПОЛЬЗУЕМ ЕДИНЫЙ МЕТОД выбора с предвыбранными вещами
        const selectedItems = await this.showItemSelection(currentItemIds, 'canvas-add');

        // Показываем canvas обратно
        this.canvasEditor!.show();

        if (selectedItems.length > 0) {
          // ОПТИМИЗАЦИЯ: Используем инкрементальные методы

          // 1. Добавляем новые вещи
          const previousIdsSet = new Set(currentItemIds);
          const newItems = selectedItems.filter(item => !previousIdsSet.has(item.id));

          if (newItems.length > 0) {
            const canvasItems = newItems.map(item => ({ item }));
            await this.canvasEditor!.addItems(canvasItems);
            logger.info('Added new items to canvas', { count: newItems.length });
          }

          // 2. Удаляем снятые с выбора
          const selectedIdsSet = new Set(selectedItems.map(item => item.id));
          const itemsToRemove = currentItemIds.filter(id => !selectedIdsSet.has(id));

          if (itemsToRemove.length > 0) {
            await this.canvasEditor!.removeItems(itemsToRemove);
            logger.info('Removed items from canvas', { count: itemsToRemove.length });
          }

          // ОПТИМИЗАЦИЯ: Помечаем состояние как dirty если были изменения
          if (newItems.length > 0 || itemsToRemove.length > 0) {
            const capsuleId = this.flowManager.getCapsuleId();
            const cacheKey = capsuleId ? `capsule-${capsuleId}` : `temp-${Date.now()}`;
            this.stateManager.markDirty(cacheKey);
            logger.debug('Canvas state marked as dirty after item changes', { cacheKey });
          }
        }
      },
      () => {
        // Fallback: показываем canvas обратно
        if (this.canvasEditor) {
          this.canvasEditor.show();
        }
      },
      CapsuleErrorHandler.createContext('Добавление вещей на canvas')
    );
  }

  /**
   * Обработчик кнопки "Далее" на canvas
   * ДЕЛЕГИРУЕТ обработку изображений в ImageProcessingService
   * ОПТИМИЗАЦИЯ: Использует кэширование для избежания повторной обработки
   */
  private async handleCanvasNext(): Promise<void> {
    if (!this.canvasEditor) {
      logger.error('Canvas editor not available');
      return;
    }

    await CapsuleErrorHandler.handleWithFallback(
      async () => {
        logger.info('Processing canvas for result screen');

        // Генерируем ключ кэша на основе ID капсулы или временный
        const capsuleId = this.flowManager.getCapsuleId();
        const cacheKey = capsuleId ? `capsule-${capsuleId}` : `temp-${Date.now()}`;

        // ДЕЛЕГИРУЕМ в ModalService + CanvasStateManager + ImageProcessingService
        await this.modalSvc.executeWithLoading(
          async () => {
            // ОПТИМИЗАЦИЯ: Проверяем кэш и флаг dirty
            let state = this.stateManager.getCachedState(cacheKey);
            const isDirty = !state || this.stateManager.isDirty(cacheKey);

            if (isDirty || !state) {
              // Получаем состояние через CanvasStateManager с удалением фона для компактного изображения
              state = await this.stateManager.saveState(this.canvasEditor!, cacheKey, true);
              logger.info('Canvas state saved to cache with background removal', { cacheKey, isDirty });
            } else {
              logger.info('Using cached canvas state', { cacheKey });
            }

            // ОПТИМИЗАЦИЯ: Кэшируем обработанное изображение
            const watermarkCacheKey = `${cacheKey}-watermark`;
            let imageWithWatermark = this.imageService.getCachedImage(watermarkCacheKey);

            if (!imageWithWatermark || isDirty) {
              // Проверяем что изображение не пустое
              if (!state.thumbnailImage || state.thumbnailImage.length < 100) {
                logger.error('Canvas state has empty thumbnail image');
                throw new Error('Empty thumbnail image after background removal');
              }

              // Добавляем watermark через ImageProcessingService
              imageWithWatermark = await this.imageService.addWatermark(state.thumbnailImage);

              // Проверяем результат watermark
              if (!imageWithWatermark || imageWithWatermark.length < 100) {
                logger.warn('Watermark failed, using original image');
                imageWithWatermark = state.thumbnailImage;
              }

              // Кэшируем результат
              this.imageService.cacheImage(watermarkCacheKey, imageWithWatermark);
              logger.info('Watermarked image cached', { cacheKey: watermarkCacheKey });
            } else {
              logger.info('Using cached watermarked image', { cacheKey: watermarkCacheKey });
            }

            // Сохраняем в flowManager
            this.flowManager.setCanvasState(state);
            this.flowManager.setResultImage(imageWithWatermark);

            // НОВАЯ ЛОГИКА: Сохраняем капсулу сразу при нажатии "Далее"
            await this.saveCapsuleFromCanvas(state);

            return imageWithWatermark;
          },
          { message: 'Обрабатываем образ...' },
          'canvas'
        );

        // Скрываем canvas
        this.canvasEditor!.hide();

        // Переходим к результату через flowManager
        this.flowManager.moveToResult();
      },
      () => {
        // Fallback: остаемся на canvas
        logger.warn('Failed to process canvas, staying on canvas screen');
      },
      CapsuleErrorHandler.createContext('Обработка canvas для результата', {
        ...(this.flowManager.getCapsuleId() && { capsuleId: this.flowManager.getCapsuleId()! })
      })
    );
  }

  // ============================================
  // ЭКРАН РЕЗУЛЬТАТА (УПРОЩЕНО)
  // ============================================

  /**
   * Показать экран результата капсулы (для просмотра из грида)
   */
  private async showCapsuleResult(capsuleId: number, thumbnailUrl: string, author?: { firstName: string; lastName?: string }): Promise<void> {
    // Инициализируем экран результата если нужно
    if (!this.resultScreen) {
      this.resultScreen = new UICanvasResultScreen({
        screenId: 'capsule-result-screen',
        onSave: () => this.handleResultSave(),
        onShare: () => this.handleResultShare(),
        onDone: () => this.handleResultDone(),
        onClose: () => this.handleResultClose(),
        onEdit: () => this.handleEditCapsule(capsuleId) // Новый callback для редактирования
      });
    }

    // Показываем экран с кнопками like, share, кнопкой редактирования и автором
    this.resultScreen.show(thumbnailUrl, capsuleId, true, true, author); // showButtons=true, showEditButton=true, author

    // Настраиваем BackButton для возврата на грид
    navigationManager.push(() => {
      this.resultScreen?.hide();
      this.capsulesGrid.show();
      // Удаляем обработчик из стека после выполнения
      navigationManager.pop();
    }, 'Return from capsule view to grid');

    logger.info('Capsule result screen shown', { capsuleId, hasAuthor: !!author });
  }

  /**
   * Показать экран результата
   * Вызывается через callback из CapsuleFlowManager
   */
  private showResultScreen(): void {
    // Получаем изображение из flowManager
    const imageBase64 = this.flowManager.getResultImage();

    if (!imageBase64) {
      logger.error('No result image available');
      return;
    }

    // Инициализируем экран результата если нужно
    if (!this.resultScreen) {
      this.resultScreen = new UICanvasResultScreen({
        screenId: 'capsule-result-screen',
        onSave: () => this.handleResultSave(),
        onShare: () => this.handleResultShare(),
        onDone: () => this.handleResultDone(),
        onClose: () => this.handleResultClose()
      });
    }

    // Получаем capsuleId из состояния flow
    const flowState = this.flowManager.getState();
    const capsuleId = flowState.capsuleId || undefined;

    // Получаем информацию о текущем пользователе (авторе капсулы)
    const currentUser = authManager.getCurrentUser();
    const author = currentUser ? {
      firstName: currentUser.first_name,
      ...(currentUser.last_name && { lastName: currentUser.last_name })
    } : undefined;

    // Показываем экран с кнопками like и share (без кнопки редактирования) и автором
    this.resultScreen.show(imageBase64, capsuleId, true, false, author); // showButtons=true, showEditButton=false, author

    // BackButton управляется через navigationManager в CapsuleFlowManager
    // setupNavigationForResult() уже настроил BackButton для возврата на грид

    logger.info('Result screen shown', { hasAuthor: !!author });
  }

  /**
   * Обработчик кнопки "Сохранить в галерею"
   */
  private handleResultSave(): void {
    const resultImage = this.flowManager.getResultImage();

    if (!resultImage) {
      logger.warn('No result image to save');
      return;
    }

    try {
      // Открываем изображение через Telegram WebApp
      const tg = (window as any).Telegram?.WebApp;

      if (tg && tg.openLink) {
        tg.openLink(resultImage);
        logger.info('Opened image for download via Telegram');
      } else {
        // Fallback: создаем ссылку для скачивания
        const link = document.createElement('a');
        link.href = resultImage;
        link.download = `capsule_${Date.now()}.png`;
        link.click();
        logger.info('Downloaded image via browser');
      }

    } catch (error) {
      logger.error('Error saving image', error);
      alert('Не удалось сохранить изображение');
    }
  }

  /**
   * Обработчик кнопки "Поделиться в Telegram"
   */
  private async handleResultShare(): Promise<void> {
    const resultImage = this.flowManager.getResultImage();

    if (!resultImage) {
      logger.warn('No result image to share');
      return;
    }

    await CapsuleErrorHandler.handleWithFallback(
      async () => {
        const capsuleId = this.flowManager.getCapsuleId();
        const capsule = this.capsules.find(c => c.id === capsuleId);
        const capsuleName = capsule?.name || `Капсула ${new Date().toLocaleDateString()}`;

        logger.info('Sharing capsule from result screen', {
          id: capsuleId,
          name: capsuleName
        });

        // Используем финальное изображение с watermark
        const success = await capsulesSharing.shareCapsule(
          this.canvasEditor!,
          capsuleName,
          capsuleId || undefined,
          resultImage
        );

        if (!success) {
          throw new Error('Failed to share capsule');
        }

        logger.info('Capsule shared successfully', { id: capsuleId });
      },
      () => {
        // Fallback: ничего не делаем, пользователь уже видит сообщение об ошибке
        logger.warn('Capsule sharing failed');
      },
      CapsuleErrorHandler.createContext('Шеринг капсулы', {
        ...(this.flowManager.getCapsuleId() && { capsuleId: this.flowManager.getCapsuleId()! })
      })
    );
  }

  /**
   * Сохранить капсулу при нажатии "Далее" на canvas
   */
  private async saveCapsuleFromCanvas(state: any): Promise<void> {
    logger.info('Saving capsule from canvas');

    const capsuleId = this.flowManager.getCapsuleId();
    const metadata = this.flowManager.getMetadata();

    if (capsuleId) {
      // Обновление существующей капсулы
      const updated = await capsulesService.updateCapsule(capsuleId, {
        canvasData: state.canvasData,
        thumbnailImage: state.thumbnailImage,
        itemIds: state.itemIds
      });

      // Обновляем в массиве
      const index = this.capsules.findIndex(c => c.id === capsuleId);
      if (index !== -1) {
        this.capsules[index] = updated as StyleCapsule;
      }

      logger.info('Capsule updated', { id: capsuleId });

    } else {
      // Создание новой капсулы
      const generatedName = (this.canvasEditor as any)?.generatedCapsuleName;

      const created = await capsulesService.createCapsule({
        name: generatedName || `Капсула ${new Date().toLocaleDateString()}`,
        canvasData: state.canvasData,
        thumbnailImage: state.thumbnailImage,
        itemIds: state.itemIds,
        metadata: metadata || undefined
      });

      // Очищаем временные данные
      if (this.canvasEditor) {
        delete (this.canvasEditor as any).generatedCapsuleName;
      }

      // Добавляем в массив
      this.capsules.unshift(created as StyleCapsule);

      // ВАЖНО: Устанавливаем capsuleId в flowManager для кнопки like
      this.flowManager.setCapsuleId(created.id);

      logger.info('Capsule created', { id: created.id, source: metadata?.['source'] || 'manual' });
    }
  }

  /**
   * Обработчик кнопки "Готово" (теперь только завершает flow)
   * Капсула уже сохранена при нажатии "Далее"
   */
  private async handleResultDone(): Promise<void> {
    if (!this.canvasEditor) {
      logger.error('Canvas editor not available');
      return;
    }

    // Блокируем кнопку "Готово"
    const doneBtn = document.getElementById('capsule-result-done-btn') as HTMLButtonElement;
    if (doneBtn) {
      doneBtn.disabled = true;
      doneBtn.classList.add('pressed');
    }

    await CapsuleErrorHandler.handleWithFallback(
      async () => {
        logger.info('Saving capsule from result screen');

        // ДЕЛЕГИРУЕМ в ModalService
        await this.modalSvc.executeWithLoading(
          async () => {
            // Получаем состояние из flowManager (уже с удаленным фоном)
            const state = this.flowManager.getCanvasState();
            const capsuleId = this.flowManager.getCapsuleId();
            const metadata = this.flowManager.getMetadata();

            if (!state) {
              throw new Error('No canvas state available');
            }

            if (capsuleId) {
              // Обновление существующей капсулы
              const updated = await capsulesService.updateCapsule(capsuleId, {
                canvasData: state.canvasData,
                thumbnailImage: state.thumbnailImage,
                itemIds: state.itemIds
              });

              // Обновляем в массиве
              const index = this.capsules.findIndex(c => c.id === capsuleId);
              if (index !== -1) {
                this.capsules[index] = updated as StyleCapsule;
              }

              logger.info('Capsule updated', { id: capsuleId });

            } else {
              // Создание новой капсулы
              const generatedName = (this.canvasEditor as any)?.generatedCapsuleName;

              const created = await capsulesService.createCapsule({
                name: generatedName || `Капсула ${new Date().toLocaleDateString()}`,
                canvasData: state.canvasData,
                thumbnailImage: state.thumbnailImage,
                itemIds: state.itemIds,
                metadata: metadata || undefined
              });

              // Очищаем временные данные
              if (this.canvasEditor) {
                delete (this.canvasEditor as any).generatedCapsuleName;
              }

              // Добавляем в массив
              this.capsules.unshift(created as StyleCapsule);
              logger.info('Capsule created', { id: created.id, source: metadata?.['source'] || 'manual' });
            }
          },
          { message: 'Сохраняем образ...' },
          'canvas'
        );

        // Завершаем flow через flowManager
        await this.flowManager.complete();
      },
      () => {
        // Fallback: разблокируем кнопку
        const doneBtn = document.getElementById('capsule-result-done-btn') as HTMLButtonElement;
        if (doneBtn) {
          doneBtn.disabled = false;
          doneBtn.classList.remove('pressed');
        }
      },
      CapsuleErrorHandler.createContext('Сохранение капсулы', {
        ...(this.flowManager.getCapsuleId() && { capsuleId: this.flowManager.getCapsuleId()! })
      })
    );
  }

  /**
   * Обработчик кнопки "Закрыть" (завершает flow)
   * Капсула уже сохранена при нажатии "Далее"
   */
  private async handleResultClose(): Promise<void> {
    logger.info('Result close - completing flow (capsule already saved)');

    // Завершаем flow через flowManager
    await this.flowManager.complete();
  }

  // ============================================
  // FLOW CALLBACKS
  // ============================================

  /**
   * Обработчик завершения flow
   * Вызывается из CapsuleFlowManager при complete()
   */
  private handleFlowComplete(): void {
    logger.info('Flow completed');

    // Очищаем кэш временной капсулы после успешного сохранения
    this.stateManager.clearCacheForKey('temp-canvas');
    logger.info('Temporary canvas cache cleared after successful save');

    // Очищаем канвас после успешного сохранения
    if (this.canvasEditor) {
      this.canvasEditor.clear();
      logger.info('Canvas cleared after successful save');
      this.canvasEditor.hide();
    }

    // Скрываем экран результата
    if (this.resultScreen) {
      this.resultScreen.hide();
    }

    // Показываем грид
    this.capsulesGrid.show();
    this.capsulesGrid.render(this.capsules);

    logger.info('Returned to capsules grid after save');
  }

  /**
   * Обработчик отмены flow
   * Вызывается из CapsuleFlowManager при cancel()
   */
  private handleFlowCancel(): void {
    logger.info('Flow cancelled');

    // Очищаем кэш временной капсулы при отмене
    this.stateManager.clearCacheForKey('temp-canvas');
    logger.info('Temporary canvas cache cleared on flow cancel');

    // Очищаем канвас от всех объектов при отмене
    if (this.canvasEditor) {
      this.canvasEditor.clear();
      logger.info('Canvas cleared on flow cancel');
      this.canvasEditor.hide();
    }

    // Скрываем все UI компоненты
    if (this.resultScreen) {
      this.resultScreen.hide();
    }

    this.selectionManager.hide();

    // Показываем грид
    this.capsulesGrid.show();
  }

  // ============================================
  // ЗАГРУЗКА ДАННЫХ
  // ============================================

  /**
   * Загрузить капсулы
   */
  private async loadCapsules(): Promise<void> {
    this.capsules = await CapsuleErrorHandler.handleWithFallback(
      async () => {
        const capsules = await dataLoader.loadWithCacheFallback<StyleCapsule>(
          () => dataCacheManager.getCapsules() as StyleCapsule[],
          async () => {
            const data = await capsulesService.loadCapsules();
            return data as StyleCapsule[];
          }
        );
        logger.info(`Loaded ${capsules.length} capsules`);
        return capsules;
      },
      () => {
        // Fallback: возвращаем пустой массив
        logger.warn('Failed to load capsules, using empty array');
        return [];
      },
      CapsuleErrorHandler.createContext('Загрузка капсул')
    );
  }

  // ============================================
  // PhotoUploadHandler интерфейс
  // ============================================

  /**
   * Показать/скрыть индикатор загрузки
   * ДЕЛЕГИРУЕТ в ModalService
   */
  showLoadingInModal(show: boolean): void {
    if (show) {
      this.modalSvc.showLoading({ message: 'Загрузка...' }, 'wardrobe');
    } else {
      this.modalSvc.hideLoading();
    }
  }

  /**
   * Обработать фото с удалением фона
   * ДЕЛЕГИРУЕТ в PhotoProcessor и ImageProcessingService
   */
  async processPhotoWithBackgroundRemoval(file: File): Promise<void> {
    await CapsuleErrorHandler.handleWithFallback(
      async () => {
        const base64 = await fileToBase64(file);
        logger.info('Processing photo with background removal');

        // ДЕЛЕГИРУЕМ в ModalService
        this.modalSvc.showLoading({ message: 'Загрузка...' }, 'wardrobe');

        // Классифицируем и удаляем фон через PhotoProcessor
        const result = await photoProcessor.classifyAndRemoveBackground(base64);

        // Скрываем индикатор загрузки
        this.modalSvc.hideLoading();

        // Сохраняем для подтверждения
        this.currentPreviewImage = result.processedImage;
        this.currentClassification = result.classification;

        // Показываем модальное окно с результатом
        uiModalManager.showItemModal({
          type: 'item-modal',
          modalId: 'wardrobe-preview-modal',
          data: {
            imageUrl: result.processedImage,
            category: result.classification.category,
            color: result.classification.color || '',
            material: result.classification.material
          },
          allowEditCategory: false,
          allowEditColorMaterial: false,
          onConfirm: () => this.confirmPreview(),
          onCancel: () => this.cancelPreview()
        });
      },
      async () => {
        // Fallback - показываем оригинальное фото
        this.modalSvc.hideLoading();

        try {
          const base64 = await fileToBase64(file);
          this.currentPreviewImage = base64;

          uiModalManager.showItemModal({
            type: 'item-modal',
            modalId: 'wardrobe-preview-modal',
            data: {
              imageUrl: base64,
              category: ClothingCategory.ACCESSORIES,
              color: ''
            },
            allowEditCategory: true,
            allowEditColorMaterial: true,
            onConfirm: () => this.confirmPreview(),
            onCancel: () => this.cancelPreview()
          });
        } catch (fallbackError) {
          logger.error('Error showing original photo', fallbackError);
          uiModalManager.hide();
        }
      },
      CapsuleErrorHandler.createContext('Обработка фото с удалением фона')
    );
  }

  /**
   * Конвертировать файл в base64
   */
  async fileToBase64(file: File): Promise<string> {
    return fileToBase64(file);
  }

  /**
   * Обработать загрузку фото через событие
   * ОПТИМИЗАЦИЯ: Использует событийную систему вместо прямого вызова WardrobeManager
   */
  async handleWardrobePhotoUpload(): Promise<void> {
    await CapsuleErrorHandler.handleWithFallback(
      async () => {
        logger.info('Starting wardrobe photo upload process via event');

        // Отправляем событие запроса на загрузку фото
        window.dispatchEvent(new CustomEvent('wardrobe:photo-upload-requested', {
          detail: {
            source: 'capsules',
            onItemAdded: (newItem: WardrobeItem) => {
              logger.info('Item added callback received in capsules', { itemId: newItem.id });
            }
          }
        }));
      },
      () => {
        // Fallback: ничего не делаем
        logger.warn('Failed to trigger wardrobe photo upload');
      },
      CapsuleErrorHandler.createContext('Загрузка фото в гардероб')
    );
  }

  /**
   * Обработать загрузку фото (старый метод - оставлен для совместимости)
   * @deprecated Используйте handleWardrobePhotoUpload()
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

    await CapsuleErrorHandler.handleWithFallback(
      async () => {
        // Сохраняем через wardrobeService
        const item = await wardrobeService.addItem(imageToSave, classification);

        logger.info('Item saved successfully', { id: item.id });

        // Отправляем событие
        window.dispatchEvent(new CustomEvent('wardrobe:item-saved', {
          detail: { item }
        }));
      },
      () => {
        // Fallback: ничего не делаем, пользователь уже видит сообщение об ошибке
        logger.warn('Failed to save wardrobe item');
      },
      CapsuleErrorHandler.createContext('Сохранение вещи в гардероб')
    );
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
    await CapsuleErrorHandler.handleWithFallback(
      async () => {
        logger.info('New wardrobe item synced to capsules', {
          itemId: item.id
        });

        // Если canvas активен - добавляем на него
        if (this.canvasEditor && this.flowManager.getCurrentStep() === 'canvas') {
          await this.canvasEditor.addItem({ item });
        }
      },
      () => {
        // Fallback: просто логируем, не критично
        logger.warn('Failed to add new item to canvas', { itemId: item.id });
      },
      CapsuleErrorHandler.createContext('Синхронизация новой вещи с canvas', {
        itemIds: [item.id]
      })
    );
  }

  /**
   * ОПТИМИЗАЦИЯ: Обработчик изменения canvas
   * Автоматически помечает состояние как dirty при любых изменениях
   */
  private handleCanvasModified(): void {
    // Помечаем состояние как dirty только если canvas активен
    if (this.canvasEditor && this.flowManager.getCurrentStep() === 'canvas') {
      const capsuleId = this.flowManager.getCapsuleId();
      const cacheKey = capsuleId ? `capsule-${capsuleId}` : `temp-canvas`;

      this.stateManager.markDirty(cacheKey);

      logger.debug('Canvas state marked as dirty after modification', {
        cacheKey,
        step: this.flowManager.getCurrentStep()
      });
    }
  }

  // ============================================
  // УТИЛИТЫ И ОТЛАДКА
  // ============================================

  /**
   * Получить статус менеджера
   */
  getStatus() {
    return {
      initialized: true,
      flowStatus: this.flowManager.getStatus(),
      canvasVisible: this.canvasEditor?.getStatus().isVisible || false,
      canvasReady: this.canvasEditor?.getStatus().isInitialized || false,
      capsulesCount: this.capsules.length
    };
  }

  /**
   * Очистка ресурсов
   */
  destroy(): void {
    logger.info('Destroying CapsulesManager');

    this.closeCapsules();

    // Удаляем event listeners
    window.removeEventListener('wardrobe:item-saved', this.wardrobeItemSavedHandler);
    window.removeEventListener('canvas:modified', this.canvasModifiedHandler);

    this.capsules = [];

    if (this.canvasEditor) {
      this.canvasEditor.destroy();
      this.canvasEditor = null;
    }

    if (this.resultScreen) {
      this.resultScreen.destroy();
      this.resultScreen = null;
    }

    this.capsulesGrid.destroy();
    this.flowManager.destroy();
    this.selectionManager.destroy();
  }
}

// Экспортируем синглтон
export const capsulesManager = new CapsulesManager();
