/**
 * Менеджер гардероба
 * Координирует UI, сервисы и обработку данных
 */

import { logger } from '../logger';
import { WardrobeItem, ClassificationResult } from '@/types/wardrobe';
import { PhotoUploadHandler } from '../photoUploadManager';
import { wardrobeService } from './WardrobeService';
import { photoProcessor } from '../shared/PhotoProcessor';
import { fileToBase64, stringToClothingCategory } from '../shared/utils';
import { uiModalManager, ItemModalData } from '../uiModalManager';
import { dataCacheManager } from '../dataCache';

/**
 * Менеджер гардероба
 */
export class WardrobeManager implements PhotoUploadHandler {
  private cleanupFunctions: (() => void)[] = [];
  private wardrobeItems: WardrobeItem[] = [];
  private currentPreviewImage: string | null = null;
  private currentClassification: ClassificationResult | null = null;
  private originalItemData: { category?: string; color?: string; material?: string } | null = null; // Оригинальные данные для сравнения изменений
  private currentFilter: string = 'ALL';

  constructor() {
    // WardrobeManager initialized
  }

  /**
   * Открыть гардероб
   */
  async handleWardrobeOpen(): Promise<void> {
    logger.info('Wardrobe opened');

    // Настраиваем обработчики
    this.setupEventListeners();

    // Создаем фильтры
    this.createFilters();

    // МГНОВЕННО отрисовываем из кэша (уже загружен в dataCacheManager при инициализации)
    await this.loadWardrobeFromCache();
    this.renderGrid(true); // С анимацией при первом открытии

    // Загружаем полные данные в фоне
    this.loadWardrobeInBackground();
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
   * Загрузить гардероб из кэша (мгновенно)
   */
  private async loadWardrobeFromCache(): Promise<void> {
    try {
      // Загружаем из кэша (уже в памяти dataCacheManager)
      this.wardrobeItems = await wardrobeService.loadWardrobe();
      logger.info(`Loaded ${this.wardrobeItems.length} items from cache`);
    } catch (error) {
      logger.error('Error loading wardrobe from cache', error);
      this.wardrobeItems = [];
    }
  }

  /**
   * Загрузить полный гардероб в фоне
   * Обновляет данные только если они изменились на сервере
   */
  private loadWardrobeInBackground(): void {
    const currentCount = this.wardrobeItems.length;

    // Загружаем полные данные с сервера в фоне
    wardrobeService.loadWardrobe().then(items => {
      // Проверяем изменились ли данные
      if (items.length !== currentCount) {
        this.wardrobeItems = items;
        logger.info(`Background load: data changed (${currentCount} → ${items.length})`);
        this.renderGrid();
      } else {
        logger.info(`Background load: no changes (${items.length} items)`);
      }
    }).catch(error => {
      logger.error('Error loading wardrobe in background', error);
    });
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
      { key: 'INNERWEAR', label: 'Кофты' },
      { key: 'BODYWEAR', label: 'Футболки и рубашки' },
      { key: 'FULLBODY', label: 'Платья и костюмы' },
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
        this.renderGrid(false); // Без анимации при фильтрации
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
   * @param withAnimation - показывать ли анимацию появления (только при первом открытии)
   */
  private renderGrid(withAnimation: boolean = false): void {
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

    // Управляем анимацией грида
    if (withAnimation) {
      grid.classList.add('initial-load');
      logger.info('Rendering grid with initial animation');

      // Удаляем класс после завершения анимации (0.4s + максимальная задержка 0.4s = 0.8s)
      setTimeout(() => {
        grid.classList.remove('initial-load');
      }, 1000);
    } else {
      grid.classList.remove('initial-load');
      logger.info('Rendering grid without animation');
    }

    // Возвращаем кнопку "Добавить" обратно
    if (addBtn) {
      grid.appendChild(addBtn);
    }

    // Добавляем карточки (новые вещи уже в начале массива)
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

    // Обработчик нажатий с улучшенной логикой
    let pressStartTime = 0;
    let longPressTimer: number | null = null;
    let longPressTriggered = false;
    let startPos: { x: number; y: number } | null = null;
    let cardRect: DOMRect | null = null;
    let isProcessing = false; // Флаг для предотвращения двойных вызовов

    const startPress = (e: MouseEvent | TouchEvent) => {
      // Предотвращаем обработку если уже обрабатываем
      if (isProcessing) {
        e.preventDefault();
        return;
      }

      // Сбрасываем состояние
      longPressTriggered = false;
      pressStartTime = Date.now();
      cardRect = card.getBoundingClientRect();

      // Получаем позицию нажатия
      if (e instanceof TouchEvent && e.touches[0]) {
        startPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e instanceof MouseEvent) {
        startPos = { x: e.clientX, y: e.clientY };
      }

      // Запускаем таймер долгого нажатия
      longPressTimer = window.setTimeout(async () => {
        if (isProcessing) return; // Дополнительная защита

        longPressTriggered = true;
        isProcessing = true;

        // Тактильная обратная связь
        if (window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('warning');
        }

        // Получаем актуальный ID из DOM элемента (может быть обновлен после оптимистичного создания)
        const currentId = parseInt(card.dataset['itemId'] || '0');

        logger.info('Long press detected, showing delete confirmation', { itemId: currentId });

        if (confirm('Удалить этот предмет из гардероба?')) {
          try {
            await this.removeItem(currentId);
            logger.info('Item deleted via long press', { itemId: currentId });
          } catch (error) {
            logger.error('Error deleting item via long press', { itemId: currentId, error });
          }
        } else {
          logger.info('Delete cancelled by user', { itemId: currentId });
        }

        // Сбрасываем флаги после завершения операции
        setTimeout(() => {
          isProcessing = false;
          longPressTriggered = false;
        }, 200);
      }, 600); // Уменьшили время до 600ms для лучшего UX
    };

    const endPress = (e: MouseEvent | TouchEvent) => {
      // Очищаем таймер
      if (longPressTimer !== null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }

      // Если уже обрабатываем или было долгое нажатие - не показываем превью
      if (isProcessing || longPressTriggered || !startPos) {
        return;
      }

      const pressDuration = Date.now() - pressStartTime;

      // Получаем позицию отпускания
      let endPos: { x: number; y: number } | null = null;
      if (e instanceof TouchEvent && e.changedTouches[0]) {
        endPos = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
      } else if (e instanceof MouseEvent) {
        endPos = { x: e.clientX, y: e.clientY };
      }

      if (!endPos) return;

      // Проверяем, что нажатие было коротким (менее 500ms)
      if (pressDuration < 500) {
        // Легкая вибрация при открытии превью
        if (window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
        }

        // Получаем актуальный ID из DOM элемента
        const currentId = parseInt(card.dataset['itemId'] || '0');

        logger.info('Short press detected, showing preview', { itemId: currentId, duration: pressDuration });

        // Находим актуальную вещь по ID из DOM
        const currentItem = this.wardrobeItems.find(wardrobeItem => wardrobeItem.id === currentId);
        if (currentItem) {
          this.showPreviewModal(currentItem);
        } else {
          logger.warn('Item not found for preview', { itemId: currentId });
        }
      }
    };

    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!startPos || !cardRect || longPressTriggered) return;

      // Получаем текущую позицию
      let currentPos: { x: number; y: number } | null = null;
      if (e instanceof TouchEvent && e.touches[0]) {
        currentPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e instanceof MouseEvent) {
        currentPos = { x: e.clientX, y: e.clientY };
      }

      if (!currentPos) return;

      // Проверяем, вышел ли палец за границы карточки
      const isOutsideCard = (
        currentPos.x < cardRect.left ||
        currentPos.x > cardRect.right ||
        currentPos.y < cardRect.top ||
        currentPos.y > cardRect.bottom
      );

      // Отменяем долгое нажатие только если палец вышел за границы карточки
      if (isOutsideCard && longPressTimer !== null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
        logger.info('Long press cancelled - finger moved outside card', { itemId: item.id });
      }
    };

    const cancelPress = () => {
      if (longPressTimer !== null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      // Не сбрасываем isProcessing здесь, чтобы избежать конфликтов
    };

    // Добавляем обработчики событий
    card.addEventListener('mousedown', startPress, { passive: false });
    card.addEventListener('mouseup', endPress, { passive: false });
    card.addEventListener('mouseleave', cancelPress);
    card.addEventListener('mousemove', handleMove);

    card.addEventListener('touchstart', startPress, { passive: false });
    card.addEventListener('touchend', endPress, { passive: false });
    card.addEventListener('touchmove', handleMove, { passive: false });
    card.addEventListener('touchcancel', cancelPress);

    return card;
  }

  /**
   * Удалить вещь
   */
  private async removeItem(itemId: number): Promise<void> {
    // Проверяем, что элемент еще существует в массиве
    const existingIndex = this.wardrobeItems.findIndex(item => item.id === itemId);
    if (existingIndex === -1) {
      logger.warn('Attempted to remove item that no longer exists', { itemId });
      return;
    }

    try {
      logger.info('Removing wardrobe item', { itemId });
      await wardrobeService.deleteItem(itemId);

      // Удаляем из локального массива
      const index = this.wardrobeItems.findIndex(item => item.id === itemId);
      if (index !== -1) {
        this.wardrobeItems.splice(index, 1);
      }

      // Перерисовываем без анимации
      this.renderGrid(false);

      logger.info(`Item removed successfully. Remaining: ${this.wardrobeItems.length}`, { itemId });
    } catch (error) {
      logger.error('Error removing wardrobe item', { itemId, error });
      alert('Ошибка при удалении предмета. Попробуйте еще раз.');
    }
  }

  // ============================================
  // PhotoUploadHandler интерфейс
  // ============================================

  /**
   * Показать модальное окно предпросмотра
   * @param existingItem - существующая вещь из гардероба (опционально)
   */
  showPreviewModal(existingItem?: WardrobeItem): void {
    // Сохраняем оригинальные данные для сравнения изменений
    if (existingItem) {
      this.originalItemData = {
        category: existingItem.category,
        subtype: existingItem.subtype,
        color: existingItem.color,
        material: existingItem.material,
        style: existingItem.style
      } as any;
    } else {
      this.originalItemData = null;
    }

    // Подготавливаем данные для модального окна
    const modalData: ItemModalData = existingItem ? {
      imageUrl: existingItem.imageUrl,
      category: existingItem.category ? stringToClothingCategory(existingItem.category) : stringToClothingCategory('BODYWEAR'),
      ...(existingItem.subtype && { subtype: existingItem.subtype }),
      color: existingItem.color || 'Не указано',
      ...(existingItem.material && { material: existingItem.material }),
      ...(existingItem.style && { style: existingItem.style }),
      ...(existingItem.fit && { fit: existingItem.fit }),
      ...(existingItem.description && { description: existingItem.description }),
      existingItem
    } : {
      imageUrl: this.currentPreviewImage || '',
      category: this.currentClassification?.category || stringToClothingCategory('BODYWEAR'),
      ...(this.currentClassification?.subtype && { subtype: this.currentClassification.subtype }),
      color: this.currentClassification?.color || '',
      ...(this.currentClassification?.material && { material: this.currentClassification.material }),
      ...(this.currentClassification?.style && { style: this.currentClassification.style }),
      ...(this.currentClassification?.fit && { fit: this.currentClassification.fit }),
      ...(this.currentClassification?.description && { description: this.currentClassification.description })
    };

    // Показываем универсальное модальное окно
    uiModalManager.showItemModal({
      type: 'item-modal',
      modalId: 'wardrobe-preview-modal',
      data: modalData,
      allowEditCategory: true,
      allowEditColorMaterial: true,
      onDataChange: (field, value) => {
        // Обновляем данные в зависимости от того, что редактируем
        if (existingItem) {
          // Для существующей вещи
          if (field === 'category') existingItem.category = value;
          else if (field === 'subtype') existingItem.subtype = value;
          else if (field === 'color') existingItem.color = value;
          else if (field === 'material') existingItem.material = value;
          else if (field === 'style') existingItem.style = value;
        } else if (this.currentClassification) {
          // Для новой вещи
          if (field === 'category') this.currentClassification.category = value as any;
          else if (field === 'subtype') this.currentClassification.subtype = value;
          else if (field === 'color') this.currentClassification.color = value;
          else if (field === 'material') this.currentClassification.material = value;
          else if (field === 'style') this.currentClassification.style = value;
        }
      },
      onConfirm: () => {
        if (existingItem) {
          this.updateExistingItem(existingItem);
        } else {
          this.confirmPreview();
        }
      },
      onCancel: () => this.cancelPreview()
    });
  }

  /**
   * Обновить существующую вещь в гардеробе
   */
  private async updateExistingItem(item: WardrobeItem): Promise<void> {
    try {
      if (!this.originalItemData) {
        throw new Error('Original item data not found');
      }

      const updates: Partial<WardrobeItem> = {};
      let hasChanges = false;

      // Проверяем категорию
      if (item.category !== this.originalItemData.category && item.category !== undefined) {
        logger.info(`Category changed: ${this.originalItemData.category} -> ${item.category}`);
        updates.category = item.category;
        hasChanges = true;
      }

      // Проверяем subtype
      if (item.subtype !== (this.originalItemData as any).subtype && item.subtype !== undefined) {
        logger.info(`Subtype changed: ${(this.originalItemData as any).subtype} -> ${item.subtype}`);
        updates.subtype = item.subtype;
        hasChanges = true;
      }

      // Проверяем цвет
      if (item.color !== this.originalItemData.color && item.color !== undefined) {
        logger.info(`Color changed: ${this.originalItemData.color} -> ${item.color}`);
        updates.color = item.color;
        hasChanges = true;
      }

      // Проверяем материал
      if (item.material !== this.originalItemData.material && item.material !== undefined) {
        logger.info(`Material changed: ${this.originalItemData.material} -> ${item.material}`);
        updates.material = item.material;
        hasChanges = true;
      }

      // Проверяем style
      if (item.style !== (this.originalItemData as any).style && item.style !== undefined) {
        logger.info(`Style changed: ${(this.originalItemData as any).style} -> ${item.style}`);
        updates.style = item.style;
        hasChanges = true;
      }

      // Если нет изменений - ничего не делаем
      if (!hasChanges) {
        logger.info(`No changes detected for item ${item.id}`);
        return;
      }

      // Сначала обновляем локальный кеш оптимистично
      const index = this.wardrobeItems.findIndex(i => i.id === item.id);
      if (index !== -1) {
        // Обновляем только измененные поля в локальном массиве
        this.wardrobeItems[index] = {
          ...this.wardrobeItems[index],
          ...updates
        } as WardrobeItem;

        logger.info('Item updated locally', { itemId: item.id, changes: Object.keys(updates) });
      }

      // Очищаем оригинальные данные
      this.originalItemData = null;

      // Перерисовываем без анимации СРАЗУ с обновленными данными
      this.renderGrid(false);

      // Отправляем изменения на сервер в фоне (без ожидания)
      wardrobeService.updateItem(item.id, updates).catch(error => {
        logger.error('Failed to sync changes to server', { itemId: item.id, error: error.message });
      });

      logger.info(`Item updated: ${item.id}`, { changes: updates });
    } catch (error) {
      // Очищаем оригинальные данные даже при ошибке
      this.originalItemData = null;
      logger.error('Failed to update item', error);
      alert('Ошибка при сохранении изменений. Попробуйте еще раз.');
    }
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

      // Сохраняем для подтверждения
      this.currentPreviewImage = result.processedImage;
      this.currentClassification = result.classification;

      // ТЕПЕРЬ показываем модальное окно с ГОТОВЫМИ данными
      this.showPreviewModal();

    } catch (error) {
      logger.error('Error processing photo', error);

      // Fallback - показываем оригинальное фото
      try {
        const base64 = await fileToBase64(file);
        this.currentPreviewImage = base64;
        this.showPreviewModal();
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
            // Показываем loading БЕЗ модального окна
            const loadingModal = document.getElementById('canvas-loading-modal');
            const loadingText = document.querySelector('.canvas-loading-text') as HTMLElement;

            if (loadingModal && loadingText) {
              loadingText.textContent = 'Обрабатываем фото...';
              loadingModal.classList.remove('hidden');
            }

            // Обрабатываем фото (внутри вызовется showPreviewModal)
            await this.processPhotoWithBackgroundRemoval(file);

            // Скрываем loading
            if (loadingModal) {
              loadingModal.classList.add('hidden');
            }
          }
        } catch (error) {
          logger.error('Error in photo upload handler', error);
          // Скрываем loading при ошибке
          const loadingModal = document.getElementById('canvas-loading-modal');
          if (loadingModal) {
            loadingModal.classList.add('hidden');
          }
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

    // Получаем финальные данные из модального окна (могут быть изменены пользователем)
    const finalData = uiModalManager.getCurrentModalData();
    if (finalData) {
      this.currentClassification.category = finalData.category;
      if (finalData.subtype) this.currentClassification.subtype = finalData.subtype;
      this.currentClassification.color = finalData.color;
      if (finalData.material) this.currentClassification.material = finalData.material;
      if (finalData.style) this.currentClassification.style = finalData.style;
      logger.info('Using modal data', {
        category: finalData.category,
        subtype: finalData.subtype,
        color: finalData.color,
        material: finalData.material,
        style: finalData.style
      });
    }

    uiModalManager.hide();

    const imageToSave = this.currentPreviewImage;
    const classification = this.currentClassification;

    this.currentPreviewImage = null;
    this.currentClassification = null;

    // ОПТИМИСТИЧНОЕ СОЗДАНИЕ: создаем временную вещь с известными данными
    const optimisticItem: WardrobeItem = {
      id: Date.now(), // Временный ID (будет заменен на реальный)
      imageUrl: imageToSave, // У нас уже есть base64 изображение
      category: classification.category,
      color: classification.color,
      material: classification.material,
      style: classification.style,
      fit: classification.fit,
      description: classification.description,
      tags: [],
      createdAt: new Date().toISOString()
    };

    // Добавляем опциональные поля только если они есть
    if (classification.subtype) optimisticItem.subtype = classification.subtype;
    if (classification.season) optimisticItem.season = classification.season;
    if (classification.pattern) optimisticItem.pattern = classification.pattern;

    // СРАЗУ добавляем в начало локального массива (оптимистично)
    this.wardrobeItems.unshift(optimisticItem);

    // СРАЗУ добавляем в кэш (оптимистично)
    dataCacheManager.addWardrobeItem(optimisticItem);

    // СРАЗУ перерисовываем грид с новой вещью
    this.renderGrid(false);

    logger.info('Optimistic item created and rendered', {
      tempId: optimisticItem.id,
      category: classification.category
    });

    try {
      // Сохраняем на сервер в фоне
      const serverItem = await wardrobeService.addItem(imageToSave, classification);

      // Заменяем временную вещь на реальную с сервера
      const tempIndex = this.wardrobeItems.findIndex(item => item.id === optimisticItem.id);
      if (tempIndex !== -1) {
        // Обновляем локальный массив
        this.wardrobeItems[tempIndex] = serverItem;

        // Обновляем кэш (заменяем временную вещь на реальную)
        dataCacheManager.replaceOptimisticItem(optimisticItem.id, serverItem);

        // Обновляем ID в DOM элементе без перерисовки
        this.updateItemIdInDOM(optimisticItem.id, serverItem.id, serverItem.imageUrl);

        logger.info('Optimistic item replaced with server item', {
          tempId: optimisticItem.id,
          realId: serverItem.id,
          imageUrl: serverItem.imageUrl
        });
      }

      // Отправляем событие
      window.dispatchEvent(new CustomEvent('wardrobe:item-saved', {
        detail: { item: serverItem }
      }));

      logger.info('Wardrobe item added successfully', { id: serverItem.id });

    } catch (error) {
      // При ошибке удаляем оптимистичную вещь
      const tempIndex = this.wardrobeItems.findIndex(item => item.id === optimisticItem.id);
      if (tempIndex !== -1) {
        this.wardrobeItems.splice(tempIndex, 1);
        this.renderGrid(false);
        logger.error('Optimistic item removed due to error', { tempId: optimisticItem.id });
      }

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
   * Обновить ID в DOM элементе без перерисовки грида
   */
  private updateItemIdInDOM(oldId: number, newId: number, newImageUrl: string): void {
    const cardElement = document.querySelector(`[data-item-id="${oldId}"]`) as HTMLElement;
    if (cardElement) {
      // Обновляем ID в dataset
      cardElement.dataset['itemId'] = newId.toString();

      // Обновляем изображение с base64 на реальный URL
      const imageElement = cardElement.querySelector('.wardrobe-item-image') as HTMLImageElement;
      if (imageElement && newImageUrl !== imageElement.src) {
        imageElement.src = newImageUrl;
      }

      logger.info('DOM element updated', {
        oldId,
        newId,
        imageUpdated: newImageUrl !== imageElement?.src
      });
    } else {
      logger.warn('DOM element not found for ID update', { oldId, newId });
    }
  }

  // ============================================
  // ПУБЛИЧНЫЕ МЕТОДЫ ДЛЯ МОДАЛЬНЫХ ОКОН
  // ============================================

  /**
   * Отрендерить грид в указанном контейнере (для модальных окон)
   * Использует ту же логику что и основной гардероб
   */
  renderGridInContainer(config: {
    containerId: string;
    filtersContainerId: string;
    items: WardrobeItem[];
    selectedIds?: Set<number>;
    onItemClick?: (item: WardrobeItem) => void;
    showAddButton?: boolean;
    onAddClick?: () => void;
  }): void {
    logger.info('Rendering grid in external container', { 
      containerId: config.containerId,
      itemsCount: config.items.length 
    });

    // Создаем фильтры в указанном контейнере
    this.createFiltersInContainer(config.filtersContainerId);
    
    // Рендерим грид в указанном контейнере
    this.renderGridInSpecificContainer(config);
  }

  /**
   * Создать фильтры в указанном контейнере
   */
  private createFiltersInContainer(containerId: string): void {
    const filterContainer = document.getElementById(containerId);
    if (!filterContainer) {
      logger.error('Filter container not found', { containerId });
      return;
    }

    filterContainer.innerHTML = '';

    const categories = [
      { key: 'ALL', label: 'Все' },
      { key: 'OUTERWEAR', label: 'Верхняя одежда' },
      { key: 'INNERWEAR', label: 'Кофты' },
      { key: 'BODYWEAR', label: 'Футболки и рубашки' },
      { key: 'FULLBODY', label: 'Платья и костюмы' },
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
        this.updateFilterButtonsInContainer(containerId);
        // TODO: Перерендерить грид с новым фильтром
      });

      filterContainer.appendChild(btn);
    });
  }

  /**
   * Обновить состояние кнопок фильтров в контейнере
   */
  private updateFilterButtonsInContainer(containerId: string): void {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const buttons = container.querySelectorAll('.wardrobe-filter-btn');
    buttons.forEach(btn => {
      const category = (btn as HTMLElement).dataset['category'];
      btn.classList.toggle('active', category === this.currentFilter);
    });
  }

  /**
   * Отрендерить грид в указанном контейнере
   */
  private renderGridInSpecificContainer(config: {
    containerId: string;
    items: WardrobeItem[];
    selectedIds?: Set<number>;
    onItemClick?: (item: WardrobeItem) => void;
    showAddButton?: boolean;
    onAddClick?: () => void;
  }): void {
    const grid = document.getElementById(config.containerId);
    if (!grid) {
      logger.error('Grid container not found', { containerId: config.containerId });
      return;
    }

    // Фильтруем вещи
    const filteredItems = wardrobeService.filterByCategory(config.items, this.currentFilter);

    // Очищаем грид
    grid.innerHTML = '';

    // Добавляем кнопку "Добавить" если нужно
    if (config.showAddButton && config.onAddClick) {
      const addBtn = this.createAddButton(config.onAddClick);
      grid.appendChild(addBtn);
    }

    // Добавляем карточки
    filteredItems.forEach(item => {
      const card = this.createSelectableItemCard(item, config.selectedIds, config.onItemClick);
      grid.appendChild(card);
    });
  }

  /**
   * Создать карточку с возможностью выбора (для модального окна)
   */
  private createSelectableItemCard(
    item: WardrobeItem, 
    selectedIds?: Set<number>,
    onItemClick?: (item: WardrobeItem) => void
  ): HTMLElement {
    const card = document.createElement('div');
    card.className = 'wardrobe-item-card';
    card.dataset['itemId'] = item.id.toString();

    // Добавляем класс selected если элемент выбран
    if (selectedIds?.has(item.id)) {
      card.classList.add('selected');
    }

    const content = document.createElement('div');
    content.className = 'wardrobe-item-card-content';

    const image = document.createElement('img');
    image.className = 'wardrobe-item-image';
    image.src = item.imageUrl;
    image.alt = item.name || 'Одежда';

    content.appendChild(image);
    card.appendChild(content);

    // Обработчик клика
    if (onItemClick) {
      card.addEventListener('click', () => onItemClick(item));
    }

    return card;
  }

  /**
   * Создать кнопку добавления
   */
  private createAddButton(onAddClick: () => void): HTMLElement {
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

    button.addEventListener('click', onAddClick);

    return button;
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
