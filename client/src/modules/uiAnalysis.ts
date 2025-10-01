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
  } = {
    imageSrc: null,
    analysisText: null,
  };

  // Ссылка на Lamoda для текущей рекомендации
  private currentLamodaUrl: string | null = null;

  // Текущее изображение для выбора темы
  private currentThemeImage: ImageData | null = null;

  constructor() {}


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
      // Анимируем скрытие выбора темы с плавной анимацией
      themeSelection.classList.add('theme-selection-fade-out');

      // Через время анимации скрываем контейнер полностью и показываем загрузку
      setTimeout(() => {
        themeSelection.classList.add('hidden');
        themeSelection.classList.remove('theme-selection-fade-out');

        resultContainer.classList.add('hidden');
        loadingIndicator.classList.remove('hidden');

        // Запускаем анимацию текста загрузки
        loadingTextAnimator.start();

        // Запускаем анализ
        if (this.currentThemeImage) {
          this.showAnalysisWithTheme(this.currentThemeImage, themeDescription);
        } else {
          logger.error('No current theme image available for analysis');
        }
      }, 400); // Время соответствует длительности анимации themeSelectionFadeOut
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

      logger.info('Theme selection displayed');
    } else {
      // Показываем загрузку (для случаев когда тема уже выбрана)
      themeSelection.classList.add('hidden');
      resultContainer.classList.add('hidden');
      loadingIndicator.classList.remove('hidden');

      // Запускаем анимацию текста загрузки
      loadingTextAnimator.start();

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
   * Показать результат анализа
   */
  showAnalysisResult(result: string): void {
    logger.info('Showing analysis result');

    // Останавливаем анимацию текста загрузки
    loadingTextAnimator.stop();

    const loadingIndicator = getElement('#analysis-loading');
    const resultContainer = getElement('#analysis-result-container');
    const analysisText = getElement('#analysis-text');

    if (!loadingIndicator || !resultContainer || !analysisText) {
      logger.error('Analysis result elements not found');
      return;
    }

    // Обрабатываем ответ и извлекаем рекомендацию для покупки
    const extracted = purchaseRecommendationManager.extractPurchaseRecommendation(result);

    // Сохраняем ссылку на Lamoda для использования в кнопках
    this.currentLamodaUrl = extracted.lamodaUrl;

    // Сохраняем текст анализа для отправки
    this.currentAnalysisData.analysisText = extracted.cleanAnalysis;

    logger.info('Purchase recommendation processed', {
      hasRecommendation: !!extracted.purchaseRecommendation,
      hasUrl: !!extracted.lamodaUrl
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

    // Добавляем кнопку рекомендаций в конце (ПОКА ЗАКОММЕНТИРОВАНО)
    // const recommendationButton = this.currentLamodaUrl
    //   ? `<div class="recommendation-button-container">
    //        <button id="find-recommendations-btn" class="recommendation-button">
    //          Найти рекомендации
    //        </button>
    //      </div>`
    //   : '';
    const recommendationButton = ''; // Пока скрываем кнопку рекомендаций

    analysisText.innerHTML = blocksHtml + recommendationButton;

    // Настраиваем обработчики кнопок
    this.setupResultButtons();

    logger.info('Analysis result displayed with cascade animation', {
      blocksCount: textBlocks.length,
      blocksHtml: blocksHtml.substring(0, 200) + '...',
      hasRecommendationButton: !!this.currentLamodaUrl
    });
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
  private handleLikeClick(): void {
    logger.info('Like button clicked');

    const likeBtn = getElement('#like-btn');
    if (likeBtn) {
      // Переключаем состояние лайка
      const isLiked = likeBtn.classList.contains('liked');

      if (isLiked) {
        // Убираем лайк
        likeBtn.classList.remove('liked');
        logger.info('Like removed');
      } else {
        // Добавляем лайк
        likeBtn.classList.add('liked');
        logger.info('Like added');

        // Анимация нажатия
        likeBtn.style.transform = 'scale(0.8)';
        setTimeout(() => {
          likeBtn.style.transform = 'scale(1)';
        }, 150);
      }
    }

    // Тактильная обратная связь
    authManager.vibrate('light');
  }

  /**
   * Создает изображение с результатом анализа для отправки
   */
  private async createAnalysisImageForSharing(): Promise<string | null> {
    if (!this.currentAnalysisData.imageSrc || !this.currentAnalysisData.analysisText) {
      logger.warn('No analysis data available for sharing');
      return null;
    }

    try {
      // Создаем canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        logger.error('Canvas context not available');
        return null;
      }

      // Создаем изображение из base64
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = this.currentAnalysisData.imageSrc!;
      });

      // Устанавливаем размеры canvas (только изображение с подписью) - высокое качество
      const imageWidth = Math.max(800, Math.min(img.width, 1200)); // Минимум 800px, максимум 1200px
      const imageHeight = (img.height * imageWidth) / img.width;
      const padding = 30;

      canvas.width = imageWidth;
      canvas.height = imageHeight + padding * 2;

      // Белый фон
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Рисуем изображение
      ctx.drawImage(img, 0, 0, imageWidth, imageHeight);

      // Добавляем подпись как водяной знак
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillRect(0, imageHeight - 40, imageWidth, 40);

      ctx.fillStyle = '#333333';
      ctx.font = 'bold 32px Manrope, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('@LamodaStylebot', imageWidth - padding, imageHeight - padding);

      // Конвертируем в base64 с высоким качеством
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      logger.info('High quality analysis image created for sharing', {
        width: canvas.width,
        height: canvas.height,
        quality: 0.95
      });
      return dataUrl;

    } catch (error) {
      logger.error('Failed to create analysis image', error);
      return null;
    }
  }

  /**
   * Отправляет результат анализа через Telegram
   */
  private async shareAnalysisImage(): Promise<void> {
    try {
      // Создаем изображение с подписью для отправки
      const analysisImageDataUrl = await this.createAnalysisImageForSharing();

      // Проверяем доступность Telegram WebApp API
      if (window.Telegram?.WebApp?.openTelegramLink) {
        // Создаем ссылку на shared анализ через Mini App
        const analysisId = this.generateAnalysisShareId();
        const shareLink = `https://t.me/${APP_CONFIG.telegramBotName}?startapp=shared_${analysisId}`;

        // Сохраняем данные анализа для sharing
        await this.saveAnalysisForSharing(analysisId);

        // Пытаемся отправить изображение и ссылку через Web Share API
        if (navigator.share && analysisImageDataUrl) {
          try {
            // Конвертируем data URL в Blob
            const response = await fetch(analysisImageDataUrl);
            const blob = await response.blob();
            const file = new File([blob], 'tgstyle-analysis.jpg', { type: 'image/jpeg' });

            // Создаем текст с ссылкой на конкретную shared историю
            let shareText = `Посмотрите мой анализ стиля одежды от TgStyle! 🤖👗\n\n${shareLink}`;
            if (this.currentAnalysisData.analysisText) {
              shareText = `🤖 TgStyle анализ стиля:\n\n${this.currentAnalysisData.analysisText.substring(0, 150)}...\n\nПолный анализ: ${shareLink}`;
            }

            await navigator.share({
              title: 'TgStyle - Анализ стиля',
              text: shareText,
              files: [file]
            });
            logger.info('Analysis image and link shared via Web Share API');
            return;
          } catch (shareError) {
            logger.warn('Web Share API failed, falling back to Telegram sharing', shareError);
          }

        }

        // Fallback - отправляем ссылку на анализ через Telegram
        let analysisText = `Посмотрите мой анализ стиля одежды от TgStyle! 🤖👗\n\n${shareLink}`;
        if (this.currentAnalysisData.analysisText) {
          analysisText = `🤖 TgStyle анализ стиля:\n\n${this.currentAnalysisData.analysisText.substring(0, 150)}...\n\nПолный анализ: ${shareLink}`;
        }

        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(shareLink)}&text=${encodeURIComponent(analysisText)}`;
        window.Telegram.WebApp.openTelegramLink(shareUrl);
        logger.info('Analysis link shared via Telegram');
      } else {
        // Fallback - копируем текст в буфер обмена
        this.shareFallbackText();
      }
    } catch (error) {
      logger.error('Failed to share analysis', error);
      this.shareFallbackText();
    }
  }

  /**
   * Генерирует уникальный ID для sharing анализа
   */
  private generateAnalysisShareId(): string {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substr(2, 9);
    return `shared_${timestamp}_${randomPart}`;
  }

  /**
   * Сохраняет данные анализа для sharing в localStorage и на сервере
   */
  private async saveAnalysisForSharing(analysisId: string): Promise<void> {
    try {
      logger.info('Starting saveAnalysisForSharing', { analysisId });

      if (!this.currentAnalysisData.imageSrc || !this.currentAnalysisData.analysisText) {
        logger.warn('No analysis data to save for sharing');
        return;
      }

      // Используем сжатую версию фото для отправки на сервер (меньше размера)
      const compressedPhoto = await this.compressImageForSharing(this.currentAnalysisData.imageSrc);

      const sharedData = {
        photo: compressedPhoto,
        analysis: this.currentAnalysisData.analysisText,
        timestamp: new Date().toISOString(),
        sharedAt: new Date().toISOString()
      };

      logger.info('Prepared shared data', {
        analysisId,
        originalPhotoLength: this.currentAnalysisData.imageSrc.length,
        compressedPhotoLength: compressedPhoto.length,
        hasAnalysis: !!sharedData.analysis,
        analysisLength: sharedData.analysis.length
      });

      // Сохраняем в localStorage с проверкой размера и безопасным JSON
      try {
        const jsonString = JSON.stringify(sharedData);
        const sizeKB = (jsonString.length * 2) / 1024; // Приблизительный размер в KB

        // Проверяем размер данных (localStorage лимит ~5-10MB)
        if (sizeKB > 3000) { // 3MB лимит
          // Создаем минимальную версию только с текстом
          const minimalData = {
            analysis: sharedData.analysis,
            timestamp: sharedData.timestamp,
            sharedAt: sharedData.sharedAt,
            photo: 'too_large'
          };

          localStorage.setItem(`shared_analysis_${analysisId}`, JSON.stringify(minimalData));
          logger.info('Minimal analysis saved to localStorage', { analysisId });
        } else {
          localStorage.setItem(`shared_analysis_${analysisId}`, jsonString);
          logger.info('Full analysis saved to localStorage', { analysisId });
        }
      } catch (localStorageError) {
        logger.error('Failed to save to localStorage', { analysisId, error: localStorageError });

        // Создаем текстовую версию без изображения
        try {
          const textOnlyData = {
            analysis: sharedData.analysis,
            timestamp: sharedData.timestamp,
            sharedAt: sharedData.sharedAt,
            photo: null
          };
          localStorage.setItem(`shared_analysis_${analysisId}`, JSON.stringify(textOnlyData));
          logger.info('Text-only analysis saved to localStorage as fallback', { analysisId });
        } catch (finalError) {
          logger.error('All localStorage save attempts failed', { analysisId, error: finalError });
        }
      }

      // Отправляем на сервер для доступа других пользователей
      const shouldSendToServer = typeof sharedData.photo === 'string' && sharedData.photo !== 'too_large';

      if (shouldSendToServer) {
        try {
          logger.info('Making direct POST request to server', { analysisId });

        const requestBody = {
          analysisId,
          photo: sharedData.photo,
          analysis: sharedData.analysis,
          timestamp: sharedData.timestamp
        };

        const response = await fetch('https://tgstyle.flappy.crazedns.ru/api/shared-analysis', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody)
        });

        const result = await response.json();

          if (result.success) {
            logger.info('Analysis shared successfully', { analysisId });
          } else {
            logger.warn('Server save failed', { error: result.error });
          }
        } catch (serverError) {
          logger.warn('Server save failed, analysis only available locally', { analysisId });
        }
      }
    } catch (error) {
      logger.error('Failed to save analysis for sharing', { analysisId, error });
    }
  }

  /**
   * Сжимает изображение для отправки на сервер (упрощенная версия)
   */
  private async compressImageForSharing(base64Image: string): Promise<string> {
    try {
      // Убираем префикс data:image/jpeg;base64, если он есть
      const cleanBase64 = base64Image.replace(/^data:image\/[^;]+;base64,/, '');

      // Проверяем размер
      const currentSizeKB = (cleanBase64.length * 3) / 4 / 1024;
      const maxSizeKB = 500;

      if (currentSizeKB <= maxSizeKB) {
        return cleanBase64;
      }

      // Если изображение слишком большое, пытаемся сжать через cameraManager
      try {
        const compressed = await cameraManager.compressImage(`data:image/jpeg;base64,${cleanBase64}`, 0.6);
        logger.info('Image compressed for server sharing', {
          originalSizeKB: Math.round(currentSizeKB),
          compressedSizeKB: Math.round((compressed.length * 3) / 4 / 1024),
          quality: 0.6
        });
        return compressed;
      } catch (compressionError) {
        logger.warn('Compression failed, using original with size limit', compressionError);
        // Если сжатие не удалось, обрезаем изображение до допустимого размера
        const maxLength = Math.floor(maxSizeKB * 1024 * 4 / 3);
        return cleanBase64.substring(0, maxLength);
      }
    } catch (error) {
      logger.error('Failed to process image for sharing', error);
      // В крайнем случае возвращаем первые 100KB изображения
      const cleanBase64 = base64Image.replace(/^data:image\/[^;]+;base64,/, '');
      const emergencyMaxLength = Math.floor(100 * 1024 * 4 / 3); // 100KB
      return cleanBase64.substring(0, emergencyMaxLength);
    }
  }

  /**
   * Fallback функция - отправляет текстовое сообщение
   */
  private shareFallbackText(): void {
    const shareText = 'Посмотрите мой анализ стиля одежды от TgStyle! ИИ помог мне разобраться в моем образе 🤖✨';
    navigator.clipboard.writeText(shareText).then(() => {
      logger.info('Fallback share text copied to clipboard');
    }).catch(() => {
      logger.warn('Failed to copy fallback text to clipboard');
    });
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
    logger.info('Initializing Analysis UI Manager');
    // Здесь можно добавить дополнительную инициализацию если нужно
    logger.info('Analysis UI Manager initialized successfully');
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
}

// Создаем глобальный экземпляр менеджера анализа
export const uiAnalysisManager = new UIAnalysisManager();

// Импортируем необходимые зависимости для обратной совместимости
import { APP_CONFIG } from '@/utils/constants';

// Глобальные переменные для обратной совместимости
declare global {
  var loadingTextAnimator: any;
}

// Инициализируем глобальные переменные
globalThis.loadingTextAnimator = loadingTextAnimator;
