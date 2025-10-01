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
import { uiAnalysisManager } from './uiAnalysis';

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

    logger.info('Menu DOM elements initialized', {
      hasUserName: !!this.elements.userName,
      hasUserPhoto: !!this.elements.userPhoto,
      hasCameraBtn: !!this.elements.cameraBtn,
      historyCellsCount: this.elements.historyCells.length,
      hasAppContainer: !!this.elements.appContainer,
    });
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

    logger.info('Menu event listeners setup completed');
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
      logger.info('History cell clicked', { index });
      this.showSavedAnalysis(historyItem);
    } else {
      logger.info('Empty history cell clicked, checking limits', { index });

      // Проверяем лимиты перед открытием камеры
      if (!authManager.canAnalyze()) {
        logger.info('Analysis limit reached, showing subscription modal', {
          analysesLeft: authManager.getAnalysesLeft(),
          isPremium: authManager.isPremium()
        });
        uiCoreManager.showSubscriptionModal();
        return;
      }

      logger.info('Limits check passed, opening camera', { index });
      this.handleCameraButtonClick(new Event('click'));
    }
  }


  /**
   * Показать сохраненный анализ
   */
  private showSavedAnalysis(analysisData: HistoryItem): void {
    logger.info('Showing saved analysis');

    if (!analysisData.photo) {
      this.logError('Не удалось загрузить данные фотографии');
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

    // Устанавливаем фото
    savedAnalysisPhoto.src = `data:image/jpeg;base64,${analysisData.photo}`;

    // Формируем текст анализа
    let analysisContent = '';

    // Текст анализа LLM
    if (analysisData.analysis) {
      const processedAnalysis = analysisData.analysis.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      analysisContent += `<strong>Анализ стиля:</strong><br>${processedAnalysis}`;
    } else {
      analysisContent += '<em>Текст анализа недоступен</em>';
    }

    savedAnalysisData.innerHTML = analysisContent;
    savedAnalysisDate.textContent = formatHistoryDate(analysisData.timestamp);

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
    if (!savedAnalysisScreen) return;

    logger.info('Closing saved analysis screen');

    savedAnalysisScreen.classList.add('hidden');
    this.currentPreview = null;
  }

  /**
   * Закрытие экрана анализа
   */
  private closePreview(): void {
    // Закрываем экран анализа
    const analysisScreen = getElement('#analysis-screen');
    if (analysisScreen) {
      analysisScreen.classList.add('hidden');
    }

    // Закрываем экран сохраненного анализа
    this.closeSavedAnalysis();

    // Очищаем текущее изображение в менеджере камеры
    cameraManager.clearCurrentImage();
  }

  /**
   * Обновление отображения истории
   */
  updateHistoryDisplay(): void {
    const filledItems = historyManager.getFilledItems();

    logger.info('Updating history display', {
      filledItems: filledItems.length,
      currentCenter: this.carouselState.currentCenterIndex
    });

    // Создаем карусель динамически
    this.createCarouselCards(filledItems);

    // Позиционируем карусель
    this.positionCarousel();

    // Обновляем навигацию
    this.updateCarouselNavigation();
  }

  /**
   * Создание карт карусели динамически
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

    logger.info('Carousel cards created', { totalCards, filledItems: filledItems.length });
  }

  /**
   * Создание одной карты
   */
  private createCard(index: number, data: HistoryItem | null): HTMLElement {
    const card = this.createCardElement(index);
    const content = this.createCardContent();

    if (data && !data.isEmpty) {
      this.setupFilledCard(card, content, data);
    } else {
      this.setupEmptyCard(card, content, index);
    }

    card.appendChild(content);
    return card;
  }

  /**
   * Создает базовый элемент карты
   */
  private createCardElement(index: number): HTMLElement {
    return createElement('div', {
      class: 'history-card',
      'data-index': index.toString(),
    });
  }

  /**
   * Создает контейнер контента карты
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

    if (data.photo) {
      card.style.backgroundImage = `url(data:image/jpeg;base64,${data.photo})`;
    }

    const caption = createElement('div', {
      class: 'history-card-caption',
    }, formatHistoryDate(data.timestamp));

    content.appendChild(caption);

    // Находим реальный индекс элемента в общем массиве истории
    const realIndex = this.findRealHistoryIndex(data);

    // Обработчики
    this.addLongPressHandlers(card, realIndex);
    card.onclick = () => this.showSavedAnalysis(data);
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
   * Оптимизированная версия с использованием Map для быстрого поиска
   */
  private findRealHistoryIndex(data: HistoryItem): number {
    const allItems = historyManager.getAllItems();

    // Создаем композитный ключ для быстрого поиска
    const searchKey = `${data.timestamp}_${data.photo?.substring(0, 50) || ''}`;

    // Создаем Map для быстрого поиска (если элементов много)
    const itemMap = new Map<string, number>();

    for (let i = 0; i < allItems.length; i++) {
      const item = allItems[i];
      if (item && !item.isEmpty) {
        const key = `${item.timestamp}_${item.photo?.substring(0, 50) || ''}`;
        itemMap.set(key, i);
      }
    }

    // Быстрый поиск по ключу
    const foundIndex = itemMap.get(searchKey);
    if (foundIndex !== undefined) {
      return foundIndex;
    }

    // Fallback на линейный поиск (на случай если композитный ключ не сработал)
    for (let i = 0; i < allItems.length; i++) {
      const item = allItems[i];
      if (item &&
          !item.isEmpty &&
          item.timestamp === data.timestamp &&
          item.photo === data.photo) {
        return i;
      }
    }

    logger.warn('Could not find real history index for item', { timestamp: data.timestamp });
    return -1; // Не нашли
  }

  /**
   * Позиционирование карусели для отображения центральной карты
   */
  private positionCarousel(): void {
    const carousel = getElement(DOM_SELECTORS.HISTORY_CAROUSEL);
    if (!carousel) return;

    // Для первого запуска показываем пустую карту по центру
    const filledCount = historyManager.getFilledCount();

    if (filledCount === 0) {
      // Первый запуск - пустая карта в центре
      this.carouselState.currentCenterIndex = 0;
    } else {
      // Показываем самую новую (правую) карту, но центральная остается пустой
      this.carouselState.currentCenterIndex = Math.min(filledCount, this.carouselState.totalCards - 1);
    }

    // Рассчитываем трансформацию для новых размеров карт
    const offset = -this.carouselState.currentCenterIndex * CAROUSEL_CONFIG.TOTAL_CARD_WIDTH;

    // Центрируем карусель относительно контейнера
    carousel.style.transform = `translateX(calc(50% - ${CAROUSEL_CONFIG.CENTER_OFFSET}px + ${offset}px))`;

    // Обновляем центральную карту
    this.updateCenterCard();

    logger.info('Carousel positioned', {
      centerIndex: this.carouselState.currentCenterIndex,
      offset,
      filledCount
    });
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

    logger.info('Carousel navigation updated', {
      totalCards: this.carouselState.totalCards,
      currentCenter: this.carouselState.currentCenterIndex
    });
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

    logger.info('Carousel moved to position', {
      position,
      offset,
      totalCards: this.carouselState.totalCards
    });
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

    logger.info('Carousel navigation handlers setup');
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

    logger.info('Carousel swipe handlers setup');
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
   * Переход к предыдущему элементу карусели
   */
  private moveToPreviousCarouselItem(): void {
    const newPosition = Math.max(0, this.carouselState.currentCenterIndex - 1);
    this.moveCarouselToPosition(newPosition);
    logger.info('Carousel moved to previous item', { position: newPosition });
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
   * Логирование ошибки без отображения пользователю
   */
  private logError(message: string): void {
    logger.error('Silent error handling', { message });
  }

  /**
   * Инициализация UI
   */
  init(): void {
    logger.info('Initializing Menu UI Manager');

    // Настраиваем навигацию карусели
    this.setupCarouselNavigation();

    // Обновляем отображение истории
    this.updateHistoryDisplay();

    logger.info('Menu UI Manager initialized successfully');
  }

  /**
   * Очистка ресурсов
   */
  destroy(): void {
    logger.info('Destroying Menu UI Manager');

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
    logger.info('Delete button clicked', { index });

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
      this.logError('Ошибка при удалении элемента');
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
    const success = historyManager.removeItem(index);

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
      throw new Error('Не удалось удалить элемент');
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
   * Показывает диалог подтверждения через Telegram API (silent fallback)
   */
  private async showConfirmDialog(message: string): Promise<boolean> {
    try {
      if (window.Telegram?.WebApp?.showConfirm) {
        return new Promise((resolve) => {
          window.Telegram!.WebApp.showConfirm(message, resolve);
        });
      } else {
        // Silent fallback - всегда подтверждаем
        logger.info('Silent confirm', { message });
        return true;
      }
    } catch (error) {
      logger.warn('Failed to show Telegram confirm dialog', error);
      return true; // Silent fallback
    }
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
