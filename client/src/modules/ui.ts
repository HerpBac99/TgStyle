/**
 * Модуль для управления пользовательским интерфейсом
 */

import type { 
  DOMElements, 
  HistoryItem, 
  AnalysisResponse,
  ClassificationData,
  TelegramWebApp
} from '@/types/index.js';
import { 
  DOM_SELECTORS,
  CSS_CLASSES,
  ANIMATION_DURATIONS,
  THEME_COLORS 
} from '@/utils/constants.js';
import { 
  getElement,
  getElements,
  createElement,
  addEventListenerWithCleanup,
  formatHistoryDate 
} from '@/utils/helpers.js';
import { logger } from './logger.js';
import { authManager } from './auth.js';
import { cameraManager } from './camera.js';
import { historyManager } from './history.js';
import { analysisManager } from './analysis.js';

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

    logger.debug('Event listeners setup completed');
  }

  /**
   * Обработчик клика по кнопке камеры
   */
  private async handleCameraButtonClick(event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    logger.info('Camera button clicked');

    try {
      // Захватываем фото
      const result = await cameraManager.capturePhoto(true);
      
      if (result.success && result.image) {
        logger.info('Photo captured successfully');
        
        // Показываем предпросмотр
        this.showFullscreenPreview(result.image.base64);
        
        // Вибрация успеха
        authManager.vibrate('light');
      } else {
        this.showError(result.error || 'Не удалось сделать фото');
      }
    } catch (error) {
      logger.error('Error capturing photo', error);
      this.showError('Ошибка при работе с камерой');
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
      logger.debug('App became visible, ensuring background color');
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
   * Принудительная установка цвета фона
   */
  private ensureBackgroundColor(): void {
    const targetColor = THEME_COLORS.PRIMARY_BG;
    
    // Устанавливаем для body
    document.body.style.backgroundColor = targetColor;
    
    // Устанавливаем для контейнера приложения
    if (this.elements.appContainer) {
      this.elements.appContainer.style.backgroundColor = targetColor;
    }

    logger.debug('Background color enforced', { color: targetColor });
  }

  /**
   * Отображение полноэкранного предпросмотра
   */
  private showFullscreenPreview(imageBase64: string): void {
    logger.info('Showing fullscreen preview');

    // Удаляем существующий предпросмотр если есть
    if (this.currentPreview) {
      this.closePreview();
    }

    const previewContainer = createElement('div', {
      id: 'fullscreen-preview',
      style: `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100vh;
        background-color: #000;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        align-items: center;
        padding: 0;
      `,
    });

    // Создаем изображение
    const img = createElement('img', {
      src: `data:image/jpeg;base64,${imageBase64}`,
      style: `
        width: 100%;
        height: calc(50vh - 35px);
        object-fit: contain;
      `,
    });

    // Создаем панель кнопок
    const buttonContainer = createElement('div', {
      style: `
        display: flex;
        justify-content: space-between;
        width: 100%;
        height: 70px;
        background-color: #18191a;
        padding: 10px 20px;
      `,
    });

    // Кнопка "назад"
    const backButton = this.createButton('⬅️', 'Назад', () => {
      this.closePreview();
    });

    // Кнопка "анализировать"
    const analyzeButton = this.createButton('⬆️', 'Анализировать', async () => {
      await this.handleAnalyzeClick(analyzeButton, previewContainer);
    });
    analyzeButton.style.backgroundColor = THEME_COLORS.PRIMARY_BG;

    buttonContainer.appendChild(backButton);
    buttonContainer.appendChild(analyzeButton);

    previewContainer.appendChild(img);
    previewContainer.appendChild(buttonContainer);

    document.body.appendChild(previewContainer);
    this.currentPreview = previewContainer;

    logger.info('Fullscreen preview displayed');
  }

  /**
   * Создание кнопки
   */
  private createButton(icon: string, _text: string, onClick: () => void): HTMLButtonElement {
    const button = createElement('button', {
      style: `
        background-color: transparent;
        color: white;
        border: none;
        border-radius: 50%;
        width: 50px;
        height: 50px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        cursor: pointer;
      `,
    }, icon);

    button.addEventListener('click', onClick);
    return button;
  }

  /**
   * Обработчик клика по кнопке анализа
   */
  private async handleAnalyzeClick(button: HTMLButtonElement, container: HTMLElement): Promise<void> {
    logger.info('Analyze button clicked');

    // Меняем кнопку на лоадер
    button.innerHTML = '⏳';
    button.disabled = true;

    try {
      const response = await analysisManager.analyzeCurrentImage();
      
      if (response.success) {
        logger.info('Analysis completed successfully');
        
        // Показываем результаты под фото
        this.showAnalysisResults(response, container);
        
        // Обновляем историю в UI
        this.updateHistoryDisplay();
        
        // Показываем тост с результатом
        if (response.classification) {
          this.showClassificationToast(response.classification);
        }
      } else {
        throw new Error(response.error || 'Ошибка анализа');
      }
    } catch (error) {
      logger.error('Analysis failed', error);
      this.showError('Ошибка при анализе: ' + (error instanceof Error ? error.message : 'Неизвестная ошибка'));
    } finally {
      // Меняем кнопку на закрытие
      button.innerHTML = '✕';
      button.disabled = false;
      button.onclick = () => this.closePreview();
    }
  }

  /**
   * Показ результатов анализа
   */
  private showAnalysisResults(result: AnalysisResponse, container: HTMLElement): void {
    logger.info('Showing analysis results');

    const resultsContainer = createElement('div', {
      style: `
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(10px);
        border-radius: 20px 20px 0 0;
        padding: 20px;
        max-height: 50vh;
        overflow-y: auto;
        z-index: 1001;
      `,
    });

    const classification = result.classification || {
      classNameRu: 'Неизвестный тип',
      confidence: '0',
    };

    resultsContainer.innerHTML = `
      <div style="text-align: center; margin-bottom: 15px;">
        <div style="background: linear-gradient(45deg, ${THEME_COLORS.PRIMARY_BG}, ${THEME_COLORS.BUTTON_COLOR}); color: white; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: bold; display: inline-block; margin-bottom: 10px;">
          🤖 FastVLM AI Анализ
        </div>
        <h3 style="margin: 10px 0; color: #333;">Результаты анализа одежды</h3>
      </div>

      <div style="background: #f8f9fa; padding: 15px; border-radius: 12px; margin-bottom: 15px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <strong style="color: #333;">Определенный тип:</strong>
          <span style="color: ${THEME_COLORS.PRIMARY_BG}; font-weight: bold;">${classification.classNameRu}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong style="color: #333;">Уверенность:</strong>
          <span style="color: #666;">${classification.confidence}%</span>
        </div>
      </div>

      <div style="background: #f8f9fa; padding: 15px; border-radius: 12px; margin-bottom: 15px;">
        <h4 style="margin: 0 0 10px 0; color: #333; font-size: 16px;">Детальный анализ:</h4>
        <div style="color: #555; line-height: 1.6; white-space: pre-wrap; max-height: 200px; overflow-y: auto;">
          ${result.analysis || 'Анализ недоступен'}
        </div>
      </div>

      <div style="text-align: center; color: #666; font-size: 12px;">
        Анализ выполнен с помощью FastVLM AI
      </div>
    `;

    container.appendChild(resultsContainer);

    // Анимация появления
    setTimeout(() => {
      resultsContainer.style.transition = 'all 0.3s ease';
      resultsContainer.style.transform = 'translateY(0)';
    }, 100);
  }

  /**
   * Показ всплывающего уведомления с результатом классификации
   */
  private showClassificationToast(classification: ClassificationData): void {
    logger.info('Showing classification toast');

    const toast = createElement('div', {
      class: CSS_CLASSES.CLASSIFICATION_TOAST,
      style: `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%) translateY(100px);
        background-color: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 15px 20px;
        border-radius: 12px;
        font-size: 16px;
        text-align: center;
        z-index: 2000;
        min-width: 250px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        transition: transform 0.3s ease, opacity 0.3s ease;
        opacity: 0;
      `,
    });

    toast.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 5px;">Результат анализа:</div>
      <div>${classification.classNameRu}</div>
      <div style="margin-top: 5px; font-size: 14px; opacity: 0.8;">Уверенность: ${classification.confidence}%</div>
    `;

    document.body.appendChild(toast);

    // Анимация появления
    setTimeout(() => {
      toast.style.transform = 'translateX(-50%) translateY(0)';
      toast.style.opacity = '1';
    }, 10);

    // Автоматическое скрытие
    setTimeout(() => {
      toast.style.transform = 'translateX(-50%) translateY(100px)';
      toast.style.opacity = '0';
      
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, ANIMATION_DURATIONS.TOAST);
  }

  /**
   * Показ сохраненного анализа
   */
  private showSavedAnalysis(analysisData: HistoryItem): void {
    logger.info('Showing saved analysis');

    if (!analysisData.photo) {
      this.showError('Не удалось загрузить данные фотографии');
      return;
    }

    const photoPreview = createElement('div', {
      id: 'photo-preview-container',
      style: `
        position: fixed;
        top: 20px;
        left: 20px;
        right: 20px;
        bottom: 20px;
        background-color: rgba(0, 0, 0, 0.9);
        z-index: 1000;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: center;
        border-radius: 15px;
        padding: 15px;
        opacity: 0;
        transform: scale(0.95);
        transition: opacity 0.3s ease, transform 0.3s ease;
        cursor: pointer;
      `,
    });

    const img = createElement('img', {
      src: `data:image/jpeg;base64,${analysisData.photo}`,
      style: `
        max-width: 100%;
        max-height: 80%;
        object-fit: contain;
        border-radius: 10px;
        margin-bottom: 10px;
      `,
    });

    // Информация о классификации
    let infoContainer = createElement('div');
    if (analysisData.classification) {
      infoContainer.style.cssText = `
        background-color: rgba(0, 0, 0, 0.7);
        color: white;
        padding: 10px 15px;
        border-radius: 10px;
        font-size: 16px;
        text-align: center;
        margin-bottom: 10px;
        width: 90%;
      `;
      infoContainer.innerHTML = `<strong>Определено:</strong> ${analysisData.classification.classNameRu} (уверенность: ${analysisData.classification.confidence}%)`;
    }

    // Дата фотографии
    const dateCaption = createElement('div', {
      style: `
        color: white;
        font-size: 14px;
        padding: 5px;
        background-color: rgba(0, 0, 0, 0.5);
        border-radius: 5px;
      `,
    }, formatHistoryDate(analysisData.timestamp));

    photoPreview.addEventListener('click', () => this.closePhotoPreview());

    photoPreview.appendChild(img);
    if (analysisData.classification) {
      photoPreview.appendChild(infoContainer);
    }
    photoPreview.appendChild(dateCaption);

    document.body.appendChild(photoPreview);

    // Анимация появления
    setTimeout(() => {
      photoPreview.style.opacity = '1';
      photoPreview.style.transform = 'scale(1)';
    }, 10);

    this.currentPreview = photoPreview;
  }

  /**
   * Закрытие предпросмотра фотографии
   */
  private closePhotoPreview(): void {
    const photoPreview = getElement('#photo-preview-container');
    if (!photoPreview) return;

    logger.info('Closing photo preview');

    photoPreview.style.opacity = '0';
    photoPreview.style.transform = 'scale(0.95)';

    setTimeout(() => {
      if (photoPreview.parentNode) {
        photoPreview.parentNode.removeChild(photoPreview);
      }
    }, 300);

    this.currentPreview = null;
  }

  /**
   * Закрытие текущего предпросмотра
   */
  private closePreview(): void {
    if (this.currentPreview) {
      if (this.currentPreview.parentNode) {
        this.currentPreview.parentNode.removeChild(this.currentPreview);
      }
      this.currentPreview = null;
      
      // Очищаем текущее изображение в менеджере камеры
      cameraManager.clearCurrentImage();
    }
  }

  /**
   * Обновление отображения истории
   */
  updateHistoryDisplay(): void {
    logger.debug('Updating history display');

    const history = historyManager.getAllItems();

    this.elements.historyCells.forEach((cell, index) => {
      const data = history[index];
      
      // Очищаем содержимое ячейки
      const contentDiv = cell.querySelector('.history-cell-content') as HTMLElement;
      if (!contentDiv) return;

      contentDiv.innerHTML = '';
      cell.className = 'history-cell';
      cell.onclick = null;

      if (data && !data.isEmpty) {
        // Заполненная ячейка
        cell.classList.add(CSS_CLASSES.FILLED);
        
        // Устанавливаем фоновое изображение
        if (data.photo) {
          cell.style.backgroundImage = `url(data:image/jpeg;base64,${data.photo})`;
        }

        // Добавляем подпись с датой
        const caption = createElement('div', {
          class: 'history-cell-caption',
        }, formatHistoryDate(data.timestamp));

        contentDiv.appendChild(caption);

        // Добавляем обработчики долгого нажатия для удаления
        this.addLongPressHandlers(cell, index);

        // Обработчик клика для просмотра (будет переопределен в addLongPressHandlers)
        cell.onclick = () => this.showSavedAnalysis(data);
      } else {
        // Пустая ячейка
        cell.style.backgroundImage = '';
        
        // Добавляем кнопку "+"
        const addButton = createElement('div', {
          class: 'add-analysis',
        });
        addButton.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14"></path>
          </svg>
        `;
        
        contentDiv.appendChild(addButton);

        // Обработчик клика для создания нового анализа
        cell.onclick = () => this.handleHistoryCellClick(index);
      }
    });
  }

  /**
   * Показ сообщения об ошибке
   */
  private showError(message: string): void {
    logger.error('Displaying error to user', { message });

    // Используем Telegram alert если доступен
    authManager.showAlert(message);

    // Также создаем временный элемент для отображения ошибки
    const errorElement = createElement('div', {
      class: CSS_CLASSES.ERROR,
      style: `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        padding: 20px;
        z-index: 9999;
        background-color: ${THEME_COLORS.ERROR};
        color: white;
        border-radius: 10px;
        font-size: 16px;
        max-width: 80%;
        text-align: center;
      `,
    }, message);

    document.body.appendChild(errorElement);

    // Удаляем элемент через 3 секунды
    setTimeout(() => {
      if (errorElement.parentNode) {
        errorElement.parentNode.removeChild(errorElement);
      }
    }, 3000);
  }

  /**
   * Инициализация UI
   */
  init(): void {
    logger.info('Initializing UI Manager');
    
    // Применяем цвет фона
    this.ensureBackgroundColor();
    
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
      Удалить
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
        }

        .delete-history-btn:hover {
          background: rgba(244, 67, 54, 1) !important;
          transform: translateX(-50%) scale(1.05) !important;
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
      this.showError('Ошибка при удалении элемента');
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
   * Показывает диалог подтверждения через Telegram API
   */
  private async showConfirmDialog(message: string): Promise<boolean> {
    try {
      if (window.Telegram?.WebApp?.showConfirm) {
        return new Promise((resolve) => {
          window.Telegram!.WebApp.showConfirm(message, resolve);
        });
      } else {
        // Fallback на стандартный confirm
        return confirm(message);
      }
    } catch (error) {
      logger.warn('Failed to show Telegram confirm dialog, using fallback', error);
      return confirm(message);
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
