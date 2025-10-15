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
import type { ShareConfig } from '@/types/sharing';
import { analysisLikesService } from './analysis/AnalysisLikesService';

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

  // Текущее состояние лайка
  private currentLikeState: {
    isLiked: boolean;
    likesCount: number;
  } = {
    isLiked: false,
    likesCount: 0,
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
    logger.info('Starting analysis with theme', { themeDescription });

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
    logger.info('Photo captured, showing analysis screen with theme selection', {
      hasImageData: !!imageData,
      imageSize: imageData ? Math.round(imageData.originalSize / 1024) + 'KB' : 'unknown'
    });

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

      logger.info('Theme selection displayed');
    } else {
      // Показываем загрузку (для случаев когда тема уже выбрана)
      themeSelection.classList.add('hidden');
      resultContainer.classList.add('hidden');
      loadingIndicator.classList.remove('hidden');


      logger.info('Loading indicator displayed');
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

        // Показываем единый экран анализа с выбором темы
        this.showFullscreenPreview(result.image.base64, true);

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
   * Обработчик изменения состояния анализа
   */
  private handleAnalysisStateChange(event: CustomEvent): void {
    const state = event.detail;
    logger.info('Analysis state changed in UI', state);

    // Обрабатываем состояние ошибки
    if (state.status === 'error' && state.error) {
      logger.warn('Analysis error occurred, showing in UI', { error: state.error });
      this.showAnalysisError();
    }
  }

  /**
   * Показать результат анализа
   */
  showAnalysisResult(result: string, historyItemId?: number): void {
    logger.info('Showing analysis result', { historyItemId });

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

    logger.info('Purchase recommendation processed', {
      hasRecommendations: extracted.hasRecommendations,
      recommendationsHtmlLength: extracted.recommendationsHtml?.length || 0
    });

    // Скрываем загрузку, показываем результат
    loadingIndicator.classList.add('hidden');
    resultContainer.classList.remove('hidden');

    // Парсим текст на блоки для каскадной анимации
    const textBlocks = this.parseAnalysisText(extracted.cleanAnalysis);

    logger.info('Parsed text blocks', {
      totalBlocks: textBlocks.length,
      blocks: textBlocks.map((block, index) => ({
        blockIndex: index + 1,
        delay: block.delay,
        contentLength: block.content.length,
        contentPreview: block.content.substring(0, 100) + (block.content.length > 100 ? '...' : '')
      }))
    });

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

    // Загружаем статус лайка если есть historyItemId
    if (historyItemId) {
      this.loadLikeStatus(historyItemId);
    }

    logger.info('Analysis result displayed with cascade animation', {
      blocksCount: textBlocks.length,
      blocksHtml: blocksHtml.substring(0, 200) + '...',
      hasRecommendationButton: !!this.currentLamodaUrl,
      historyItemId
    });
  }

  /**
   * Загрузить статус лайка для анализа
   */
  private async loadLikeStatus(historyItemId: number): Promise<void> {
    try {
      const status = await analysisLikesService.getLikeStatus(historyItemId);
      
      // Обновляем локальное состояние
      this.currentLikeState.isLiked = status.isLiked;
      this.currentLikeState.likesCount = status.likesCount;

      // Обновляем UI кнопки если она уже существует
      const likeBtn = document.getElementById('like-btn');
      if (likeBtn) {
        this.updateLikeButtonUI(likeBtn, status.isLiked);
      }

      logger.info('Like status loaded', { historyItemId, isLiked: status.isLiked, likesCount: status.likesCount });
    } catch (error) {
      logger.error('Error loading like status', error);
      // Не показываем ошибку пользователю - просто не будет лайка
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

    logger.info('Parsed text blocks', {
      totalBlocks: blocks.length,
      originalParagraphs: paragraphs.length,
      blocks: blocks.map((block, index) => ({
        blockIndex: index + 1,
        delay: block.delay,
        contentLength: block.content.length,
        contentPreview: block.content.substring(0, 80).replace(/\n/g, ' ') + '...'
      }))
    });

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

    // Через 2 секунды открываем ссылку
    setTimeout(() => {
      this.openRecommendationsUrl();
    }, 2000);

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

    // Кнопка закрыть - просто закрывает результат
    const closeBtn = getElement('#close-analysis-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.closePreview();
      });
    }

    // Обработчик кнопки рекомендаций с спиннером
    const recommendationBtn = getElement('#find-recommendations-btn');
    if (recommendationBtn) {
      recommendationBtn.addEventListener('click', () => {
        this.handleRecommendationClick();
      });
    }
  }

  /**
   * Обработчик клика по кнопке лайк
   */
  private async handleLikeClick(): Promise<void> {
    logger.info('=== LIKE BUTTON CLICKED ===');

    const likeBtn = getElement('#like-btn');
    logger.info(`Like button element found: ${!!likeBtn}`);

    if (!likeBtn) {
      logger.error('Like button not found in DOM!');
      return;
    }

    // Проверяем, что элемент видимый и кликабельный
    const rect = likeBtn.getBoundingClientRect();
    logger.info(`Like button position: x=${rect.left}, y=${rect.top}, visible=${rect.width > 0 && rect.height > 0}`);

    // Проверяем наличие historyItemId
    if (!this.currentAnalysisData.historyItemId) {
      logger.warn('No historyItemId available for like');
      return;
    }

    // Переключаем состояние лайка
    const isLiked = this.currentLikeState.isLiked;
    logger.info(`Like button current state: isLiked=${isLiked}`);

    // Находим SVG path элемент
    const svgPath = likeBtn.querySelector('svg path') as SVGPathElement;
    logger.info(`SVG path element found: ${!!svgPath}`);

    if (svgPath) {
      // ЛОГИРУЕМ ТЕКУЩИЕ СТИЛИ ПЕРЕД ИЗМЕНЕНИЯМИ
      const computedStyle = window.getComputedStyle(svgPath);
      logger.info('=== SVG PATH CURRENT STATE ===', {
        tagName: svgPath.tagName,
        id: svgPath.id,
        className: svgPath.className,
        outerHTML: svgPath.outerHTML.substring(0, 200) + '...',
        currentFill: svgPath.getAttribute('fill'),
        currentStroke: svgPath.getAttribute('stroke'),
        computedFill: computedStyle.fill,
        computedStroke: computedStyle.stroke,
        styleFill: svgPath.style.fill,
        styleStroke: svgPath.style.stroke,
        allStyles: svgPath.style.cssText,
        parentClasses: svgPath.parentElement?.parentElement?.className
      });
    }

    try {
      // Отправляем запрос на сервер
      const result = await analysisLikesService.toggleLike(
        this.currentAnalysisData.historyItemId,
        isLiked
      );

      // Обновляем локальное состояние
      this.currentLikeState.isLiked = result.isLiked;
      this.currentLikeState.likesCount = result.likesCount;

      logger.info('Like toggled successfully', result);

      // Обновляем UI
      this.updateLikeButtonUI(likeBtn, result.isLiked);

      // Тактильная обратная связь
      authManager.vibrate('light');

    } catch (error) {
      logger.error('Error toggling like', error);
      // Показываем ошибку пользователю (опционально)
      return;
    }
  }

  /**
   * Обновление UI кнопки лайка
   */
  private updateLikeButtonUI(likeBtn: HTMLElement, isLiked: boolean): void {
    // Находим SVG path элемент
    const svgPath = likeBtn.querySelector('svg path') as SVGPathElement;

    if (isLiked) {
      // Добавляем лайк - заменяем SVG на закрашенное сердце
      likeBtn.classList.add('liked');

      const newSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      newSvg.setAttribute('width', '24');
      newSvg.setAttribute('height', '24');
      newSvg.setAttribute('viewBox', '0 0 24 24');

      const newPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      newPath.setAttribute('d', 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z');
      newPath.setAttribute('fill', '#eb858d');
      newPath.setAttribute('stroke', '#eb858d');
      newPath.setAttribute('stroke-width', '3');

      newSvg.appendChild(newPath);
      const svgElement = svgPath?.parentElement;
      if (svgElement && svgElement.parentElement) {
        svgElement.parentElement.replaceChild(newSvg, svgElement);
      }

      logger.info('Like added - SVG updated to filled heart');

    } else {
      // Убираем лайк - заменяем SVG на пустое сердце
      likeBtn.classList.remove('liked');

      const newSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      newSvg.setAttribute('width', '24');
      newSvg.setAttribute('height', '24');
      newSvg.setAttribute('viewBox', '0 0 24 24');

      const newPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      newPath.setAttribute('d', 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z');
      newPath.setAttribute('fill', 'none');
      newPath.setAttribute('stroke', '#eb858d');
      newPath.setAttribute('stroke-width', '3');

      newSvg.appendChild(newPath);
      const svgElement = svgPath?.parentElement;
      if (svgElement && svgElement.parentElement) {
        svgElement.parentElement.replaceChild(newSvg, svgElement);
      }

      logger.info('Like removed - SVG updated to empty heart');
    }

    // Анимация нажатия
    likeBtn.style.transform = 'scale(0.8)';
    setTimeout(() => {
      likeBtn.style.transform = 'scale(1)';
    }, 150);
  }

  /**
   * Поделиться результатом анализа
   */
  private async shareAnalysisImage(): Promise<void> {
    try {
      if (!this.currentAnalysisData.imageSrc || !this.currentAnalysisData.analysisText) {
        logger.warn('No analysis data available for sharing');
        return;
      }

      // 1. Используем оригинальное фото без обработки (как с капсулой!)
      // Текст пойдет в description, изображение в оригинальном качестве
      
      // 2. Конфигурация для sharing
      const shareConfig: ShareConfig = {
        type: 'analysis',
        image: this.currentAnalysisData.imageSrc,  // Оригинальное фото!
        text: this.currentAnalysisData.analysisText,  // Текст отдельно
        title: '🤖 AI Анализ стиля',
        metadata: {
          historyItemId: this.currentAnalysisData.historyItemId  // Для лайков
        }
      };

      // 3. Делимся через универсальный SharingService
      const result = await sharingService.share(shareConfig, {
        includeImage: true,
        includeLink: true,
        saveToServer: true
      });

      if (result.success) {
        logger.info('Analysis shared successfully', { method: result.method });
      } else {
        logger.error('Failed to share analysis', { error: result.error });
      }

    } catch (error) {
      logger.error('Share analysis error', error);
    }
  }

  /**
   * Обработчик клика по кнопке поделиться
   */
  private handleShareClick(): void {
    logger.info('Share button clicked');

    const shareBtn = getElement('#share-btn');
    if (shareBtn) {
      // Переключаем состояние поделиться
      const isShared = shareBtn.classList.contains('shared');

      if (isShared) {
        // Убираем состояние "поделился"
        shareBtn.classList.remove('shared');
        logger.info('Share state removed');
      } else {
        // Добавляем состояние "поделился"
        shareBtn.classList.add('shared');
        logger.info('Share state added');

        // Выполняем действие поделиться - отправляем фотографию разбора
        this.shareAnalysisImage().catch((error) => {
          logger.warn('Failed to share analysis image', error);
        });

        // Анимация нажатия
        shareBtn.style.transform = 'scale(0.8)';
        setTimeout(() => {
          shareBtn.style.transform = 'scale(1)';
        }, 150);
      }
    }

    // Тактильная обратная связь
    authManager.vibrate('light');
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
  }

  /**
   * Логирование ошибки без отображения пользователю
   */
  private logError(message: string): void {
    logger.error('Silent error handling', { message });
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
    logger.info('Destroying Analysis UI Manager');

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
