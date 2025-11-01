/**
 * Модуль для управления главным меню UI
 * Карусель истории, навигация, главное меню
 */

import type {
  HistoryItem,
  TelegramWebApp,
} from '@/types/index';
import {
  DOM_SELECTORS,
  CSS_CLASSES,
  CAROUSEL_CONFIG,
} from '@/utils/constants';
import {
  getElement,
  getElements,
  createElement,
  addEventListenerWithCleanup,
  formatHistoryDate
} from '@/utils/helpers';
import { logger } from './logger';
import { authManager } from './auth';
import { cameraManager } from './camera';
import { historyManager } from './history';
import { uiCoreManager } from './uiCore';
import { analysisLikesService } from './analysis/AnalysisLikesService';
import { sharingService } from './shared/SharingService';
import { uiAnalysisManager } from './uiAnalysis';
import { api } from './api';

// Объявляем глобальную переменную Telegram
declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}

/**
 * Интерфейс для состояния долгого нажатия
 */
interface LongPressState {
  isActive: boolean;
  pressTimer: number | null;
  startPosition: { x: number; y: number } | null;
  targetElement: HTMLElement | null;
  targetIndex: number | null;
  moveHandler: ((event: MouseEvent | TouchEvent) => void) | null;
  documentClickHandler: ((event: Event) => void) | null;
}

/**
 * Интерфейс для состояния свайпа карусели
 */
interface CarouselSwipeState {
  isDragging: boolean;
  startX: number;
  currentX: number;
  startTime: number;
  currentPosition: number;
}

/**
 * Класс для управления главным меню
 */
export class UIMenuManager {
  private elements: {
    userName: HTMLElement | null;
    userPhoto: HTMLElement | null;
    cameraBtn: HTMLButtonElement | null;
    historyCells: NodeListOf<HTMLElement>;
    appContainer: HTMLElement | null;
  } = {
      userName: null,
      userPhoto: null,
      cameraBtn: null,
      historyCells: null! as NodeListOf<HTMLElement>,
      appContainer: null,
    };

  private cleanupFunctions: (() => void)[] = [];
  private longPressState: LongPressState = {
    isActive: false,
    pressTimer: null,
    startPosition: null,
    targetElement: null,
    targetIndex: null,
    moveHandler: null,
    documentClickHandler: null,
  };
  private carouselSwipeState: CarouselSwipeState = {
    isDragging: false,
    startX: 0,
    currentX: 0,
    startTime: 0,
    currentPosition: 0,
  };


  // Текущий превью экран
  private currentPreview: HTMLElement | null = null;

  // Состояние карусели
  private carouselState = {
    currentCenterIndex: 0, // Индекс элемента в центре
    totalCards: 0,         // Общее количество карт
    containerWidth: 0,     // Ширина контейнера
  };

  // Метрики загрузки изображений
  private imageLoadMetrics = {
    priorityLoadStartTime: 0,
    priorityLoadEndTime: 0,
    backgroundLoadStartTime: 0,
    backgroundLoadEndTime: 0,
    priorityImagesLoaded: 0,
    backgroundImagesLoaded: 0,
    totalImagesToLoad: 0
  };

  // Флаг для предотвращения повторной загрузки изображений
  private isLoadingImages = false;

  constructor() {
    this.initializeElements();
    this.setupEventListeners();
  }

  /**
   * Инициализация DOM элементов
   */
  private initializeElements(): void {
    this.elements = {
      userName: getElement(DOM_SELECTORS.USER_NAME),
      userPhoto: getElement(DOM_SELECTORS.USER_PHOTO),
      cameraBtn: getElement<HTMLButtonElement>(DOM_SELECTORS.CAMERA_BTN),
      historyCells: getElements(DOM_SELECTORS.HISTORY_CARDS),
      appContainer: getElement(DOM_SELECTORS.APP_CONTAINER),
    };

  }

  /**
   * Настройка обработчиков событий
   */
  private setupEventListeners(): void {
    // Обработчик кнопки камеры
    this.setupCameraButtonListener();

    // Глобальные обработчики
    this.setupGlobalEventListeners();

    // Обработчики ячеек истории добавляются динамически в updateHistoryDisplay

  }

  /**
   * Настраивает обработчик кнопки камеры
   */
  private setupCameraButtonListener(): void {
    if (this.elements.cameraBtn) {
      const cleanup = addEventListenerWithCleanup(
        this.elements.cameraBtn,
        'click',
        this.handleCameraButtonClick.bind(this)
      );
      this.cleanupFunctions.push(cleanup);
    }
  }

  /**
   * Настраивает глобальные обработчики событий
   */
  private setupGlobalEventListeners(): void {
    // Обработчик видимости страницы (для очистки состояния при сворачивании)
    document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
  }

  /**
   * Обработчик изменения видимости страницы
   */
  private handleVisibilityChange(): void {
    if (document.hidden && this.longPressState.isActive) {
      // Если страница свернута и активен режим удаления, выходим из него
      this.exitDeleteMode();
    }
  }

  /**
   * Обработчик клика по кнопки камеры - делегирует в uiAnalysisManager
   */
  private async handleCameraButtonClick(event: Event): Promise<void> {
    await uiAnalysisManager.handleCameraButtonClick(event);
  }

  /**
   * Обработчик клика по ячейке истории
   */
  private handleHistoryCellClick(index: number): void {
    const historyItem = historyManager.getFilledItem(index);

    if (historyItem) {
      this.showSavedAnalysis(historyItem);
    } else {

      // Проверяем лимиты перед открытием камеры
      if (!authManager.canAnalyze()) {
        logger.info('Analysis limit reached, showing limit modal', {
          analysesLeft: authManager.getAnalysesLeft()
        });
        uiCoreManager.showLimitModal();
        return;
      }

      logger.info('Limits check passed, opening camera', { index });
      this.handleCameraButtonClick(new Event('click'));
    }
  }


  /**
   * Показать сохраненный анализ
   * #showSavedAnalysis #UI-MENU #UI-SHOW-SAVED-ANALYSIS
   */
  private showSavedAnalysis(analysisData: HistoryItem): void {
    // Проверяем наличие фото (photoPath или base64)
    const hasPhoto = analysisData.photoPath;
    if (!hasPhoto) {
      logger.error('Не удалось загрузить данные фотографии');
      return;
    }

    // Получаем элементы из HTML
    const savedAnalysisScreen = getElement('#saved-analysis-screen');
    const savedAnalysisPhoto = getElement('#saved-analysis-photo') as HTMLImageElement;
    const savedAnalysisData = getElement('#saved-analysis-data');
    const savedAnalysisDate = getElement('#saved-analysis-date');

    if (!savedAnalysisScreen || !savedAnalysisPhoto || !savedAnalysisData || !savedAnalysisDate) {
      logger.error('Saved analysis screen elements not found');
      return;
    }

    // Устанавливаем фото - приоритет photoPath (URL), затем base64
    if (analysisData.photoPath) {
      // photoPath это имя файла, нужно составить URL с использованием telegramId
      const photoUrl = `/uploads/analysis/${analysisData.telegramId}/${analysisData.photoPath}`;
      savedAnalysisPhoto.src = photoUrl;
    }

    // Формируем текст анализа
    let analysisContent = '';

    // Текст анализа LLM (приоритет analysisText)
    const analysisText = analysisData.analysisText || analysisData.technicalAnalysis;
    if (analysisText) {
      const processedAnalysis = analysisText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      analysisContent += `<strong>Анализ стиля:</strong><br>${processedAnalysis}`;
    } else {
      analysisContent += '<em>Текст анализа недоступен</em>';
    }

    savedAnalysisData.innerHTML = analysisContent;
    savedAnalysisDate.textContent = formatHistoryDate(new Date(analysisData.createdAt).toISOString());

    // Добавляем обработчик клика для закрытия
    savedAnalysisScreen.addEventListener('click', () => this.closeSavedAnalysis());

    // Показываем экран
    savedAnalysisScreen.classList.remove('hidden');
    this.currentPreview = savedAnalysisScreen;

    logger.info('Saved analysis displayed');
  }

  /**
   * Закрытие экрана сохраненного анализа
   */
  private closeSavedAnalysis(): void {
    const savedAnalysisScreen = getElement('#saved-analysis-screen');
    if (!savedAnalysisScreen) {
      return;
    }

    savedAnalysisScreen.classList.add('hidden');
    this.currentPreview = null;
  }

  /**
   * Синхронизация метаданных истории (лайки, просмотры) без загрузки фото
   * #OPTIMIZATION #METADATA-SYNC
   */
  private async syncHistoryMetadata(): Promise<void> {
    try {
      const initData = window.Telegram?.WebApp?.initData || '';

      if (!initData) {
        logger.warn('No initData available for metadata sync');
        return;
      }

      logger.info('Syncing history metadata from server');
      const response = await api.get(`/history-metadata?initData=${encodeURIComponent(initData)}`) as any;

      if (response.success && response.metadata) {
        historyManager.updateMetadata(response.metadata);
      }
    } catch (err) {
      logger.error('Error syncing history metadata', err);
    }
  }

  /**
   * Закрытие экрана анализа
   */
  private async closePreview(): Promise<void> {
    // Закрываем экран анализа
    const analysisScreen = getElement('#analysis-screen');
    if (analysisScreen) {
      analysisScreen.classList.add('hidden');
    }

    // Закрываем экран сохраненного анализа
    this.closeSavedAnalysis();

    // Очищаем текущее изображение в менеджере камеры
    cameraManager.clearCurrentImage();

    // OPTIMIZATION: Загружаем только метаданные если история большая
    const stats = historyManager.getStats();

    try {
      if (stats.filledSlots < 10) {
        // Мало элементов - загружаем полностью
        await historyManager.loadHistoryFromServer();
        logger.info('History reloaded from server', { itemsCount: stats.filledSlots });
      } else {
        // Много элементов - загружаем только метаданные (оптимизация)
        await this.syncHistoryMetadata();
        logger.info('History metadata synced', { itemsCount: stats.filledSlots });
      }
    } catch (error) {
      logger.warn('Failed to update history from server', { error });
    }

    // Пересчитываем карусель после закрытия экрана (с сохранением позиции)
    this.updateHistoryDisplay({ preservePosition: true });
  }

  /**
   * @description Обновление отображения истории
   * @param {object} options - Опции обновления.
   * @param {boolean} [options.preservePosition=false] - Сохранить ли текущую позицию карусели.
   * #UPDATE-HISTORY-DISPLAY #UI-MENU #UI-UPDATE-HISTORY-DISPLAY
   */
  updateHistoryDisplay(options: { preservePosition?: boolean } = {}): void {
    const { preservePosition = false } = options;
    const filledItems = historyManager.getAllItems();

    // Обновление карусели (debug логи отключены)

    // Сервер возвращает в порядке desc (новые первые), а нам нужно asc (старые первые)
    const sortedItems = [...filledItems].reverse();

    // Создаем карусель динамически
    this.createCarouselCards(sortedItems);

    // Позиционируем карусель
    this.positionCarousel(preservePosition);

    // Карусель отрисована (debug логи отключены)

    // OPTIMIZATION: Progressive image loading - грузим только видимые карты
    this.loadVisibleCardImages();

    // Обновляем навигацию
    this.updateCarouselNavigation();
  }

  /**
   * Загрузка всех изображений карусели
   * SIMPLIFIED: Загружаем все изображения последовательно без приоритетов
   */
  private loadVisibleCardImages(): void {
    // Предотвращаем повторную загрузку если уже идет процесс
    if (this.isLoadingImages) {
      return;
    }

    this.isLoadingImages = true;

    const totalCards = this.carouselState.totalCards;
    const totalImagesToLoad = totalCards - 1; // -1 потому что последняя карта пустая

    // Сбрасываем счетчики
    this.imageLoadMetrics.priorityImagesLoaded = 0;
    this.imageLoadMetrics.backgroundImagesLoaded = 0;
    this.imageLoadMetrics.totalImagesToLoad = totalImagesToLoad;
    this.imageLoadMetrics.priorityLoadStartTime = performance.now();

    logger.info('Loading all carousel images', {
      totalCards: totalImagesToLoad
    });

    let loadedCount = 0;

    // Загружаем все изображения последовательно
    for (let i = 0; i < totalCards; i++) {
      this.loadCardImageWithCallback(i, () => {
        loadedCount++;

        // Когда все изображения загружены
        if (loadedCount === totalImagesToLoad) {
          this.imageLoadMetrics.priorityLoadEndTime = performance.now();
          // Сбрасываем флаг загрузки
          this.isLoadingImages = false;
        }
      });
    }
  }

  /**
   * Загрузить изображение для одной карты с callback
   */
  private loadCardImageWithCallback(index: number, onLoad: () => void): Promise<void> {
    return new Promise((resolve) => {
      if (index < 0 || index >= this.carouselState.totalCards) {
        resolve();
        return;
      }

      const card = document.querySelector(`.history-card[data-index="${index}"]`) as HTMLElement;
      if (!card) {
        resolve();
        return;
      }

      const photoUrl = card.dataset['photoUrl'];
      if (!photoUrl) {
        resolve();
        return;
      }

      // Если изображение уже загружено, пропускаем
      if (card.style.backgroundImage) {
        onLoad();
        resolve();
        return;
      }

      // Создаем Image объект для отслеживания загрузки
      const img = new Image();
      img.onload = () => {
        card.style.backgroundImage = `url(${photoUrl})`;
        card.classList.remove('image-loading');
        card.classList.add('image-loaded');
        delete card.dataset['photoUrl'];

        onLoad();
        resolve();
      };
      img.onerror = () => {
        logger.warn('Failed to load card image', { index, photoUrl });
        onLoad(); // Все равно считаем загруженным чтобы счетчик не застрял
        resolve();
      };

      // Начинаем загрузку (debug логи отключены для производительности)
      img.src = photoUrl;
    });
  }

  /**
   * Создание карт карусели динамически
   * #uiMenu #MainMenu #Carousel #createCarouselCards #createCards #Card
   */
  private createCarouselCards(filledItems: HistoryItem[]): void {
    const carousel = getElement(DOM_SELECTORS.HISTORY_CAROUSEL);
    if (!carousel) return;

    // Очищаем карусель
    carousel.innerHTML = '';

    // Всегда создаем минимум одну карту (пустую для новых фото)
    const totalCards = Math.max(1, filledItems.length + 1);
    this.carouselState.totalCards = totalCards;

    // Создаем карты
    for (let i = 0; i < totalCards; i++) {
      const card = this.createCard(i, filledItems[i] || null);
      carousel.appendChild(card);
    }

    // Обновляем ссылку на карты
    this.elements.historyCells = getElements(DOM_SELECTORS.HISTORY_CARDS);

  }

  /**
   * @description Метод создания одной карты
   * #createCard #UI-MENU #UI-CREATE-CARD
   */
  private createCard(index: number, data: HistoryItem | null): HTMLElement {
    const card = this.createCardElement(index);
    const content = this.createCardContent();

    if (data && data.id) {
      // Все элементы в истории теперь заполнены (нет isEmpty)
      this.setupFilledCard(card, content, data);
    } else {
      this.setupEmptyCard(card, content, index);
    }

    card.appendChild(content);
    return card;
  }

  /**
   * @description Метод создания базового элемента карты
   * #createCardElement #UI-MENU #UI-CREATE-CARD-ELEMENT
   */
  private createCardElement(index: number): HTMLElement {
    return createElement('div', {
      class: 'history-card',
      'data-index': index.toString(),
    });
  }

  /**
   * @description Метод создания контейнера контента карты
   * #createCardContent #UI-MENU #UI-CREATE-CARD-CONTENT
   */
  private createCardContent(): HTMLElement {
    return createElement('div', {
      class: 'history-card-content',
    });
  }

  /**
   * Настраивает заполненную карту
   */
  private setupFilledCard(card: HTMLElement, content: HTMLElement, data: HistoryItem): void {
    card.classList.add(CSS_CLASSES.FILLED);

    // Добавляем data-id для возможности точечного обновления метаданных
    if (data.id) {
      card.setAttribute('data-id', data.id.toString());
    }

    // OPTIMIZATION: Lazy loading - НЕ загружаем изображения сразу
    // Сохраняем URL в data-атрибут для отложенной загрузки
    if (data.photoPath) {
      const backgroundUrl = `/uploads/analysis/${data.telegramId}/${data.photoPath}`;
      card.dataset['photoUrl'] = backgroundUrl;
      // Добавляем класс для skeleton UI
      card.classList.add('image-loading');
    } else {
      logger.warn('DEBUG: photoPath is empty or null!', {
        itemId: data.id,
        allData: JSON.stringify(data).substring(0, 300)
      });
    }

    const caption = createElement('div', {
      class: 'history-card-caption',
    });

    // Добавляем дату
    /*
    const dateElement = createElement('div', {
      class: 'history-card-date',
    }, formatHistoryDate(new Date(data.createdAt).toISOString()));
    caption.appendChild(dateElement);
    */
    content.appendChild(caption);

    // Используем единый сервис для создания компонента лайков
    // #REFACTOR #UNIFIED-LIKES-SERVICE
    if (data.id) {
      analysisLikesService.createLikeComponent(
        caption,
        data.id,
        {
          isLiked: !!data.isLiked,
          likesCount: data.likesCount || 0
        },
        'carousel' // Добавляем класс для карусели
      );

      // Создаем кнопку share в карусели
      sharingService.createShareButton(
        caption,
        {
          type: 'analysis',
          image: data.photoPath ? `/uploads/analysis/${data.telegramId}/${data.photoPath}` : '',
          text: data.analysisText || data.technicalAnalysis || 'Анализ стиля',
          title: '🤖 AI Анализ стиля',
          metadata: {
            historyItemId: data.id
          }
        },
        'carousel' // Добавляем класс для карусели
      );
    }

    // Находим реальный индекс элемента в общем массиве истории
    const realIndex = this.findRealHistoryIndex(data);

    // Обработчики
    this.addLongPressHandlers(card, realIndex);

    // Обработчик клика на карточку - НО не на лайк или share!
    card.addEventListener('click', (e: Event) => {
      const target = e.target as HTMLElement;
      // Проверяем что клик НЕ на кнопку лайка, share или их содержимое
      if (!target.closest('.like-container') && !target.closest('.share-container')) {
        this.showSavedAnalysis(data);
      }
    });
  }

  /**
   * Настраивает пустую карту
   */
  private setupEmptyCard(card: HTMLElement, content: HTMLElement, index: number): void {
    const addButton = this.createAddButton();
    content.appendChild(addButton);
    card.onclick = () => this.handleHistoryCellClick(index);
  }

  /**
   * Создает кнопку добавления для пустой карты
   */
  private createAddButton(): HTMLElement {
    const addButton = createElement('div', {
      class: 'add-analysis',
    });
    addButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 5v14M5 12h14"></path>
      </svg>
    `;
    return addButton;
  }

  /**
   * Находит реальный индекс элемента в общем массиве истории
   * #HISTORY #CAROUSEL #findRealHistoryIndex
   * Теперь просто ищет по ID (БЕЗ isEmpty элементов!)
   */
  private findRealHistoryIndex(data: HistoryItem): number {
    const allItems = historyManager.getAllItems();

    // Ищем по ID (самый надежный способ)
    const index = allItems.findIndex(item => item && item.id === data.id);

    if (index === -1) {
      logger.warn('Could not find history item by ID', { id: data.id });
      return -1;
    }

    return index;
  }

  /**
   * Обновление отображения одной карты в карусели по ID элемента истории
   * #UI-MENU #UPDATE-CARD-DISPLAY
   */
  public updateCardDisplay(historyItemId: number): void {
    const historyItem = historyManager.getItemById(historyItemId);
    if (!historyItem) {
      logger.warn('History item not found for update', { historyItemId });
      return;
    }

    // Находим индекс элемента в текущем отсортированном массиве истории
    const sortedItems = [...historyManager.getAllItems()].reverse();
    const indexInSorted = sortedItems.findIndex(item => item.id === historyItemId);

    if (indexInSorted === -1) {
      logger.warn('Card not found in sorted history for update', { historyItemId });
      return;
    }

    // Находим DOM-элемент карты по его data-index
    const cardElement = getElement(`.history-card[data-index="${indexInSorted}"]`);

    if (cardElement) {
      // Очищаем текущее содержимое карты
      cardElement.innerHTML = '';
      const content = this.createCardContent();
      this.setupFilledCard(cardElement, content, historyItem);
      cardElement.appendChild(content);
      logger.info('Card display updated successfully', { historyItemId, indexInSorted });
    } else {
      logger.warn('DOM card element not found for update', { historyItemId, indexInSorted });
    }
  }

  /**
   * Позиционирование карусели для отображения центральной карты
   */
  private positionCarousel(preservePosition: boolean = false): void {
    const carousel = getElement(DOM_SELECTORS.HISTORY_CAROUSEL);
    if (!carousel) return;

    // Сбрасываем позицию только если это не фоновое обновление
    if (!preservePosition) {
      // Для первого запуска показываем пустую карту по центру
      const filledCount = historyManager.getFilledCount();

      if (filledCount === 0) {
        // Первый запуск - пустая карта в центре
        this.carouselState.currentCenterIndex = 0;
      } else {
        // Показываем самую новую (правую) карту, но центральная остается пустой
        this.carouselState.currentCenterIndex = Math.min(filledCount, this.carouselState.totalCards - 1);
      }

      logger.info('Carousel position updated', { currentCenterIndex: this.carouselState.currentCenterIndex });
    }
    else {
      logger.info('Carousel position preserved', { currentCenterIndex: this.carouselState.currentCenterIndex });
    }

    // Рассчитываем трансформацию для новых размеров карт
    const offset = -this.carouselState.currentCenterIndex * CAROUSEL_CONFIG.TOTAL_CARD_WIDTH;

    // Центрируем карусель относительно контейнера
    carousel.style.transform = `translateX(calc(50% - ${CAROUSEL_CONFIG.CENTER_OFFSET}px + ${offset}px))`;

    // Обновляем центральную карту
    this.updateCenterCard();

  }

  /**
   * Обновление центральной карты (добавляем класс center)
   */
  private updateCenterCard(): void {
    const cards = getElements(DOM_SELECTORS.HISTORY_CARDS);

    cards.forEach((card, index) => {
      if (index === this.carouselState.currentCenterIndex) {
        card.classList.add('center');
      } else {
        card.classList.remove('center');
      }
    });
  }

  /**
   * Обновление навигации карусели (точки)
   */
  private updateCarouselNavigation(): void {
    const dotsContainer = getElement(DOM_SELECTORS.CAROUSEL_DOTS);
    if (!dotsContainer) return;

    // Очищаем контейнер точек
    dotsContainer.innerHTML = '';

    // Создаем точки только если больше одной карты
    if (this.carouselState.totalCards > 1) {
      for (let i = 0; i < this.carouselState.totalCards; i++) {
        const dot = createElement('div', {
          class: `dot${i === this.carouselState.currentCenterIndex ? ' active' : ''}`,
          'data-dot': i.toString(),
        });

        // Обработчик клика по точке
        dot.addEventListener('click', () => this.moveCarouselToPosition(i));

        dotsContainer.appendChild(dot);
      }
    }

  }

  /**
   * Переключение карусели на определенную позицию
   */
  private moveCarouselToPosition(position: number): void {
    const carousel = getElement(DOM_SELECTORS.HISTORY_CAROUSEL);
    if (!carousel) return;

    // Проверяем границы
    if (position < 0 || position >= this.carouselState.totalCards) {
      return;
    }

    // Обновляем состояние
    this.carouselState.currentCenterIndex = position;
    this.carouselSwipeState.currentPosition = position;

    // Анимированное перемещение с новыми размерами
    const offset = -position * CAROUSEL_CONFIG.TOTAL_CARD_WIDTH;

    carousel.style.transition = `transform ${CAROUSEL_CONFIG.TRANSITION_DURATION}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
    carousel.style.transform = `translateX(calc(50% - ${CAROUSEL_CONFIG.CENTER_OFFSET}px + ${offset}px))`;

    // Убираем transition после анимации
    setTimeout(() => {
      carousel.style.transition = '';
    }, 300);

    // Обновляем центральную карту и точки
    this.updateCenterCard();
    this.updateActiveDot(position);
  }

  /**
   * Обновление активной точки навигации
   */
  private updateActiveDot(activeIndex: number): void {
    const dots = getElements(`${DOM_SELECTORS.CAROUSEL_DOTS} .dot`);

    dots.forEach((dot, index) => {
      if (index === activeIndex) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    });
  }

  /**
   * Настройка обработчиков для карусели
   */
  private setupCarouselNavigation(): void {
    // Настройка свайп-управления карусели
    this.setupCarouselSwipe();

  }

  /**
   * Настройка свайп-управления карусели
   */
  private setupCarouselSwipe(): void {
    const carousel = getElement(DOM_SELECTORS.HISTORY_CAROUSEL);
    if (!carousel) return;

    // Touch events
    const touchStartCleanup = addEventListenerWithCleanup(
      carousel,
      'touchstart',
      this.handleCarouselTouchStart.bind(this),
      { passive: true }
    );

    const touchMoveCleanup = addEventListenerWithCleanup(
      carousel,
      'touchmove',
      this.handleCarouselTouchMove.bind(this),
      { passive: false }
    );

    const touchEndCleanup = addEventListenerWithCleanup(
      carousel,
      'touchend',
      this.handleCarouselTouchEnd.bind(this),
      { passive: true }
    );

    this.cleanupFunctions.push(touchStartCleanup, touchMoveCleanup, touchEndCleanup);

  }

  /**
   * Обработчик начала касания карусели
   */
  private handleCarouselTouchStart(event: TouchEvent): void {
    const touch = event.touches[0];
    if (!touch) return;

    this.carouselSwipeState = {
      isDragging: true,
      startX: touch.clientX,
      currentX: touch.clientX,
      startTime: Date.now(),
      currentPosition: 0,
    };
  }

  /**
   * Обработчик движения касания карусели
   */
  private handleCarouselTouchMove(event: TouchEvent): void {
    if (!this.carouselSwipeState.isDragging) return;

    const touch = event.touches[0];
    if (!touch) return;

    this.carouselSwipeState.currentX = touch.clientX;

    const deltaX = this.carouselSwipeState.currentX - this.carouselSwipeState.startX;

    // Предотвращаем вертикальный скролл при горизонтальном свайпе
    if (Math.abs(deltaX) > 10) {
      event.preventDefault();
    }
  }

  /**
   * Обработчик окончания касания карусели
   */
  private handleCarouselTouchEnd(): void {
    if (!this.carouselSwipeState.isDragging) return;

    const deltaX = this.carouselSwipeState.currentX - this.carouselSwipeState.startX;
    const deltaTime = Date.now() - this.carouselSwipeState.startTime;
    const velocity = Math.abs(deltaX) / deltaTime;

    // Определяем направление свайпа (требуется минимальное расстояние и скорость)
    if (Math.abs(deltaX) > CAROUSEL_CONFIG.SWIPE_THRESHOLD || velocity > CAROUSEL_CONFIG.SWIPE_VELOCITY_THRESHOLD) {
      if (deltaX > 0) {
        // Свайп вправо - предыдущий элемент
        this.moveToPreviousCarouselItem();
      } else {
        // Свайп влево - следующий элемент
        this.moveToNextCarouselItem();
      }
    }

    this.carouselSwipeState.isDragging = false;
  }

  /**
   * Переход к следующему элементу карусели
   */
  private moveToNextCarouselItem(): void {
    const newPosition = Math.min(this.carouselState.totalCards - 1, this.carouselState.currentCenterIndex + 1);
    this.moveCarouselToPosition(newPosition);
    logger.info('Carousel moved to next item', { position: newPosition });
  }

  /**
   * Переход к предыдущему элементу карусели
   */
  private moveToPreviousCarouselItem(): void {
    const newPosition = Math.max(0, this.carouselState.currentCenterIndex - 1);
    this.moveCarouselToPosition(newPosition);
  }

  /**
   * Обновление метаданных карточки (лайки, просмотры) без перерисовки
   * #OPTIMIZATION #METADATA-UPDATE
   */
  private updateCardMetadata(historyItemId: number, likesCount: number, isLiked: boolean): void {
    try {
      // Находим карточку по data-id
      const card = document.querySelector(`.history-card[data-id="${historyItemId}"]`);
      if (!card) {
        return;
      }

      // Обновляем счетчик лайков
      const likeCountEl = card.querySelector('.carousel-like-count');
      if (likeCountEl) {
        likeCountEl.textContent = String(likesCount);
      }

      // Обновляем состояние кнопки лайка
      const likeBtn = card.querySelector('.carousel-like-btn');
      if (likeBtn) {
        if (isLiked) {
          likeBtn.classList.add('liked');
        } else {
          likeBtn.classList.remove('liked');
        }
      }
    } catch (error) {
      logger.error('Error updating card metadata', { error, historyItemId });
    }
  }

  /**
   * Инициализация UI
   */
  init(): void {

    // Настраиваем навигацию карусели
    this.setupCarouselNavigation();

    // Подписываемся на обновления метаданных истории
    const metadataUpdateHandler = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { historyItemId, likesCount, isLiked } = customEvent.detail;
      this.updateCardMetadata(historyItemId, likesCount, isLiked);
    };

    window.addEventListener('history:metadata-updated', metadataUpdateHandler);
    this.cleanupFunctions.push(() => {
      window.removeEventListener('history:metadata-updated', metadataUpdateHandler);
    });

    // НЕ вызываем updateHistoryDisplay() здесь - это делается в optimisticUIRender()
    // Это предотвращает дублирование отрисовки карусели

  }

  /**
   * Очистка ресурсов
   */
  destroy(): void {

    // Закрываем предпросмотр если открыт
    this.closePreview();

    // Выходим из режима удаления если активен
    if (this.longPressState.isActive) {
      this.exitDeleteMode();
    }

    // Очищаем обработчики событий
    this.cleanupFunctions.forEach(cleanup => cleanup());
    this.cleanupFunctions = [];

    logger.info('Menu UI Manager destroyed');
  }

  /**
   * Добавляет обработчики долгого нажатия к ячейке истории
   */
  private addLongPressHandlers(element: HTMLElement, index: number): void {
    // Обработчики событий
    const startHandler = (e: MouseEvent | TouchEvent) => {
      this.startLongPress(e, element, index);
    };

    const endHandler = () => {
      this.endLongPress();
    };

    // Добавляем обработчики
    element.addEventListener('mousedown', startHandler);
    element.addEventListener('touchstart', startHandler, { passive: true });

    element.addEventListener('mouseup', endHandler);
    element.addEventListener('mouseleave', endHandler);
    element.addEventListener('touchend', endHandler);
    element.addEventListener('touchcancel', endHandler);
  }

  /**
   * Начинает отслеживание долгого нажатия
   */
  private startLongPress(
    event: MouseEvent | TouchEvent,
    element: HTMLElement,
    index: number
  ): void {
    // Если уже активно, не начинаем новое
    if (this.longPressState.isActive) {
      return;
    }

    logger.info('Starting long press tracking', { index });

    // Получаем начальную позицию
    const startX = event.type === 'touchstart'
      ? (event as TouchEvent).touches[0]?.clientX || 0
      : (event as MouseEvent).clientX;
    const startY = event.type === 'touchstart'
      ? (event as TouchEvent).touches[0]?.clientY || 0
      : (event as MouseEvent).clientY;

    // Сохраняем состояние
    this.longPressState.startPosition = { x: startX, y: startY };
    this.longPressState.targetElement = element;
    this.longPressState.targetIndex = index;

    // Создаем обработчик движения
    this.longPressState.moveHandler = (moveEvent: MouseEvent | TouchEvent) => {
      this.handleLongPressMovement(moveEvent);
    };

    // Добавляем обработчики движения
    element.addEventListener('mousemove', this.longPressState.moveHandler);
    element.addEventListener('touchmove', this.longPressState.moveHandler, { passive: true });

    // Запускаем таймер
    this.longPressState.pressTimer = window.setTimeout(() => {
      this.activateLongPress(element, index);
      event.preventDefault();
    }, CAROUSEL_CONFIG.LONG_PRESS_DELAY);
  }

  /**
   * Обрабатывает движение во время нажатия
   */
  private handleLongPressMovement(event: MouseEvent | TouchEvent): void {
    if (!this.longPressState.startPosition || !this.longPressState.pressTimer) {
      return;
    }

    const currentX = event.type.includes('touch')
      ? (event as TouchEvent).touches[0]?.clientX || 0
      : (event as MouseEvent).clientX;
    const currentY = event.type.includes('touch')
      ? (event as TouchEvent).touches[0]?.clientY || 0
      : (event as MouseEvent).clientY;

    // Вычисляем расстояние движения
    const deltaX = Math.abs(currentX - this.longPressState.startPosition.x);
    const deltaY = Math.abs(currentY - this.longPressState.startPosition.y);

    // Если движение превышает лимит, отменяем долгое нажатие
    const movementThreshold = 10;
    if (deltaX > movementThreshold || deltaY > movementThreshold) {
      logger.info('Long press cancelled due to movement', { deltaX, deltaY });
      this.cancelLongPress();
    }
  }

  /**
   * Активирует режим долгого нажатия
   */
  private activateLongPress(element: HTMLElement, index: number): void {
    logger.info('Long press activated', { index });

    this.longPressState.isActive = true;

    // Добавляем CSS класс
    element.classList.add(CSS_CLASSES.DELETE_MODE);

    // Тактильная обратная связь через Telegram API
    this.triggerHapticFeedback();

    // Добавляем кнопку удаления
    this.addDeleteButton(element, index);

    // Добавляем глобальный обработчик клика для выхода из режима
    this.longPressState.documentClickHandler = (event: Event) => {
      if (!element.contains(event.target as Node)) {
        this.exitDeleteMode();
      }
    };
    document.addEventListener('click', this.longPressState.documentClickHandler);
  }

  /**
   * Заканчивает отслеживание долгого нажатия
   */
  private endLongPress(): void {
    if (this.longPressState.pressTimer) {
      clearTimeout(this.longPressState.pressTimer);
      this.longPressState.pressTimer = null;
    }

    // Удаляем обработчики движения
    if (this.longPressState.moveHandler && this.longPressState.targetElement) {
      this.longPressState.targetElement.removeEventListener('mousemove', this.longPressState.moveHandler);
      this.longPressState.targetElement.removeEventListener('touchmove', this.longPressState.moveHandler);
    }

    this.longPressState.moveHandler = null;
  }

  /**
   * Отменяет долгое нажатие
   */
  private cancelLongPress(): void {
    this.endLongPress();
    this.resetLongPressState();
  }

  /**
   * Сбрасывает состояние долгого нажатия
   */
  private resetLongPressState(): void {
    this.longPressState.isActive = false;
    this.longPressState.pressTimer = null;
    this.longPressState.startPosition = null;
    this.longPressState.targetElement = null;
    this.longPressState.targetIndex = null;
    this.longPressState.moveHandler = null;
  }

  /**
   * Активирует тактильную обратную связь через Telegram API
   */
  private triggerHapticFeedback(): void {
    try {
      // Используем Telegram WebApp API для вибрации
      if (window.Telegram?.WebApp?.HapticFeedback) {
        // Используем 'medium' для умеренной вибрации
        window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
        logger.info('Telegram haptic feedback triggered');
      } else {
        // Fallback на стандартную вибрацию браузера
        if (navigator.vibrate) {
          navigator.vibrate(50);
          logger.info('Browser vibration triggered');
        }
      }
    } catch (error) {
      logger.warn('Failed to trigger haptic feedback', error);
    }
  }

  /**
   * Добавляет кнопку удаления к элементу
   */
  private addDeleteButton(element: HTMLElement, index: number): void {
    logger.info('Adding delete button', { index });

    const deleteButton = this.createDeleteButton(index);
    this.setupDeleteButtonStyles(deleteButton);

    // Добавляем CSS анимацию если её нет
    this.ensureLongPressStyles();

    // Добавляем кнопку к элементу
    element.appendChild(deleteButton);
  }

  /**
   * Создает кнопку удаления
   */
  private createDeleteButton(index: number): HTMLElement {
    const deleteButton = document.createElement('button');
    deleteButton.className = CSS_CLASSES.DELETE_HISTORY_BTN;
    deleteButton.innerHTML = this.getDeleteButtonIcon();

    // Обработчик клика по кнопке удаления
    deleteButton.addEventListener('click', async (event: Event) => {
      event.stopPropagation();
      await this.handleDeleteClick(deleteButton, index);
    });

    return deleteButton;
  }

  /**
   * Возвращает SVG иконку для кнопки удаления
   */
  private getDeleteButtonIcon(): string {
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 6h18"></path>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
    `;
  }

  /**
   * Настраивает стили кнопки удаления
   */
  private setupDeleteButtonStyles(button: HTMLElement): void {
    const styles = {
      position: 'absolute',
      bottom: '10px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(244, 67, 54, 0.9)',
      color: 'white',
      border: 'none',
      borderRadius: '20px',
      padding: '8px 16px',
      fontSize: '12px',
      fontWeight: 'bold',
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      cursor: 'pointer',
      zIndex: '1000',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
      transition: 'all 0.2s ease',
      opacity: '0',
      animation: 'fadeInUp 0.3s ease forwards',
    };

    Object.assign(button.style, styles);
  }

  /**
   * Добавляет необходимые CSS стили для долгого нажатия
   */
  private ensureLongPressStyles(): void {
    if (!document.querySelector('#longpress-styles')) {
      const styleSheet = document.createElement('style');
      styleSheet.id = 'longpress-styles';
      styleSheet.textContent = `
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }

        .delete-mode {
          position: relative;
          z-index: 100;
          transform: scale(1.02);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          transition: all 0.2s ease;
          user-select: none; /* Запрещаем выделение текста */
          -webkit-user-select: none; /* Для WebKit браузеров */
          -moz-user-select: none; /* Для Firefox */
          -ms-user-select: none; /* Для IE/Edge */
        }

        .delete-history-btn {
          user-select: none; /* Запрещаем выделение текста */
          -webkit-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
        }

        .delete-history-btn:hover {
          background: rgba(244, 67, 54, 1) !important;
          transform: translateX(-50%) scale(1.05) !important;
        }

        /* Запрещаем выделение текста для всех ячеек истории при долгом нажатии */
        .history-cell {
          user-select: none;
          -webkit-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
        }
      `;
      document.head.appendChild(styleSheet);
    }
  }

  /**
   * Обработчик клика по кнопке удаления
   */
  private async handleDeleteClick(button: HTMLButtonElement, index: number): Promise<void> {
    this.disableDeleteButton(button);

    try {
      const confirmed = await this.requestDeleteConfirmation();

      if (confirmed) {
        await this.performDelete(button, index);
      } else {
        this.restoreDeleteButton(button);
      }
    } catch (error) {
      logger.error('Failed to delete history item', error);
      this.restoreDeleteButton(button);
    }
  }

  /**
   * Блокирует кнопку удаления и показывает состояние загрузки
   */
  private disableDeleteButton(button: HTMLButtonElement): void {
    button.disabled = true;
    button.style.opacity = '0.7';
    button.innerHTML = 'Удаление...';
  }

  /**
   * Запрашивает подтверждение удаления
   */
  private async requestDeleteConfirmation(): Promise<boolean> {
    return await this.showConfirmDialog('Удалить этот элемент из истории?');
  }

  /**
   * Выполняет удаление элемента
   */
  private async performDelete(button: HTMLButtonElement, index: number): Promise<void> {
    const success = await historyManager.removeItem(index);

    if (success) {
      logger.info('History item deleted successfully', { index });

      // Тактильная обратная связь об успехе
      this.triggerSuccessHaptic();

      // Анимируем исчезновение кнопки
      this.animateDeleteButtonDisappearance(button);

      // Выходим из режима удаления
      this.exitDeleteMode();

      // Обновляем отображение истории
      this.updateHistoryDisplay();
    } else {
      logger.error('Не удалось удалить элемент');
    }
  }

  /**
   * Анимирует исчезновение кнопки удаления
   */
  private animateDeleteButtonDisappearance(button: HTMLButtonElement): void {
    button.style.opacity = '0';
    button.style.transform = 'translateX(-50%) translateY(10px)';

    setTimeout(() => {
      if (button.parentNode) {
        button.parentNode.removeChild(button);
      }
    }, 300);
  }

  /**
   * Восстанавливает состояние кнопки удаления
   */
  private restoreDeleteButton(button: HTMLButtonElement): void {
    button.disabled = false;
    button.style.opacity = '1';
    button.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 6h18"></path>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
      Удалить
    `;
  }

  /**
   * Показывает диалог подтверждения через uiCoreManager
   * ПРИМЕЧАНИЕ: Используем централизованный метод из uiCoreManager
   * для избежания дублирования логики
   */
  private async showConfirmDialog(message: string): Promise<boolean> {
    return await uiCoreManager.showConfirmDialog(message);
  }

  /**
   * Тактильная обратная связь для успешного действия
   */
  private triggerSuccessHaptic(): void {
    try {
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        logger.info('Success haptic feedback triggered');
      }
    } catch (error) {
      logger.warn('Failed to trigger success haptic feedback', error);
    }
  }

  /**
   * Выходит из режима удаления
   */
  private exitDeleteMode(): void {
    if (!this.longPressState.targetElement) {
      return;
    }

    logger.info('Exiting delete mode');

    // Удаляем CSS класс
    this.longPressState.targetElement.classList.remove(CSS_CLASSES.DELETE_MODE);

    // Удаляем кнопку удаления
    const deleteButton = this.longPressState.targetElement.querySelector(`.${CSS_CLASSES.DELETE_HISTORY_BTN}`);
    if (deleteButton) {
      deleteButton.remove();
    }

    // Удаляем глобальный обработчик клика
    if (this.longPressState.documentClickHandler) {
      document.removeEventListener('click', this.longPressState.documentClickHandler);
      this.longPressState.documentClickHandler = null;
    }

    // Сбрасываем состояние
    this.resetLongPressState();
  }


  /**
   * Выход из режима удаления (публичный метод для uiManager)
   */
  exitDeleteModePublic(): void {
    this.exitDeleteMode();
  }

  /**
   * Получение статистики UI менеджера
   */
  getStats() {
    return {
      elementsInitialized: Object.values(this.elements).filter(Boolean).length,
      totalElements: Object.keys(this.elements).length,
      hasPreview: !!this.currentPreview,
      eventListenersCount: this.cleanupFunctions.length,
      historyCellsCount: this.elements.historyCells.length,
      longPressActive: this.longPressState.isActive,
    };
  }
}

// Создаем глобальный экземпляр менеджера меню
export const uiMenuManager = new UIMenuManager();
