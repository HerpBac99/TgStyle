/**
 * Модуль для управления пользовательским интерфейсом
 */

import type { 
  DOMElements, 
  HistoryItem, 
  TelegramWebApp
} from '@/types/index.js';
import { 
  DOM_SELECTORS,
  CSS_CLASSES
} from '@/utils/constants.js';
import { 
  getElement,
  getElements,
  createElement,
  addEventListenerWithCleanup,
  formatHistoryDate 
} from '@/utils/helpers.js';
import { logger } from './logger';
import { authManager } from './auth.js';
import { cameraManager } from './camera.js';
import { historyManager } from './history.js';

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
 * Класс для управления UI
 */
class UIManager {
  private elements: DOMElements = {
    userName: null,
    userPhoto: null,
    cameraBtn: null,
    historyCells: null! as NodeListOf<HTMLElement>,
    appContainer: null,
  };

  private cleanupFunctions: (() => void)[] = [];
  private currentPreview: HTMLElement | null = null;
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
      historyCells: getElements(DOM_SELECTORS.HISTORY_CELLS),
      appContainer: getElement(DOM_SELECTORS.APP_CONTAINER),
    };

    logger.debug('DOM elements initialized', {
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
    if (this.elements.cameraBtn) {
      const cleanup = addEventListenerWithCleanup(
        this.elements.cameraBtn,
        'click',
        this.handleCameraButtonClick.bind(this)
      );
      this.cleanupFunctions.push(cleanup);
    }

    // Обработчики ячеек истории добавляются динамически в updateHistoryDisplay

    // Глобальные обработчики через стандартные addEventListener
    document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    window.addEventListener('analysisStateChange', this.handleAnalysisStateChange.bind(this) as EventListener);

    // Event listeners setup completed
  }

  /**
   * Обработчик клика по кнопке камеры
   */
  private async handleCameraButtonClick(event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    logger.info('Camera button clicked', {
      timestamp: Date.now(),
      userAgent: navigator.userAgent.split(' ')[0]
    });

    try {
      // Захватываем фото с выбором источника
      const result = await cameraManager.capturePhoto();
      
      if (result.success && result.image) {
        logger.info('Photo captured successfully', {
          imageSize: result.image.originalSize,
          format: result.image.format,
          dimensions: `${result.image.width}x${result.image.height}`
        });
        
        // Показываем предпросмотр
        this.showFullscreenPreview(result.image.base64);
        
        // Вибрация успеха
        authManager.vibrate('light');
      } else {
        this.logError(result.error || 'Не удалось сделать фото');
      }
    } catch (error) {
      logger.error('Error capturing photo', error);
      this.logError('Ошибка при работе с камерой');
    }
  }

  /**
   * Обработчик клика по ячейке истории
   */
  private handleHistoryCellClick(index: number): void {
    const historyItem = historyManager.getItem(index);
    
    if (historyItem) {
      logger.info('History cell clicked', { index });
      this.showSavedAnalysis(historyItem);
    } else {
      logger.info('Empty history cell clicked, opening camera', { index });
      this.handleCameraButtonClick(new Event('click'));
    }
  }

  /**
   * Обработчик изменения видимости страницы
   */
  private handleVisibilityChange(): void {
    if (!document.hidden) {
      this.ensureBackgroundColor();
    }
  }

  /**
   * Обработчик изменения состояния анализа
   */
  private handleAnalysisStateChange(event: CustomEvent): void {
    const state = event.detail;
    logger.debug('Analysis state changed', state);
    
    // Можно добавить обновление UI в зависимости от состояния
    // Например, показать прогресс-бар или спиннер
  }

  /**
   * Принудительная установка градиентного фона
   */
  private ensureBackgroundColor(): void {
    const gradientBg = 'linear-gradient(135deg, #C8E6C9 0%, #E8F5E8 50%, #F5F5DC 100%)';
    
    // Устанавливаем для body
    document.body.style.background = gradientBg;
    
    // Устанавливаем для контейнера приложения
    if (this.elements.appContainer) {
      this.elements.appContainer.style.background = gradientBg;
    }

    logger.debug('Gradient background enforced');
  }

  /**
   * Отображение экрана анализа фото
   */
  private showFullscreenPreview(imageBase64: string): void {
    logger.info('Showing analysis screen');

    // Получаем элементы экрана анализа
    const analysisScreen = getElement('#analysis-screen');
    const analysisPhoto = getElement('#analysis-photo') as HTMLImageElement;
    const loadingIndicator = getElement('#analysis-loading');
    const resultContainer = getElement('#analysis-result-container');

    if (!analysisScreen || !analysisPhoto || !loadingIndicator || !resultContainer) {
      logger.error('Analysis screen elements not found');
      return;
    }

    // Устанавливаем фото
    analysisPhoto.src = `data:image/jpeg;base64,${imageBase64}`;

    // Скрываем результат, показываем загрузку
    resultContainer.classList.add('hidden');
    loadingIndicator.classList.remove('hidden');

    // Показываем экран анализа
    analysisScreen.classList.remove('hidden');
    this.currentPreview = analysisScreen;

    logger.info('Analysis screen displayed');
  }

  /**
   * Показать результат анализа
   */
  showAnalysisResult(result: string): void {
    logger.info('Showing analysis result');

    const loadingIndicator = getElement('#analysis-loading');
    const resultContainer = getElement('#analysis-result-container');
    const analysisText = getElement('#analysis-text');

    if (!loadingIndicator || !resultContainer || !analysisText) {
      logger.error('Analysis result elements not found');
      return;
    }

    // Скрываем загрузку, показываем результат
    loadingIndicator.classList.add('hidden');
    resultContainer.classList.remove('hidden');

    // Устанавливаем текст анализа
    analysisText.textContent = result;

    // Настраиваем обработчики кнопок
    this.setupResultButtons();

    logger.info('Analysis result displayed');
  }

  /**
   * Настройка обработчиков кнопок в результате анализа
   */
  private setupResultButtons(): void {
    // Кнопка лайк
    const likeBtn = getElement('#like-btn');
    if (likeBtn) {
      likeBtn.addEventListener('click', () => {
        this.handleLikeClick();
      });
    }

    // Кнопка поделиться
    const shareBtn = getElement('#share-btn');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        this.handleShareClick();
      });
    }

    // Кнопка закрыть
    const closeBtn = getElement('#close-analysis-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.closePreview();
      });
    }
  }

  /**
   * Обработчик клика по кнопке лайк
   */
  private handleLikeClick(): void {
    logger.info('Like button clicked');

    const likeBtn = getElement('#like-btn');
    if (likeBtn) {
      // Анимация нажатия
      likeBtn.style.transform = 'scale(0.95)';
      likeBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        ❤️ Понравилось!
      `;

      setTimeout(() => {
        likeBtn.style.transform = 'scale(1)';
      }, 200);
    }

    // Тактильная обратная связь
    authManager.vibrate('light');
  }

  /**
   * Обработчик клика по кнопке поделиться
   */
  private handleShareClick(): void {
    logger.info('Share button clicked');

    try {
      // Используем Telegram WebApp API для поделиться
      if (window.Telegram?.WebApp?.openTelegramLink) {
        const shareText = 'Попробуй TgStyle - анализ стиля одежды с помощью ИИ!';
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(window.location.origin)}&text=${encodeURIComponent(shareText)}`;
        window.Telegram.WebApp.openTelegramLink(shareUrl);
      } else {
        // Fallback - копируем в буфер обмена
        const shareText = 'Попробуй TgStyle - анализ стиля одежды с помощью ИИ!';
        navigator.clipboard.writeText(shareText).then(() => {
        }).catch(() => {
        });
      }
    } catch (error) {
      logger.warn('Failed to share', error);
    }

    // Тактильная обратная связь
    authManager.vibrate('light');
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

    // Информация о классификации
    if (analysisData.classification) {
      analysisContent += `<strong>Определено:</strong> ${analysisData.classification.classNameRu} (уверенность: ${analysisData.classification.confidence}%)<br><br>`;
    }

    // Текст анализа LLM
    if (analysisData.analysis) {
      analysisContent += `<strong>Анализ стиля:</strong><br>${analysisData.analysis}`;
    } else {
      analysisContent += '<em>Текст анализа недоступен</em>';
    }

    // Комментарии
    if (analysisData.comments && analysisData.comments.length > 0) {
      analysisContent += `<br><br><strong>Комментарии:</strong><br>• ${analysisData.comments.join('<br>• ')}`;
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
    
    logger.debug('Updating history display', {
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

    logger.debug('Carousel cards created', { totalCards, filledItems: filledItems.length });
  }

  /**
   * Создание одной карты
   */
  private createCard(index: number, data: HistoryItem | null): HTMLElement {
    const card = createElement('div', {
      class: 'history-card',
      'data-index': index.toString(),
    });

    const content = createElement('div', {
      class: 'history-card-content',
    });

    if (data && !data.isEmpty) {
      // Заполненная карта
      card.classList.add(CSS_CLASSES.FILLED);
      
      if (data.photo) {
        card.style.backgroundImage = `url(data:image/jpeg;base64,${data.photo})`;
      }

      const caption = createElement('div', {
        class: 'history-card-caption',
      }, formatHistoryDate(data.timestamp));

      content.appendChild(caption);

      // Обработчики
      this.addLongPressHandlers(card, index);
      card.onclick = () => this.showSavedAnalysis(data);
    } else {
      // Пустая карта (для новых фото)
      const addButton = createElement('div', {
        class: 'add-analysis',
      });
      addButton.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14M5 12h14"></path>
        </svg>
      `;
      
      content.appendChild(addButton);
      card.onclick = () => this.handleHistoryCellClick(index);
    }

    card.appendChild(content);
    return card;
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
    const cardWidth = 220; // 200px + 20px gap
    const offset = -this.carouselState.currentCenterIndex * cardWidth;
    
    // Центрируем карусель относительно контейнера
    carousel.style.transform = `translateX(calc(50% - 100px + ${offset}px))`;

    // Обновляем центральную карту
    this.updateCenterCard();

    logger.debug('Carousel positioned', { 
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

    logger.debug('Carousel navigation updated', { 
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
    const cardWidth = 220; // 200px + 20px gap
    const offset = -position * cardWidth;
    
    carousel.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    carousel.style.transform = `translateX(calc(50% - 100px + ${offset}px))`;

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

    logger.debug('Carousel navigation handlers setup');
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

    logger.debug('Carousel swipe handlers setup');
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
    if (Math.abs(deltaX) > 50 || velocity > 0.3) {
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
    logger.info('Initializing UI Manager');
    
    // Применяем цвет фона
    this.ensureBackgroundColor();
    
    // Настраиваем навигацию карусели
    this.setupCarouselNavigation();
    
    // Обновляем отображение истории
    this.updateHistoryDisplay();
    
    logger.info('UI Manager initialized successfully');
  }

  /**
   * Очистка ресурсов
   */
  destroy(): void {
    logger.info('Destroying UI Manager');
    
    // Закрываем предпросмотр если открыт
    this.closePreview();
    
    // Выходим из режима удаления если активен
    if (this.longPressState.isActive) {
      this.exitDeleteMode();
    }
    
    // Очищаем обработчики событий
    this.cleanupFunctions.forEach(cleanup => cleanup());
    this.cleanupFunctions = [];
    
    logger.info('UI Manager destroyed');
  }

  /**
   * Добавляет обработчики долгого нажатия к ячейке истории
   */
  private addLongPressHandlers(element: HTMLElement, index: number): void {
    logger.debug('Adding long press handlers', { index });

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

    logger.debug('Starting long press tracking', { index });

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
    }, 500); // 500ms как в оригинале
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

    // Если движение превышает лимит (10px), отменяем долгое нажатие
    if (deltaX > 10 || deltaY > 10) {
      logger.debug('Long press cancelled due to movement', { deltaX, deltaY });
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
    element.classList.add('delete-mode');

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
        logger.debug('Telegram haptic feedback triggered');
      } else {
        // Fallback на стандартную вибрацию браузера
        if (navigator.vibrate) {
          navigator.vibrate(50);
          logger.debug('Browser vibration triggered');
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
    logger.debug('Adding delete button', { index });

    // Создаем кнопку удаления
    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-history-btn';
    deleteButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 6h18"></path>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
    `;

    // Стили кнопки
    deleteButton.style.cssText = `
      position: absolute;
      bottom: 10px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(244, 67, 54, 0.9);
      color: white;
      border: none;
      border-radius: 20px;
      padding: 8px 16px;
      font-size: 12px;
      font-weight: bold;
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      z-index: 1000;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      transition: all 0.2s ease;
      opacity: 0;
      animation: fadeInUp 0.3s ease forwards;
    `;

    // Добавляем CSS анимацию если её нет
    this.ensureLongPressStyles();

    // Обработчик клика по кнопке удаления
    deleteButton.addEventListener('click', async (event: Event) => {
      event.stopPropagation();
      await this.handleDeleteClick(deleteButton, index);
    });

    // Добавляем кнопку к элементу
    element.appendChild(deleteButton);
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

    // Блокируем кнопку
    button.disabled = true;
    button.style.opacity = '0.7';
    button.innerHTML = 'Удаление...';

    try {
      // Запрашиваем подтверждение через Telegram API
      const confirmed = await this.showConfirmDialog('Удалить этот элемент из истории?');
      
      if (confirmed) {
        // Удаляем элемент из истории
        const success = historyManager.removeItem(index);
        
        if (success) {
          logger.info('History item deleted successfully', { index });
          
          // Тактильная обратная связь об успехе
          this.triggerSuccessHaptic();
          
          // Анимируем исчезновение кнопки
          button.style.opacity = '0';
          button.style.transform = 'translateX(-50%) translateY(10px)';
          
          setTimeout(() => {
            if (button.parentNode) {
              button.parentNode.removeChild(button);
            }
          }, 300);
          
          // Выходим из режима удаления
          this.exitDeleteMode();
          
          // Обновляем отображение истории
          this.updateHistoryDisplay();
        } else {
          throw new Error('Не удалось удалить элемент');
        }
      } else {
        // Пользователь отменил удаление
        this.restoreDeleteButton(button);
      }
    } catch (error) {
      logger.error('Failed to delete history item', error);
      this.restoreDeleteButton(button);
      this.logError('Ошибка при удалении элемента');
    }
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
        logger.debug('Success haptic feedback triggered');
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

    logger.debug('Exiting delete mode');

    // Удаляем CSS класс
    this.longPressState.targetElement.classList.remove('delete-mode');

    // Удаляем кнопку удаления
    const deleteButton = this.longPressState.targetElement.querySelector('.delete-history-btn');
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

// Создаем глобальный экземпляр менеджера UI
export const uiManager = new UIManager();

export default uiManager;
