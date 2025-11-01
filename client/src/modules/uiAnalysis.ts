/**
 * Модуль для управления UI анализа изображений
 * Камера, выбор темы, экран анализа, результаты, рекомендации
 */

import type {
  ImageData,
  FashionTheme,
  TelegramWebApp,
} from '@/types/index';
import {
  FASHION_THEMES
} from '@/utils/constants';
import {
  getElement,
  createElement,
} from '@/utils/helpers';
import { logger } from './logger';
import { authManager } from './auth';
import { purchaseRecommendationManager } from './purchaseRecommendation';
import { cameraManager } from './camera';
import { sharingService } from './shared/SharingService';
import { analysisLikesService } from './analysis/AnalysisLikesService';
import { historyManager } from './history';
import { uiMenuManager } from './uiMenu';
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
 * Фразы для анимации текста загрузки
 */
const LOADING_PHRASES = [
  'Сканируем одежду ...',
  'Определяем типы вещей и фасоны ...',
  'Находим элементы гардероба ...',
  'Анализируем стиль и настроение ...',
  'Изучаем цвета, оттенки и материалы ...',
  'Сравниваем с актуальными трендами ...',
  'Подбираем аксессуары и акценты ...',
  'Уточняем детали ...',
  'Определяем тренды ...',
  'Генерируем рекомендации ...',
  'Почти готово ...',
  'Еще немного ...'
];

/**
 * Управление анимацией текста загрузки
 */
class LoadingTextAnimator {
  private phrases: string[] = LOADING_PHRASES;
  private currentIndex: number = 0;
  private intervalId: number | null = null;
  private textElement: HTMLElement | null = null;

  constructor() {
    this.textElement = getElement('.loading-text');
  }

  start(): void {
    if (!this.textElement) return;

    this.currentIndex = 0;
    this.updateText();

    // Меняем фразу каждые 3.5 секунды
    this.intervalId = window.setInterval(() => {
      this.currentIndex = (this.currentIndex + 1) % this.phrases.length;
      this.updateText();
    }, 3500);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Возвращаем исходный текст
    if (this.textElement) {
      this.textElement.textContent = 'Анализируем вашу одежду...';
    }
  }

  // Алиас для совместимости
  stopAndReset(): void {
    this.stop();
  }

  private updateText(): void {
    if (this.textElement) {
      this.textElement.textContent = this.phrases[this.currentIndex] || '';
    }
  }
}

// Создаем глобальный экземпляр аниматора
const loadingTextAnimator = new LoadingTextAnimator();

/**
 * Класс для управления UI анализа и камеры
 */
export class UIAnalysisManager {
  private cleanupFunctions: (() => void)[] = [];

  // Текущие данные анализа для отправки
  private currentAnalysisData: {
    imageSrc: string | null;
    analysisText: string | null;
    historyItemId: number | null;
  } = {
    imageSrc: null,
    analysisText: null,
    historyItemId: null,
  };

  // Ссылка на Lamoda для текущей рекомендации
  private currentLamodaUrl: string | null = null;

  // Текущее изображение для выбора темы
  private currentThemeImage: ImageData | null = null;

  constructor() {
    // Обработчик изменения состояния анализа
    window.addEventListener('analysisStateChange', this.handleAnalysisStateChange.bind(this) as EventListener);
  }


  /**
   * Обработчик выбора темы
   */
  private selectTheme(themeId: FashionTheme): void {
    logger.info('Theme selected', { themeId });

    if (!this.currentThemeImage) {
      logger.error('No current image for theme selection');
      return;
    }

    // Находим описание темы
    const selectedTheme = FASHION_THEMES.find(theme => theme.id === themeId);
    const themeDescription = selectedTheme ? selectedTheme.description : 'Неизвестная тема';

    // Скрываем секцию выбора темы с анимацией
    const themeSelection = getElement('#analysis-theme-selection');
    const loadingIndicator = getElement('#analysis-loading');
    const resultContainer = getElement('#analysis-result-container');

    if (themeSelection && loadingIndicator && resultContainer) {
      // Добавляем анимацию скрытия к карточкам тем
      const themeCards = themeSelection.querySelectorAll('.theme-card');
      themeCards.forEach((card, index) => {
        // Добавляем задержку для каскадного эффекта
        setTimeout(() => {
          card.classList.add('fade-out');
        }, index * 50); // 50ms задержка между карточками
      });

      // Анимируем скрытие выбора темы с плавной анимацией
      themeSelection.classList.add('theme-selection-fade-out');

      // Через время анимации скрываем контейнер полностью и показываем загрузку
      setTimeout(() => {
        themeSelection.classList.add('hidden');
        themeSelection.classList.remove('theme-selection-fade-out');

        // Очищаем классы анимации от карточек
        const themeCards = themeSelection.querySelectorAll('.theme-card');
        themeCards.forEach(card => {
          card.classList.remove('fade-out');
        });

        // Показываем нижнюю секцию обратно
        const bottomSection = getElement('.analysis-bottom-section');
        if (bottomSection) {
          bottomSection.style.display = '';
        }

        resultContainer.classList.add('hidden');
        loadingIndicator.classList.remove('hidden');

        

        // Запускаем анализ
        if (this.currentThemeImage) {
          this.showAnalysisWithTheme(this.currentThemeImage, themeDescription);
        } else {
          logger.error('No current theme image available for analysis');
        }
      }, 400); // Время соответствует длительности анимации themeSelectionFadeOut

      // Запускаем анимацию текста загрузки
      loadingTextAnimator.start();
    }

    logger.info('Theme selection hidden, starting analysis');
  }

  /**
   * Показать экран анализа с выбранной темой
   */
  private async showAnalysisWithTheme(imageData: ImageData, themeDescription: string): Promise<void> {
    try {
      // Импортируем менеджер анализа динамически
      const { analysisManager } = await import('./analysis.js');

      // Показываем экран анализа
      this.showFullscreenPreview(imageData.base64);

      // Запускаем анализ с темой
      await analysisManager.analyzeImage(imageData.base64, themeDescription);

    } catch (error) {
      logger.error('Error starting analysis with theme', error);
    }
  }

  /**
   * Обработчик захвата фото - показывает экран анализа с выбором темы
   */
  handlePhotoCaptured(event: CustomEvent): void {
    const { imageData } = event.detail;

    if (imageData) {
      this.currentThemeImage = imageData;
      this.showFullscreenPreview(imageData.base64, true); // true = показать выбор темы
    }
  }

  /**
   * Создать карточки тем для выбора
   */
  private createThemeCards(container: HTMLElement): void {
    FASHION_THEMES.forEach((theme, index) => {
      const themeCard = createElement('div');
      themeCard.className = 'theme-card theme-card-animated';
      themeCard.dataset['theme'] = String(theme.id);

      themeCard.innerHTML = `
        <div class="theme-emoji">${theme.emoji}</div>
        <div class="theme-name">${theme.name}</div>
        <div class="theme-description">${theme.description}</div>
      `;

      // Добавляем обработчик клика
      themeCard.addEventListener('click', () => {
        this.selectTheme(theme.id as FashionTheme);
      });

      container.appendChild(themeCard);

      // Добавляем каскадную анимацию с задержкой
      setTimeout(() => {
        themeCard.classList.add('theme-card-bounce');
        themeCard.style.animationDelay = `${index * 0.1}s`;
      }, 50); // Небольшая задержка перед началом анимации
    });

    logger.info('Theme cards created', { count: FASHION_THEMES.length });
  }

  /**
   * Показать экран анализа
   */
  showFullscreenPreview(imageBase64: string, showThemeSelection: boolean = false): void {
    logger.info('Showing analysis screen', { showThemeSelection });

    // Получаем элементы экрана анализа
    const analysisScreen = getElement('#analysis-screen');
    const analysisPhoto = getElement('#analysis-photo') as HTMLImageElement;
    const themeSelection = getElement('#analysis-theme-selection');
    const themeGrid = getElement('#analysis-theme-grid');
    const loadingIndicator = getElement('#analysis-loading');
    const resultContainer = getElement('#analysis-result-container');

    if (!analysisScreen || !analysisPhoto || !themeSelection || !themeGrid || !loadingIndicator || !resultContainer) {
      logger.error('Analysis screen elements not found');
      return;
    }

    // Устанавливаем фото
    analysisPhoto.src = `data:image/jpeg;base64,${imageBase64}`;

    // Сохраняем данные для отправки (оригинальное изображение)
    this.currentAnalysisData.imageSrc = `data:image/jpeg;base64,${imageBase64}`;

    if (showThemeSelection) {
      // Показываем выбор темы
      themeGrid.innerHTML = '';
      this.createThemeCards(themeGrid);

      // Скрываем загрузку и результат, показываем выбор темы
      resultContainer.classList.add('hidden');
      loadingIndicator.classList.add('hidden');
      themeSelection.classList.remove('hidden');

      // Скрываем нижнюю секцию полностью, чтобы не блокировала клики
      const bottomSection = getElement('.analysis-bottom-section');
      if (bottomSection) {
        bottomSection.style.display = 'none';
      }
    } else {
      // Показываем загрузку (для случаев когда тема уже выбрана)
      themeSelection.classList.add('hidden');
      resultContainer.classList.add('hidden');
      loadingIndicator.classList.remove('hidden');
    }

    // Показываем экран анализа
    analysisScreen.classList.remove('hidden');

    logger.info('Analysis screen displayed');
  }

  /**
   * Обработчик клика по кнопке камеры
   */
  async handleCameraButtonClick(event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    try {
      // Захватываем фото с выбором источника
      const result = await cameraManager.capturePhoto();

      if (result.success && result.image) {
        // Показ экрана анализа будет через событие photo:captured (избегаем дубликатов)
        // this.showFullscreenPreview() вызовется в handlePhotoCaptured()

        // Вибрация успеха
        authManager.vibrate('light');
      } else {
        logger.error(result.error || 'Не удалось сделать фото');
      }
    } catch (error) {
      logger.error('Error capturing photo', error);
    }
  }

  /**
   * Обработчик изменения состояния анализа
   */
  private handleAnalysisStateChange(event: CustomEvent): void {
    const state = event.detail;

    // Обрабатываем состояние ошибки
    if (state.status === 'error' && state.error) {
      logger.error('Analysis error occurred, showing in UI', { error: state.error });
      this.showAnalysisError();
    }
  }

  /**
   * Показать результат анализа
   */
  showAnalysisResult(result: string, historyItemId?: number): void {

    // Сохраняем historyItemId если передан
    if (historyItemId) {
      this.currentAnalysisData.historyItemId = historyItemId;
    }

    // Останавливаем анимацию текста загрузки
    loadingTextAnimator.stop();

    const loadingIndicator = getElement('#analysis-loading');
    const resultContainer = getElement('#analysis-result-container');
    const analysisText = getElement('#analysis-text');

    if (!loadingIndicator || !resultContainer || !analysisText) {
      logger.error('Analysis result elements not found');
      return;
    }

    // Обрабатываем ответ и извлекаем рекомендации
    const extracted = purchaseRecommendationManager.extractPurchaseRecommendation(result);

    // Сохраняем ссылку на Lamoda для использования в кнопках (для обратной совместимости)
    this.currentLamodaUrl = extracted.lamodaUrl;

    // Сохраняем текст анализа для отправки
    this.currentAnalysisData.analysisText = extracted.cleanAnalysis;

    // Скрываем загрузку, показываем результат
    loadingIndicator.classList.add('hidden');
    resultContainer.classList.remove('hidden');

    // Парсим текст на блоки для каскадной анимации
    const textBlocks = this.parseAnalysisText(extracted.cleanAnalysis);

    // Создаем HTML для блоков с анимацией
    const blocksHtml = textBlocks.map((block, index) =>
      `<div class="analysis-block analysis-block-${index + 1}" style="animation-delay: ${block.delay}s">${block.content}</div>`
    ).join('');

    // Добавляем блок рекомендаций с ссылками, если они есть
    const recommendationsBlock = extracted.recommendationsHtml 
      ? `<div class="analysis-block" style="animation-delay: ${textBlocks.length * 0.8}s">${extracted.recommendationsHtml}</div>`
      : '';

    analysisText.innerHTML = blocksHtml + recommendationsBlock;

    // Настраиваем обработчики для ссылок-рекомендаций
    this.setupRecommendationLinks();

    // Настраиваем обработчики кнопок
    this.setupResultButtons();

    // Интегрируем новые компоненты лайков и sharing
    if (historyItemId) {
      const resultActions = getElement('.result-actions');
      if (resultActions) {
        // Удаляем старые компоненты для экрана результата, если они существуют, чтобы избежать дублирования
        const existingResultLikeComponent = resultActions.querySelector('.result-like-btn');
        if (existingResultLikeComponent) {
          existingResultLikeComponent.parentElement?.remove();
        }

        const existingResultShareComponent = resultActions.querySelector('.result-share-btn');
        if (existingResultShareComponent) {
          existingResultShareComponent.parentElement?.remove();
        }

        const historyItem = historyManager.getItemById(historyItemId);
        if (historyItem) {
          // Создаем компонент лайков
          analysisLikesService.createLikeComponent(
            resultActions,
            historyItemId,
            { isLiked: !!historyItem.isLiked, likesCount: historyItem.likesCount || 0 },
            'result' // Добавляем класс для экрана результата
          );

          // Создаем кнопку share в результатах
          sharingService.createShareButton(
            resultActions,
            {
              type: 'analysis',
              image: this.currentAnalysisData.imageSrc || '',
              text: this.currentAnalysisData.analysisText || '',
              title: '🤖 AI Анализ стиля',
              metadata: {
                historyItemId: historyItemId
              }
            },
            'result' // Добавляем класс для экрана результата
          );
        }
      }
    }
  }

  /**
   * Парсит текст анализа на блоки для каскадной анимации
   */
  private parseAnalysisText(text: string): Array<{content: string, delay: number}> {
    const blocks: Array<{content: string, delay: number}> = [];

    // Разбиваем текст на блоки по двойным переносам строк (абзацам)
    const paragraphs = text.split('\n\n').filter(p => p.trim().length > 0);

    if (paragraphs.length > 1) {
      // Если есть несколько абзацев, показываем их каскадом
      paragraphs.forEach((paragraph, index) => {
        blocks.push({
          content: this.processMarkdown(paragraph.trim()),
          delay: index * 0.8 // 0, 0.8, 1.6, 2.4, ...
        });
      });
    } else {
      // Если абзацев нет, разбиваем на предложения
      const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);

      if (sentences.length > 1) {
        // Группируем предложения в блоки по 2-3 предложения
        const blockSize = Math.max(2, Math.ceil(sentences.length / 3));

        for (let i = 0; i < sentences.length; i += blockSize) {
          const blockSentences = sentences.slice(i, i + blockSize);
          const blockContent = blockSentences.join('. ').trim();

          if (blockContent.length > 0) {
            // Добавляем точку в конце, если её нет
            const finalContent = blockContent + (blockContent.match(/[.!?]$/) ? '' : '.');

            blocks.push({
              content: this.processMarkdown(finalContent),
              delay: (i / blockSize) * 0.8
            });
          }
        }
      } else {
        // Если даже предложений нет, показываем весь текст как один блок
        blocks.push({
          content: this.processMarkdown(text),
          delay: 0
        });
      }
    }

    return blocks;
  }

  /**
   * Обрабатывает markdown в тексте (жирный текст)
   */
  private processMarkdown(text: string): string {
    let processed = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Обрабатываем @"текст_поиска" отображаемый_текст@ для создания ссылок на Lamoda (с опциональным пробелом после @)
    processed = processed.replace(/@\s*"([^"]+)"\s*([^@]+)@/g, (_, searchText, displayText) => {
      // Кодируем текст поиска для URL
      const encodedText = encodeURIComponent(searchText.trim());
      // Создаем ссылку на Lamoda
      const lamodaUrl = `https://www.lamoda.ru/catalogsearch/result/?q=${encodedText}&gender_section=men`;
      // Возвращаем выделенный подчеркнутый текст со ссылкой и inline стилями для гарантии
      return `<a href="${lamodaUrl}" target="_blank" rel="noopener noreferrer" class="lamoda-link" style="color: #ff6b6b !important; text-decoration: none !important; font-weight: 600 !important; padding: 2px 4px !important; border-radius: 4px !important; transition: all 0.3s ease !important; background: rgba(255, 107, 107, 0.1) !important;">${displayText.trim()}</a>`;
    });

    return processed;
  }

  /**
   * Обработчик клика по кнопке рекомендаций с спиннером
   */
  private handleRecommendationClick(): void {
    const button = getElement('#find-recommendations-btn');
    const buttonContainer = getElement('.recommendation-button-container');

    if (!button || !buttonContainer || !this.currentLamodaUrl) {
      return;
    }

    // Меняем текст кнопки на спиннер
    button.innerHTML = `
      <div class="recommendation-spinner"></div>
      <span>Ищем рекомендации...</span>
    `;
    (button as HTMLButtonElement).disabled = true;

    // Через 0.5 секунды открываем ссылку
    setTimeout(() => {
      this.openRecommendationsUrl();
    }, 500);

    logger.info('Recommendation button clicked, showing spinner');
  }

  /**
   * Открыть ссылку на Lamoda в новой вкладке
   */
  private openRecommendationsUrl(): void {
    if (this.currentLamodaUrl) {
      // Используем Telegram WebApp API для открытия внешней ссылки
      if (window.Telegram?.WebApp?.openLink) {
        window.Telegram.WebApp.openLink(this.currentLamodaUrl);
      } else {
        // Fallback на обычное открытие в новой вкладке
        window.open(this.currentLamodaUrl, '_blank');
      }

      // Восстанавливаем кнопку через небольшую задержку
      setTimeout(() => {
        this.resetRecommendationButton();
      }, 1000);

      logger.info('Lamoda URL opened', { url: this.currentLamodaUrl });
    }
  }

  /**
   * Сброс кнопки рекомендаций к исходному состоянию
   */
  private resetRecommendationButton(): void {
    const button = getElement('#find-recommendations-btn');
    if (button) {
      button.innerHTML = 'Найти рекомендации';
      (button as HTMLButtonElement).disabled = false;
      logger.info('Recommendation button reset to original state');
    }
  }

  /**
   * Настройка обработчиков для ссылок-рекомендаций
   */
  private setupRecommendationLinks(): void {
    const recommendationLinks = document.querySelectorAll('.recommendation-link');
    
    recommendationLinks.forEach(link => {
      link.addEventListener('click', (event: Event) => {
        event.preventDefault();
        
        const href = (link as HTMLAnchorElement).href;
        
        if (href) {
          // Используем Telegram WebApp API для открытия внешних ссылок
          if (window.Telegram?.WebApp?.openLink) {
            window.Telegram.WebApp.openLink(href);
            logger.info('Recommendation link opened via Telegram', { href });
          } else {
            // Fallback на обычное открытие в новой вкладке
            window.open(href, '_blank');
            logger.info('Recommendation link opened in new tab', { href });
          }
        }
      });
    });
    
    logger.info('Recommendation links handlers setup', { count: recommendationLinks.length });
  }

  /**
   * Настройка обработчиков кнопок в результате анализа
   * Share-кнопка теперь создается через sharingService.createShareButton()
   */
  private setupResultButtons(): void {
    // Кнопка закрыть
    const closeBtn = getElement('#close-analysis-btn');
    if (closeBtn) {
      const clonedCloseBtn = closeBtn.cloneNode(true) as HTMLElement;
      closeBtn.replaceWith(clonedCloseBtn);
      clonedCloseBtn.addEventListener('click', () => {
        this.closePreview();
      });
    }

    // Обработчик кнопки рекомендаций с спиннером
    const recommendationBtn = getElement('#find-recommendations-btn');
    if (recommendationBtn) {
      const clonedRecommendationBtn = recommendationBtn.cloneNode(true) as HTMLElement;
      recommendationBtn.replaceWith(clonedRecommendationBtn);
      clonedRecommendationBtn.addEventListener('click', () => {
        this.handleRecommendationClick();
      });
    }
  }

  /**
   * Очистить все динамические кнопки с экрана результата анализа
   */
  private clearAnalysisResultButtons(): void {
    const actionsContainer = getElement('.result-actions');
    if (!actionsContainer) {
      return;
    }

    // Список всех возможных селекторов для динамических кнопок анализа
    const buttonSelectors = [
      // Like кнопки с разными префиксами
      '.result-like-btn',
      '.analysis-like-btn',
      '.shared-analysis-like-btn',
      
      // Share кнопки с разными префиксами
      '.result-share-btn',
      '.analysis-share-btn',
      '.shared-analysis-share-btn',
      
      // Контейнеры кнопок
      '.like-container',
      '.share-container'
    ];

    // Удаляем все найденные кнопки
    let removedCount = 0;
    buttonSelectors.forEach(selector => {
      const elements = actionsContainer.querySelectorAll(selector);
      elements.forEach(element => {
        // Удаляем родительский контейнер если он есть, иначе сам элемент
        const container = element.closest('.like-container, .share-container');
        if (container) {
          container.remove();
        } else {
          element.remove();
        }
        removedCount++;
      });
    });

    if (removedCount > 0) {
      logger.info('Cleared dynamic buttons from analysis screen', { removedCount });
    }
  }

  /**
   * Закрытие экрана анализа
   */
  private async closePreview(): Promise<void> {
    // Очищаем все динамические кнопки перед закрытием
    this.clearAnalysisResultButtons();
    
    // Закрываем экран анализа
    const analysisScreen = getElement('#analysis-screen');
    if (analysisScreen) {
      analysisScreen.classList.add('hidden');
    }

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
        // Обновляем UI вручную с сохранением позиции
        uiMenuManager.updateHistoryDisplay({ preservePosition: true });
      }
    } catch (error) {
      logger.error('Failed to update history from server', { error });
      // Если загрузка с сервера не удалась, обновляем UI вручную
      uiMenuManager.updateHistoryDisplay();
    }
  }

  /**
   * Синхронизация метаданных истории (лайки, просмотры) без загрузки фото
   * #OPTIMIZATION #METADATA-SYNC
   */
  private async syncHistoryMetadata(): Promise<void> {
    try {
      const initData = window.Telegram?.WebApp?.initData || '';
      
      if (!initData) {
        logger.error('No initData available for metadata sync');
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
   * Получить текущие данные анализа
   */
  getCurrentAnalysisData() {
    return this.currentAnalysisData;
  }

  /**
   * Установить текущую ссылку на Lamoda
   */
  setCurrentLamodaUrl(url: string | null): void {
    this.currentLamodaUrl = url;
  }

  /**
   * Получить текущее изображение для выбора темы
   */
  getCurrentThemeImage(): ImageData | null {
    return this.currentThemeImage;
  }

  /**
   * Получить текущую ссылку на Lamoda
   */
  getCurrentLamodaUrl(): string | null {
    return this.currentLamodaUrl;
  }

  /**
   * Инициализация
   */
  init(): void {
  }

  /**
   * Очистка ресурсов
   */
  destroy(): void {
    // Останавливаем анимацию загрузки
    loadingTextAnimator.stop();

    // Очищаем обработчики событий
    this.cleanupFunctions.forEach(cleanup => cleanup());
    this.cleanupFunctions = [];
    logger.info('Analysis UI Manager destroyed');
  }

  /**
   * Закрытие экрана анализа (публичный метод для обработки ошибок)
   */
  closeAnalysisScreen(): void {
    this.closePreview();
  }

  /**
   * Показать ошибку анализа вместо результата
   */
  showAnalysisError(): void {
    logger.info('Showing analysis error');

    // Останавливаем анимацию текста загрузки
    loadingTextAnimator.stop();

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

    // Показываем сообщение об ошибке
    analysisText.innerHTML = `<div class="analysis-error">Возникла ошибка при анализе вашей одежды. Попробуйте снова. Пожалуйста, проверьте ваше соединение с интернетом.</div>`;

    // Настраиваем обработчики кнопок (даже при ошибке кнопки должны работать)
    this.setupResultButtons();
  }
}

// Создаем глобальный экземпляр менеджера анализа
export const uiAnalysisManager = new UIAnalysisManager();

// Импортируем необходимые зависимости для обратной совместимости

// Глобальные переменные для обратной совместимости
declare global {
  var loadingTextAnimator: any;
}

// Инициализируем глобальные переменные
globalThis.loadingTextAnimator = loadingTextAnimator;
